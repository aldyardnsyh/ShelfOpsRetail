package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type SessionRow struct {
	ID         string    `json:"id"`
	StoreID    string    `json:"store_id"`
	StoreName  string    `json:"store_name"`
	Status     string    `json:"status"`
	Score      *int      `json:"score"`
	AuditDate  string    `json:"audit_date"`
	ImageCount int       `json:"image_count"`
	AlertCount int       `json:"alert_count"`
	CreatedAt  time.Time `json:"created_at"`
}

type SessionMetrics struct {
	FacingTotal     int            `json:"facing_total"`
	OosCount        int            `json:"oos_count"`
	PriceMismatch   int            `json:"price_mismatch"`
	PriceRead       int            `json:"price_read"`
	ComplianceScore *int           `json:"compliance_score"`
	Breakdown       map[string]any `json:"breakdown"`
}

type SessionImage struct {
	ID       string `json:"id"`
	Status   string `json:"status"`
	MIME     string `json:"mime"`
	Width    *int   `json:"width"`
	Height   *int   `json:"height"`
	Attempts int    `json:"attempts"`
}

// SessionItem adalah deteksi produk pada satu gambar (bbox piksel).
type SessionItem struct {
	ID         string    `json:"id"`
	ImageID    string    `json:"image_id"`
	Label      *string   `json:"label"`
	Confidence float64   `json:"confidence"`
	RowIndex   *int      `json:"row_index"`
	Source     string    `json:"source"`
	BBox       []float64 `json:"bbox"`
}

type SessionPriceMismatch struct {
	ID                string    `json:"id"`
	ImageID           string    `json:"image_id"`
	RawText           string    `json:"raw_text"`
	PriceIDR          *int64    `json:"price_idr"`
	ReferencePriceIDR *int64    `json:"reference_price_idr"`
	MatchedLabel      *string   `json:"matched_label"`
	BBox              []float64 `json:"bbox"`
}

type SessionDetail struct {
	Session         SessionRow             `json:"session"`
	Metrics         *SessionMetrics        `json:"metrics"`
	Images          []SessionImage         `json:"images"`
	Items           []SessionItem          `json:"items"`
	PriceMismatches []SessionPriceMismatch `json:"price_mismatches"`
}

func (s *Store) ListSessions(ctx context.Context, ws uuid.UUID, storeID string, limit, offset int) ([]SessionRow, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	const q = `
	SELECT s.id::text, s.store_id::text, st.name, s.status, s.score,
	       s.audit_date::text, s.created_at,
	       (SELECT count(*)::int FROM audit_images i WHERE i.session_id = s.id) AS image_count,
	       (SELECT count(*)::int FROM alerts a WHERE a.session_id = s.id) AS alert_count
	FROM audit_sessions s
	JOIN stores st ON st.id = s.store_id
	WHERE s.workspace_id = $1 AND s.deleted_at IS NULL
	  AND ($2 = '' OR s.store_id::text = $2)
	ORDER BY s.created_at DESC, s.id DESC
	LIMIT $3 OFFSET $4`
	rows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, q, ws.String(), storeID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	out := []SessionRow{}
	for rows.Next() {
		var r SessionRow
		if err := rows.Scan(&r.ID, &r.StoreID, &r.StoreName, &r.Status, &r.Score,
			&r.AuditDate, &r.CreatedAt, &r.ImageCount, &r.AlertCount); err != nil {
			return nil, fmt.Errorf("scan session: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) GetSessionDetail(ctx context.Context, ws uuid.UUID, sessionID string) (*SessionDetail, error) {
	out := &SessionDetail{
		Images:          []SessionImage{},
		Items:           []SessionItem{},
		PriceMismatches: []SessionPriceMismatch{},
	}
	err := s.WithWorkspace(ctx, ws, uuid.Nil, func(tx pgx.Tx) error {
		const qs = `
		SELECT s.id::text, s.store_id::text, st.name, s.status, s.score,
		       s.audit_date::text, s.created_at,
		       (SELECT count(*)::int FROM audit_images i WHERE i.session_id = s.id) AS image_count,
		       (SELECT count(*)::int FROM alerts a WHERE a.session_id = s.id) AS alert_count
		FROM audit_sessions s
		JOIN stores st ON st.id = s.store_id
		WHERE s.id = $1 AND s.workspace_id = $2 AND s.deleted_at IS NULL`
		if err := tx.QueryRow(ctx, qs, sessionID, ws.String()).Scan(
			&out.Session.ID, &out.Session.StoreID, &out.Session.StoreName, &out.Session.Status,
			&out.Session.Score, &out.Session.AuditDate, &out.Session.CreatedAt,
			&out.Session.ImageCount, &out.Session.AlertCount); err != nil {
			if err == pgx.ErrNoRows {
				return ErrNotFound
			}
			return fmt.Errorf("get session: %w", err)
		}

		var m SessionMetrics
		err := tx.QueryRow(ctx, `
			SELECT facing_total, oos_count, price_mismatch, price_read, compliance_score, breakdown
			FROM audit_metrics WHERE session_id = $1 AND workspace_id = $2`, sessionID, ws.String()).
			Scan(&m.FacingTotal, &m.OosCount, &m.PriceMismatch, &m.PriceRead, &m.ComplianceScore, &m.Breakdown)
		if err != nil && err != pgx.ErrNoRows {
			return fmt.Errorf("get metrics: %w", err)
		}
		if err == nil {
			out.Metrics = &m
		}

		rows, err := tx.Query(ctx, `
			SELECT id::text, status, mime, width, height, attempts
			FROM audit_images WHERE session_id = $1 AND workspace_id = $2
			ORDER BY created_at`, sessionID, ws.String())
		if err != nil {
			return fmt.Errorf("list images: %w", err)
		}
		for rows.Next() {
			var img SessionImage
			if err := rows.Scan(&img.ID, &img.Status, &img.MIME, &img.Width, &img.Height, &img.Attempts); err != nil {
				rows.Close()
				return err
			}
			out.Images = append(out.Images, img)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}

		detRows, err := tx.Query(ctx, `
			SELECT d.id::text, d.image_id::text, d.label, d.confidence, d.row_index, d.source,
			       d.x1, d.y1, d.x2, d.y2
			FROM detections d
			JOIN audit_images i ON i.id = d.image_id
			WHERE i.session_id = $1 AND d.workspace_id = $2 AND d.deleted_at IS NULL
			ORDER BY d.image_id, d.y1, d.x1`, sessionID, ws.String())
		if err != nil {
			return fmt.Errorf("list detections: %w", err)
		}
		for detRows.Next() {
			var it SessionItem
			var x1, y1, x2, y2 float64
			if err := detRows.Scan(&it.ID, &it.ImageID, &it.Label, &it.Confidence, &it.RowIndex,
				&it.Source, &x1, &y1, &x2, &y2); err != nil {
				detRows.Close()
				return err
			}
			it.BBox = []float64{x1, y1, x2, y2}
			out.Items = append(out.Items, it)
		}
		detRows.Close()
		if err := detRows.Err(); err != nil {
			return err
		}

		priceRows, err := tx.Query(ctx, `
			SELECT p.id::text, p.image_id::text, p.raw_text, p.price_idr, p.reference_price_idr,
			       p.matched_label, p.x1, p.y1, p.x2, p.y2
			FROM price_tags p
			JOIN audit_images i ON i.id = p.image_id
			WHERE i.session_id = $1 AND p.workspace_id = $2 AND p.mismatch = true
			ORDER BY p.image_id, p.y1, p.x1`, sessionID, ws.String())
		if err != nil {
			return fmt.Errorf("list price tags: %w", err)
		}
		for priceRows.Next() {
			var p SessionPriceMismatch
			var x1, y1, x2, y2 float64
			if err := priceRows.Scan(&p.ID, &p.ImageID, &p.RawText, &p.PriceIDR,
				&p.ReferencePriceIDR, &p.MatchedLabel, &x1, &y1, &x2, &y2); err != nil {
				priceRows.Close()
				return err
			}
			p.BBox = []float64{x1, y1, x2, y2}
			out.PriceMismatches = append(out.PriceMismatches, p)
		}
		priceRows.Close()
		return priceRows.Err()
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}
