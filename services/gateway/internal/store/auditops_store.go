package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ---------------------------------------------------------------------------
// Audit ops: daftar sesi + detail lengkap (FR-AUDIT-D1).
// ---------------------------------------------------------------------------

type AuditSessionRow struct {
	ID            string     `json:"id"`
	StoreID       string     `json:"store_id"`
	StoreName     string     `json:"store_name"`
	PlanogramID   *string    `json:"planogram_id"`
	PlanogramName *string    `json:"planogram_name"`
	Status        string     `json:"status"`
	Score         *int       `json:"score"`
	ImageCount    int        `json:"image_count"`
	FailedCount   int        `json:"failed_count"`
	StartedAt     *time.Time `json:"started_at"`
	CreatedAt     time.Time  `json:"created_at"`
}

type AuditImageRow struct {
	ID             string     `json:"id"`
	Status         string     `json:"status"`
	Error          *string    `json:"error"`
	Width          *int       `json:"width"`
	Height         *int       `json:"height"`
	URL            string     `json:"url"`
	Attempts       int        `json:"attempts"`
	StorageKey     string     `json:"storage_key"`
	Mime           string     `json:"mime"`
	SizeBytes      int64      `json:"size_bytes"`
	LowConfidence  bool       `json:"low_confidence"`
	UploadedAt     time.Time  `json:"uploaded_at"`
}

type DetectionOut struct {
	ID          string   `json:"id"`
	ImageID     string   `json:"image_id"`
	BBox        []float64 `json:"bbox"`
	Confidence  float64  `json:"confidence"`
	Label       *string  `json:"label"`
	LabelScore  *float64 `json:"label_score"`
	RowIndex    *int     `json:"row_index"`
	Source      string   `json:"source"`
	CorrectedBy *string  `json:"corrected_by"`
}

type AuditMetricsOut struct {
	FacingTotal     int             `json:"facing_total"`
	OosCount        int             `json:"oos_count"`
	PriceMismatch   int             `json:"price_mismatch"`
	PriceRead       int             `json:"price_read"`
	ComplianceScore *int            `json:"compliance_score"`
	Breakdown       json.RawMessage `json:"breakdown"`
}

type AuditDetailOut struct {
	Session           AuditSessionRow          `json:"session"`
	StoreID           string                   `json:"store_id"`
	StoreName         string                   `json:"store_name"`
	Region            string                   `json:"region"`
	Status            string                   `json:"status"`
	StartedAt         *time.Time               `json:"started_at"`
	FinishedAt        *time.Time               `json:"finished_at"`
	CreatedAt         time.Time                `json:"created_at"`
	Score             *int                     `json:"score"`
	Images            []AuditImageRow          `json:"images"`
	Metrics           AuditMetricsOut          `json:"metrics"`
	DetectionsByImage map[string][]DetectionOut `json:"detections_by_image"`
	PlanogramTargets  json.RawMessage          `json:"planogram_targets"`
}

func (s *Store) ListAudits(ctx context.Context, ws uuid.UUID, storeID, status string, limit, offset int) ([]AuditSessionRow, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	const q = `
	SELECT s.id::text, s.store_id::text, st.name, s.planogram_id::text, p.name,
	       s.status, s.score, s.started_at, s.created_at,
	       (SELECT count(*)::int FROM audit_images ai WHERE ai.session_id = s.id),
	       (SELECT count(*)::int FROM audit_images ai WHERE ai.session_id = s.id AND ai.status = 'failed')
	FROM audit_sessions s
	JOIN stores st ON st.id = s.store_id
	LEFT JOIN planograms p ON p.id = s.planogram_id
	WHERE s.workspace_id = $1 AND s.deleted_at IS NULL
	  AND ($2 = '' OR s.store_id::text = $2)
	  AND ($3 = '' OR s.status = $3)
	ORDER BY s.created_at DESC
	LIMIT $4 OFFSET $5`
	rows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, q, ws, storeID, status, limit, offset)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	out := []AuditSessionRow{}
	for rows.Next() {
		var a AuditSessionRow
		if err := rows.Scan(&a.ID, &a.StoreID, &a.StoreName, &a.PlanogramID, &a.PlanogramName,
			&a.Status, &a.Score, &a.StartedAt, &a.CreatedAt, &a.ImageCount, &a.FailedCount); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) GetAuditDetail(ctx context.Context, ws uuid.UUID, sessionID string) (*AuditDetailOut, error) {
	const head = `
	SELECT s.id::text, st.id::text, st.name, st.region, s.status, s.score,
	       s.started_at, s.finished_at, s.created_at, s.planogram_id::text, p.config
	FROM audit_sessions s
	JOIN stores st ON st.id = s.store_id
	LEFT JOIN planograms p ON p.id = s.planogram_id
	WHERE s.id = $1 AND s.workspace_id = $2 AND s.deleted_at IS NULL`
	row, cleanup, err := s.QueryRowWorkspace(ctx, ws, uuid.Nil, head, sessionID, ws)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	out := &AuditDetailOut{
		DetectionsByImage: map[string][]DetectionOut{},
	}
	var planogramID *string
	var planogramCfg json.RawMessage
	if err := row.Scan(&out.Session.ID, &out.StoreID, &out.StoreName, &out.Region, &out.Status,
		&out.Score, &out.StartedAt, &out.FinishedAt, &out.CreatedAt, &planogramID, &planogramCfg); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get audit detail: %w", err)
	}
	out.Session.StoreID = out.StoreID
	out.Session.StoreName = out.StoreName
	out.Session.Status = out.Status
	out.Session.Score = out.Score
	out.Session.StartedAt = out.StartedAt
	out.Session.CreatedAt = out.CreatedAt
	out.Session.PlanogramID = planogramID
	out.PlanogramTargets = planogramCfg
	if out.PlanogramTargets == nil {
		out.PlanogramTargets = json.RawMessage("{}")
	}

	cleanup()

	imgRows, c2, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT id::text, status, error, width, height, storage_key, mime, size_bytes,
		       low_confidence, attempts, created_at
		FROM audit_images
		WHERE workspace_id = $1 AND session_id::text = $2
		ORDER BY created_at`, ws, sessionID)
	if err != nil {
		return nil, err
	}
	defer c2()
	imageIDs := []string{}
	for imgRows.Next() {
		var im AuditImageRow
		if err := imgRows.Scan(&im.ID, &im.Status, &im.Error, &im.Width, &im.Height, &im.StorageKey,
			&im.Mime, &im.SizeBytes, &im.LowConfidence, &im.Attempts, &im.UploadedAt); err != nil {
			return nil, err
		}
		im.URL = "/api/v1/images/" + im.ID + "/content"
		out.Images = append(out.Images, im)
		imageIDs = append(imageIDs, im.ID)
	}
	if err := imgRows.Err(); err != nil {
		return nil, err
	}

	out.Session.ImageCount = len(out.Images)
	failed := 0
	for _, im := range out.Images {
		if im.Status == "failed" {
			failed++
		}
	}
	out.Session.FailedCount = failed

	if len(imageIDs) > 0 {
		dtRows, c3, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
			SELECT id::text, image_id::text, x1, y1, x2, y2, confidence::float8, label, label_score::float8,
			       row_index, source, corrected_by::text
			FROM detections
			WHERE workspace_id = $1 AND image_id::text = ANY($2::text[]) AND deleted_at IS NULL
			ORDER BY image_id, created_at`, ws, imageIDs)
		if err != nil {
			return nil, err
		}
		defer c3()
		for dtRows.Next() {
			var d DetectionOut
			d.BBox = make([]float64, 4)
			if err := dtRows.Scan(&d.ID, &d.ImageID, &d.BBox[0], &d.BBox[1], &d.BBox[2], &d.BBox[3],
				&d.Confidence, &d.Label, &d.LabelScore, &d.RowIndex, &d.Source, &d.CorrectedBy); err != nil {
				return nil, err
			}
			out.DetectionsByImage[d.ImageID] = append(out.DetectionsByImage[d.ImageID], d)
		}
		if err := dtRows.Err(); err != nil {
			return nil, err
		}
	}

	mRow, c4, err := s.QueryRowWorkspace(ctx, ws, uuid.Nil, `
		SELECT facing_total, oos_count, price_mismatch, price_read, compliance_score, breakdown
		FROM audit_metrics WHERE workspace_id = $1 AND session_id = $2`, ws, sessionID)
	if err != nil {
		return nil, err
	}
	defer c4()
	if err := mRow.Scan(&out.Metrics.FacingTotal, &out.Metrics.OosCount, &out.Metrics.PriceMismatch,
		&out.Metrics.PriceRead, &out.Metrics.ComplianceScore, &out.Metrics.Breakdown); err != nil {
		if err != pgx.ErrNoRows {
			return nil, err
		}
	}
	if out.Metrics.Breakdown == nil {
		out.Metrics.Breakdown = json.RawMessage("{}")
	}
	return out, nil
}
