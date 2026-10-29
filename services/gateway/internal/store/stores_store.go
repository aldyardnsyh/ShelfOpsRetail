package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// StoreKpis adalah KPI agregat satu toko (periode default: seluruh riwayat).
type StoreKpis struct {
	Audits        int        `json:"audits"`
	AvgCompliance *float64   `json:"avg_compliance"`
	OosRate       *float64   `json:"oos_rate"`
	FacingTotal   int        `json:"facing_total"`
	OosCount      int        `json:"oos_count"`
	LastAuditAt   *time.Time `json:"last_audit_at"`
}

// StoreDetail dipakai GET /stores/{storeId}.
type StoreDetail struct {
	Store      StoreRow  `json:"store"`
	Kpis       StoreKpis `json:"kpis"`
	OpenAlerts int       `json:"open_alerts"`
	AlertCount int       `json:"alert_count"`
}

func (s *Store) GetStoreDetail(ctx context.Context, ws uuid.UUID, storeID string) (*StoreDetail, error) {
	const q = `
	SELECT st.id::text, st.code, st.name, st.region, st.channel,
	       count(s.id) FILTER (WHERE s.status IN ('review','final','partial'))::int AS audits,
	       avg(m.compliance_score) FILTER (WHERE m.compliance_score IS NOT NULL)::float8 AS avg_compliance,
	       coalesce(sum(m.facing_total) FILTER (WHERE s.status IN ('review','final','partial')), 0)::int AS facing_total,
	       coalesce(sum(m.oos_count) FILTER (WHERE s.status IN ('review','final','partial')), 0)::int AS oos_count,
	       max(s.created_at) FILTER (WHERE s.status IN ('review','final','partial')) AS last_audit_at,
	       (SELECT count(*)::int FROM alerts a
	         WHERE a.store_id = st.id AND a.status = 'open') AS open_alerts,
	       (SELECT count(*)::int FROM alerts a
	         WHERE a.store_id = st.id) AS alert_count
	FROM stores st
	LEFT JOIN audit_sessions s
	  ON s.store_id = st.id AND s.deleted_at IS NULL
	LEFT JOIN audit_metrics m ON m.session_id = s.id
	WHERE st.id = $1 AND st.workspace_id = $2 AND st.deleted_at IS NULL
	GROUP BY st.id`
	var d StoreDetail
	row, cleanup, err := s.QueryRowWorkspace(ctx, ws, uuid.Nil, q, storeID, ws.String())
	if err != nil {
		return nil, err
	}
	defer cleanup()
	if err := row.Scan(&d.Store.ID, &d.Store.Code, &d.Store.Name, &d.Store.Region, &d.Store.Channel,
		&d.Kpis.Audits, &d.Kpis.AvgCompliance, &d.Kpis.FacingTotal, &d.Kpis.OosCount,
		&d.Kpis.LastAuditAt, &d.OpenAlerts, &d.AlertCount); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get store detail: %w", err)
	}
	if d.Kpis.AvgCompliance != nil {
		v := round2(*d.Kpis.AvgCompliance)
		d.Kpis.AvgCompliance = &v
	}
	if d.Kpis.FacingTotal > 0 {
		v := round2(float64(d.Kpis.OosCount) / float64(d.Kpis.FacingTotal) * 100)
		d.Kpis.OosRate = &v
	}
	return &d, nil
}
