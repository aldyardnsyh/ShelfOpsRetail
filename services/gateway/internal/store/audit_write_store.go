package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ---------------------------------------------------------------------------
// Audit tulis: sesi, gambar, deteksi, metrics.
//
// Alur: CreateAuditSession -> InsertAuditImage (per foto) -> gateway memanggil
// ai-vision -> ReplaceDetections -> ComputeAuditMetrics. Semua operasi memakai
// RLS workspace yang sama seperti endpoint baca.
// ---------------------------------------------------------------------------

type NewAuditImage struct {
	StorageKey string
	MIME       string
	SizeBytes  int64
	Width      *int
	Height     *int
}

type DetectionInput struct {
	X1         float64
	Y1         float64
	X2         float64
	Y2         float64
	Confidence float64
	Label      string
	LabelScore float64
	RowIndex   *int
}

type AuditImagePending struct {
	ID         string
	StorageKey string
}

func (s *Store) CreateAuditSession(
	ctx context.Context, ws, user uuid.UUID, storeID string, planogramID *string,
) (*AuditSessionRow, error) {
	var out AuditSessionRow
	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		var plan any
		if planogramID != nil && strings.TrimSpace(*planogramID) != "" {
			plan = *planogramID
		}
		return tx.QueryRow(ctx, `
			INSERT INTO audit_sessions (id, workspace_id, store_id, planogram_id, status, created_by)
			VALUES ($1, $2, $3, $4, 'draft', $5)
			RETURNING id::text, store_id::text,
			          (SELECT name FROM stores WHERE id = audit_sessions.store_id), status, created_at`,
			NewV7(), ws, storeID, plan, user,
		).Scan(&out.ID, &out.StoreID, &out.StoreName, &out.Status, &out.CreatedAt)
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (s *Store) InsertAuditImage(
	ctx context.Context, ws, user uuid.UUID, sessionID string, in NewAuditImage,
) (string, error) {
	imageID := NewV7()
	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			INSERT INTO audit_images (id, workspace_id, session_id, storage_key, mime, size_bytes, width, height, status)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'uploaded')`,
			imageID, ws, sessionID, in.StorageKey, in.MIME, in.SizeBytes, in.Width, in.Height,
		)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		_, err = tx.Exec(ctx, `UPDATE audit_sessions SET updated_at = now() WHERE id = $1`, sessionID)
		return err
	})
	if err != nil {
		return "", err
	}
	return imageID.String(), nil
}

// PendingAuditImages menandai sesi "processing" dan mengembalikan gambar yang
// belum diproses. Idempoten: gambar berstatus done dilewati.
func (s *Store) PendingAuditImages(
	ctx context.Context, ws, user uuid.UUID, sessionID string,
) ([]AuditImagePending, error) {
	out := []AuditImagePending{}
	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		var current string
		if err := tx.QueryRow(ctx, `SELECT status FROM audit_sessions WHERE id = $1`, sessionID).Scan(&current); err != nil {
			if err == pgx.ErrNoRows {
				return ErrNotFound
			}
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE audit_sessions
			SET status = 'processing', started_at = coalesce(started_at, now()), updated_at = now()
			WHERE id = $1`, sessionID); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `
			SELECT id::text, storage_key FROM audit_images
			WHERE session_id = $1 AND status IN ('uploaded','failed')
			ORDER BY created_at`, sessionID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var p AuditImagePending
			if err := rows.Scan(&p.ID, &p.StorageKey); err != nil {
				return err
			}
			out = append(out, p)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// ReplaceDetections mengganti deteksi model untuk satu gambar. Deteksi manual
// (koreksi manusia) tidak disentuh.
func (s *Store) ReplaceDetections(
	ctx context.Context, ws, user uuid.UUID, imageID string,
	boxes []DetectionInput, width, height int, lowConfidence bool,
) error {
	return s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx,
			`DELETE FROM detections WHERE image_id = $1 AND source = 'model'`, imageID); err != nil {
			return err
		}
		for _, b := range boxes {
			var label any
			if strings.TrimSpace(b.Label) != "" {
				label = strings.TrimSpace(b.Label)
			}
			var score any
			if b.LabelScore > 0 {
				score = b.LabelScore
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO detections (id, workspace_id, image_id, x1, y1, x2, y2, confidence, label, label_score, row_index, source)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'model')`,
				NewV7(), ws, imageID, b.X1, b.Y1, b.X2, b.Y2, b.Confidence, label, score, b.RowIndex,
			); err != nil {
				return err
			}
		}
		_, err := tx.Exec(ctx, `
			UPDATE audit_images
			SET status = 'done', error = NULL, attempts = attempts + 1,
			    width = coalesce(nullif($2, 0), width), height = coalesce(nullif($3, 0), height),
			    low_confidence = $4, updated_at = now()
			WHERE id = $1`, imageID, width, height, lowConfidence)
		return err
	})
}

func (s *Store) MarkAuditImageFailed(
	ctx context.Context, ws, user uuid.UUID, imageID, msg string,
) error {
	return s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			UPDATE audit_images
			SET status = 'failed', error = $2, attempts = attempts + 1, updated_at = now()
			WHERE id = $1`, imageID, msg)
		return err
	})
}

// ComputeAuditMetrics menghitung metrik dari deteksi tersimpan, menulis
// audit_metrics, lalu menutup sesi. Aturan yang dipakai (dan sengaja
// sederhana agar bisa diaudit):
//
//	facing_total = jumlah deteksi yang bukan gap/kosong
//	oos_count    = jumlah deteksi berlabel gap/empty/oos
//	compliance   = round(100 * (facing_total - oos) / facing_total), null bila
//	               tidak ada facing sama sekali
//
// Price mismatch dihitung dari price_tags yang sudah tersimpan (hasil OCR).
func (s *Store) ComputeAuditMetrics(
	ctx context.Context, ws, user uuid.UUID, sessionID string,
) (*AuditMetricsOut, error) {
	var m AuditMetricsOut
	var sessionStatus string
	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		var facing, gaps int
		if err := tx.QueryRow(ctx, `
			SELECT
			  count(*) FILTER (WHERE d.deleted_at IS NULL AND lower(coalesce(d.label,'')) NOT IN ('gap','empty','oos','kosong')),
			  count(*) FILTER (WHERE d.deleted_at IS NULL AND lower(coalesce(d.label,'')) IN ('gap','empty','oos','kosong'))
			FROM detections d
			JOIN audit_images i ON i.id = d.image_id
			WHERE i.session_id = $1`, sessionID,
		).Scan(&facing, &gaps); err != nil {
			return err
		}

		var mismatch, priceRead int
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FILTER (WHERE coalesce(pt.mismatch, pt.price_idr <> pt.reference_price_idr)),
			       count(*) FILTER (WHERE pt.price_idr IS NOT NULL AND pt.price_idr > 0)
			FROM price_tags pt
			JOIN audit_images i ON i.id = pt.image_id
			WHERE i.session_id = $1`, sessionID,
		).Scan(&mismatch, &priceRead); err != nil {
			return err
		}

		var score *int
		if facing > 0 {
			v := int(float64(facing-gaps)/float64(facing)*100 + 0.5)
			if v < 0 {
				v = 0
			}
			score = &v
		}

		var failed int
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM audit_images WHERE session_id = $1 AND status = 'failed'`, sessionID,
		).Scan(&failed); err != nil {
			return err
		}
		if failed > 0 {
			sessionStatus = "partial"
		} else {
			sessionStatus = "review"
		}

		breakdown, _ := json.Marshal(map[string]any{
			"facing_total":  facing,
			"oos_count":     gaps,
			"images_failed": failed,
			"formula":       "compliance = round(100*(facing-oos)/facing)",
		})

		if _, err := tx.Exec(ctx, `
			INSERT INTO audit_metrics (session_id, workspace_id, facing_total, oos_count, price_mismatch, price_read, compliance_score, breakdown, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
			ON CONFLICT (session_id) DO UPDATE SET
			  facing_total = excluded.facing_total, oos_count = excluded.oos_count,
			  price_mismatch = excluded.price_mismatch, price_read = excluded.price_read,
			  compliance_score = excluded.compliance_score, breakdown = excluded.breakdown,
			  updated_at = now()`,
			sessionID, ws, facing, gaps, mismatch, priceRead, score, breakdown,
		); err != nil {
			return err
		}

		_, err := tx.Exec(ctx, `
			UPDATE audit_sessions
			SET status = $2, score = $3, finished_at = now(), updated_at = now()
			WHERE id = $1`, sessionID, sessionStatus, score)
		if err != nil {
			return err
		}

		m.FacingTotal = facing
		m.OosCount = gaps
		m.PriceMismatch = mismatch
		m.PriceRead = priceRead
		m.ComplianceScore = score
		m.Breakdown = breakdown
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// AuditStartSummary adalah hasil ringkas POST /audits/{id}/start.
type AuditStartSummary struct {
	SessionID       string          `json:"session_id"`
	Status          string          `json:"status"`
	Score           *int            `json:"score"`
	ImagesProcessed int             `json:"images_processed"`
	ImagesFailed    int             `json:"images_failed"`
	Metrics         AuditMetricsOut `json:"metrics"`
	StartedAt       time.Time       `json:"started_at"`
	ErrorMessage    string          `json:"error,omitempty"`
}

func (s *Store) AuditSessionStatus(ctx context.Context, ws, user uuid.UUID, sessionID string) (string, int, error) {
	var status string
	var processed int
	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `SELECT status FROM audit_sessions WHERE id = $1`, sessionID).Scan(&status); err != nil {
			return err
		}
		return tx.QueryRow(ctx, `
			SELECT count(*) FROM audit_images WHERE session_id = $1 AND status = 'done'`, sessionID,
		).Scan(&processed)
	})
	if err != nil {
		return "", 0, fmt.Errorf("status sesi audit: %w", err)
	}
	return status, processed, nil
}

type PriceTagInput struct {
	X1                float64
	Y1                float64
	X2                float64
	Y2                float64
	RawText           string
	PriceIDR          int64
	OCRConfidence     float64
	MatchedLabel      string
	ReferencePriceIDR int64
	Mismatch          bool
}

// ReplacePriceTags mengganti price tag hasil OCR untuk satu gambar.
func (s *Store) ReplacePriceTags(
	ctx context.Context, ws, user uuid.UUID, imageID string, tags []PriceTagInput,
) error {
	if len(tags) == 0 {
		return nil
	}
	return s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM price_tags WHERE image_id = $1`, imageID); err != nil {
			return err
		}
		for _, t := range tags {
			if t.X2 <= t.X1 || t.Y2 <= t.Y1 {
				continue
			}
			var price any
			if t.PriceIDR > 0 {
				price = t.PriceIDR
			}
			var matched any
			if strings.TrimSpace(t.MatchedLabel) != "" {
				matched = strings.TrimSpace(t.MatchedLabel)
			}
			var reference any
			if t.ReferencePriceIDR > 0 {
				reference = t.ReferencePriceIDR
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO price_tags (id, workspace_id, image_id, x1, y1, x2, y2,
				  raw_text, price_idr, ocr_confidence, matched_label, reference_price_idr, mismatch)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
				NewV7(), ws, imageID, t.X1, t.Y1, t.X2, t.Y2,
				t.RawText, price, t.OCRConfidence, matched, reference, t.Mismatch,
			); err != nil {
				return err
			}
		}
		return nil
	})
}
