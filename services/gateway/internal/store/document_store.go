package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type DocumentRow struct {
	ID             string    `json:"id"`
	Title          string    `json:"title"`
	MIME           string    `json:"mime"`
	Language       string    `json:"language"`
	Status         string    `json:"status"`
	CurrentVersion int       `json:"current_version"`
	SizeBytes      int64     `json:"size_bytes"`
	ChunkCount     int       `json:"chunk_count"`
	Error          *string    `json:"error"`
	SourceURI      *string    `json:"source_uri"`
	LastIndexedAt  *time.Time `json:"last_indexed_at"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type NewDocument struct {
	Title     string
	MIME      string
	Language  string
	SourceURI string
	SizeBytes int64
	Checksum  string
}

// CreateUploadedDocument menyimpan metadata dokumen + versi aktif + job
// ingestion dalam satu transaksi. Worker kb_ingest masih placeholder.
func (s *Store) CreateUploadedDocument(ctx context.Context, ws, user uuid.UUID, in NewDocument) (*DocumentRow, error) {
	var doc DocumentRow
	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		docID := NewV7()
		if err := tx.QueryRow(ctx, `
			INSERT INTO documents (id, workspace_id, title, source_uri, mime, language, status, size_bytes, created_by)
			VALUES ($1,$2,$3,$4,$5,$6,'uploaded',$7,$8)
			RETURNING id::text, title, mime, language, status, current_version, size_bytes,
			          chunk_count, error, source_uri, created_at, updated_at`,
			docID, ws.String(), in.Title, in.SourceURI, in.MIME, in.Language, in.SizeBytes, user.String()).
			Scan(&doc.ID, &doc.Title, &doc.MIME, &doc.Language, &doc.Status, &doc.CurrentVersion,
				&doc.SizeBytes, &doc.ChunkCount, &doc.Error, &doc.SourceURI, &doc.CreatedAt, &doc.UpdatedAt); err != nil {
			return fmt.Errorf("insert document: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO document_versions (id, workspace_id, document_id, version, checksum, storage_key, size_bytes, status)
			VALUES ($1,$2,$3,1,$4,$5,$6,'active')`,
			NewV7(), ws.String(), doc.ID, in.Checksum, in.SourceURI, in.SizeBytes); err != nil {
			return fmt.Errorf("insert document version: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO ingestion_jobs (id, workspace_id, document_id, state)
			VALUES ($1,$2,$3,'queued')`, NewV7(), ws.String(), doc.ID); err != nil {
			return fmt.Errorf("insert ingestion job: %w", err)
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO audit_logs (workspace_id, actor_id, action, entity, entity_id, detail)
			VALUES ($1,$2,'document.upload','documents',$3,
			        jsonb_build_object('title',$4::text,'mime',$5::text,'size_bytes',$6::bigint))`,
			ws.String(), user.String(), doc.ID, in.Title, in.MIME, in.SizeBytes)
		return err
	})
	if err != nil {
		return nil, err
	}
	return &doc, nil
}

func (s *Store) ListDocuments(ctx context.Context, ws uuid.UUID, status string, limit, offset int) ([]DocumentRow, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	const q = `
	SELECT id::text, title, mime, language, status, current_version, size_bytes,
	       chunk_count, error, source_uri, last_indexed_at, created_at, updated_at
	FROM documents
	WHERE workspace_id = $1 AND deleted_at IS NULL
	  AND ($2 = '' OR status = $2)
	ORDER BY created_at DESC, id DESC
	LIMIT $3 OFFSET $4`
	rows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, q, ws.String(), status, limit, offset)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	out := []DocumentRow{}
	for rows.Next() {
		var d DocumentRow
		if err := rows.Scan(&d.ID, &d.Title, &d.MIME, &d.Language, &d.Status, &d.CurrentVersion,
			&d.SizeBytes, &d.ChunkCount, &d.Error, &d.SourceURI, &d.LastIndexedAt, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan document: %w", err)
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (s *Store) GetDocument(ctx context.Context, ws uuid.UUID, documentID string) (*DocumentRow, error) {
	const q = `
	SELECT d.id::text, d.title, d.mime, d.language, d.status, d.current_version, d.size_bytes,
	       (SELECT count(*)::int FROM chunks c
	         WHERE c.document_id = d.id AND c.version = d.current_version) AS chunk_count,
	       d.error, d.source_uri, d.last_indexed_at, d.created_at, d.updated_at
	FROM documents d
	WHERE d.id = $1 AND d.workspace_id = $2 AND d.deleted_at IS NULL`
	var d DocumentRow
	row, cleanup, err := s.QueryRowWorkspace(ctx, ws, uuid.Nil, q, documentID, ws.String())
	if err != nil {
		return nil, err
	}
	defer cleanup()
	if err := row.Scan(&d.ID, &d.Title, &d.MIME, &d.Language, &d.Status, &d.CurrentVersion,
		&d.SizeBytes, &d.ChunkCount, &d.Error, &d.SourceURI, &d.LastIndexedAt, &d.CreatedAt, &d.UpdatedAt); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get document: %w", err)
	}
	return &d, nil
}

// UpdateDocumentStatus memperbarui status ingestion (dipakai worker kb_ingest).
func (s *Store) UpdateDocumentStatus(ctx context.Context, ws uuid.UUID, documentID, status string, chunks int, errMsg *string) error {
	return s.WithWorkspace(ctx, ws, uuid.Nil, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			UPDATE documents SET status = $3, chunk_count = $4, error = $5, updated_at = now()
			WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
			documentID, ws.String(), status, chunks, errMsg)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		_, err = tx.Exec(ctx, `
			UPDATE ingestion_jobs SET state = $3, finished_at = now()
			WHERE id = (SELECT id FROM ingestion_jobs WHERE document_id = $1 AND workspace_id = $2
			            ORDER BY created_at DESC LIMIT 1)`,
			documentID, ws.String(), status)
		return err
	})
}

func (s *Store) SoftDeleteDocument(ctx context.Context, ws, user uuid.UUID, documentID string) error {
	return s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			UPDATE documents SET deleted_at = now(), updated_at = now()
			WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`, documentID, ws.String())
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO audit_logs (workspace_id, actor_id, action, entity, entity_id, detail)
			VALUES ($1,$2,'document.delete','documents',$3, '{}'::jsonb)`,
			ws.String(), user.String(), documentID)
		return err
	})
}
