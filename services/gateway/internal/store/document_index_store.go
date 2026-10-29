package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// ChunkRow satu potongan teks terindeks milik sebuah dokumen.
type ChunkRow struct {
	ID          string    `json:"id"`
	DocumentID  string    `json:"document_id"`
	Version     int       `json:"version"`
	Ordinal     int       `json:"ordinal"`
	Page        *int      `json:"page"`
	HeadingPath string    `json:"heading_path"`
	TokenCount  int       `json:"token_count"`
	Content     string    `json:"content"`
	CreatedAt   time.Time `json:"created_at"`
}

// DocumentVersionRow riwayat versi dokumen pada knowledge base.
type DocumentVersionRow struct {
	Version   int       `json:"version"`
	Status    string    `json:"status"`
	SizeBytes int64     `json:"size_bytes"`
	CreatedAt time.Time `json:"created_at"`
}

// DocumentChunks mengembalikan chunk versi aktif milik dokumen, sudah difilter
// dengan pencarian teks bebas bila q tidak kosong.
func (s *Store) DocumentChunks(ctx context.Context, ws uuid.UUID, documentID, q string, limit, offset int) ([]ChunkRow, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	rows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT c.id::text, c.document_id::text, c.version, c.ordinal, c.page,
		       c.heading_path, c.token_count, c.content, c.created_at
		FROM chunks c
		JOIN documents d ON d.id = c.document_id
		WHERE c.document_id = $1
		  AND c.workspace_id = $2
		  AND d.deleted_at IS NULL
		  AND c.version = d.current_version
		  AND ($3 = '' OR c.content ILIKE '%' || $3 || '%' OR c.heading_path ILIKE '%' || $3 || '%')
		ORDER BY c.ordinal
		LIMIT $4 OFFSET $5`,
		documentID, ws.String(), q, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("document chunks: %w", err)
	}
	defer cleanup()
	out := make([]ChunkRow, 0, limit)
	for rows.Next() {
		var c ChunkRow
		if err := rows.Scan(&c.ID, &c.DocumentID, &c.Version, &c.Ordinal, &c.Page,
			&c.HeadingPath, &c.TokenCount, &c.Content, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan document chunk: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// DocumentVersions mengembalikan riwayat versi dokumen (terbaru lebih dulu).
func (s *Store) DocumentVersions(ctx context.Context, ws uuid.UUID, documentID string) ([]DocumentVersionRow, error) {
	rows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT version, status, size_bytes, created_at
		FROM document_versions
		WHERE document_id = $1 AND workspace_id = $2
		ORDER BY version DESC`, documentID, ws.String())
	if err != nil {
		return nil, fmt.Errorf("document versions: %w", err)
	}
	defer cleanup()
	out := make([]DocumentVersionRow, 0, 4)
	for rows.Next() {
		var v DocumentVersionRow
		if err := rows.Scan(&v.Version, &v.Status, &v.SizeBytes, &v.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan document version: %w", err)
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// DocumentEmbeddingStatus menurunkan status embedding dari data chunk nyata:
// missing (belum ada chunk), pending (semua tanpa vektor), partial, ready.
func (s *Store) DocumentEmbeddingStatus(ctx context.Context, ws uuid.UUID, documentID string) (string, error) {
	var total, embedded int
	row, cleanup, err := s.QueryRowWorkspace(ctx, ws, uuid.Nil, `
		SELECT count(*)::int,
		       count(*) FILTER (WHERE c.embedding IS NOT NULL)::int
		FROM chunks c
		JOIN documents d ON d.id = c.document_id
		WHERE c.document_id = $1 AND c.workspace_id = $2
		  AND c.version = d.current_version`, documentID, ws.String())
	if err != nil {
		return "", fmt.Errorf("document embedding status: %w", err)
	}
	err = row.Scan(&total, &embedded)
	cleanup()
	if err != nil {
		return "", fmt.Errorf("scan embedding status: %w", err)
	}
	switch {
	case total == 0:
		return "missing", nil
	case embedded == total:
		return "ready", nil
	case embedded == 0:
		return "pending", nil
	default:
		return "partial", nil
	}
}
