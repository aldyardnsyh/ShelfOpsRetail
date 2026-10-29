package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ---------------------------------------------------------------------------
// Dashboard (M5). Semua angka dihitung dari tabel — tidak ada angka hard-code.
// ---------------------------------------------------------------------------

type Kpis struct {
	AuditsTotal       int                `json:"audits_total"`
	AvgCompliance     *float64           `json:"avg_compliance"`
	OosRate           *float64           `json:"oos_rate"`
	PriceMismatchRate *float64           `json:"price_mismatch_rate"`
	StoresCount       int                `json:"stores_count"`
	FacingTotal       int                `json:"facing_total"`
	OosCount          int                `json:"oos_count"`
	Deltas            map[string]float64 `json:"deltas"`
	Period            struct {
		From string `json:"from"`
		To   string `json:"to"`
	} `json:"period"`
}

type TrendPoint struct {
	Date       string  `json:"date"`
	Compliance float64 `json:"compliance"`
	OosRate    float64 `json:"oos_rate"`
	Audits     int     `json:"audits"`
}

type StoreRank struct {
	StoreID         string     `json:"store_id"`
	StoreName       string     `json:"store_name"`
	Region          string     `json:"region"`
	AvgCompliance   float64    `json:"avg_compliance"`
	OosRate         float64    `json:"oos_rate"`
	Audits          int        `json:"audits"`
	LastAuditAt     *time.Time `json:"last_audit_at"`
	DeltaCompliance *float64   `json:"delta_compliance,omitempty"`
	DeltaOosRate    *float64   `json:"delta_oos_rate,omitempty"`
}

type Alert struct {
	ID        string    `json:"id"`
	StoreID   string    `json:"store_id"`
	StoreName string    `json:"store_name"`
	Type      string    `json:"type"`
	Severity  string    `json:"severity"`
	Status    string    `json:"status"`
	SessionID *string   `json:"session_id"`
	Detail    string    `json:"detail"`
	CreatedAt time.Time `json:"created_at"`
}

type Period struct {
	From time.Time
	To   time.Time
}

func DefaultPeriod(from, to string) Period {
	p := Period{From: time.Now().AddDate(0, 0, -29), To: time.Now()}
	if from != "" {
		if t, err := time.Parse("2006-01-02", from); err == nil {
			p.From = t
		}
	}
	if to != "" {
		if t, err := time.Parse("2006-01-02", to); err == nil {
			p.To = t.AddDate(0, 0, 1)
		}
	}
	return p
}

// QueryKpis menghitung KPI + delta terhadap periode sebelumnya dengan panjang sama.
func (s *Store) QueryKpis(ctx context.Context, ws uuid.UUID, p Period) (*Kpis, error) {
	const q = `
	WITH cur AS (
	  SELECT count(*)::int AS audits,
	         avg(m.compliance_score)::float8 AS avg_compliance,
	         sum(m.facing_total)::int AS facing_total,
	         sum(m.oos_count)::int AS oos_count,
	         sum(m.price_read)::int AS price_read,
	         sum(m.price_mismatch)::int AS price_mismatch
	  FROM audit_sessions s
	  JOIN audit_metrics m ON m.session_id = s.id
	  WHERE s.workspace_id = $1 AND s.deleted_at IS NULL
	    AND s.status IN ('review','final','partial')
	    AND s.audit_date >= $2 AND s.audit_date < $3
	), prev AS (
	  SELECT count(*)::int AS audits,
	         avg(m.compliance_score)::float8 AS avg_compliance,
	         sum(m.facing_total)::int AS facing_total,
	         sum(m.oos_count)::int AS oos_count,
	         sum(m.price_read)::int AS price_read,
	         sum(m.price_mismatch)::int AS price_mismatch
	  FROM audit_sessions s
	  JOIN audit_metrics m ON m.session_id = s.id
	  WHERE s.workspace_id = $1 AND s.deleted_at IS NULL
	    AND s.status IN ('review','final','partial')
	    AND s.audit_date >= $4 AND s.audit_date < $2
	)
	SELECT cur.audits, cur.avg_compliance, cur.facing_total, cur.oos_count, cur.price_read, cur.price_mismatch,
	       prev.avg_compliance, prev.oos_count, prev.facing_total,
	       (SELECT count(*)::int FROM stores st WHERE st.workspace_id = $1 AND st.deleted_at IS NULL)
	FROM cur, prev`

	var k Kpis
	var curAvg, prevAvg *float64
	var curFacing, curOos, curPriceRead, curPriceMismatch int
	var prevOos, prevFacing int
	prevFrom := p.From.Add(-p.To.Sub(p.From))

	row, cleanup, err := s.QueryRowWorkspace(ctx, ws, uuid.Nil, q, ws, p.From, p.To, prevFrom)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	if err := row.Scan(&k.AuditsTotal, &curAvg, &curFacing, &curOos, &curPriceRead, &curPriceMismatch,
		&prevAvg, &prevOos, &prevFacing, &k.StoresCount); err != nil {
		if err == pgx.ErrNoRows {
			return &k, nil
		}
		return nil, fmt.Errorf("query kpis: %w", err)
	}

	k.AvgCompliance = curAvg
	k.FacingTotal = curFacing
	k.OosCount = curOos
	if curFacing > 0 {
		v := float64(curOos) / float64(curFacing) * 100
		k.OosRate = &v
	}
	if curPriceRead > 0 {
		v := float64(curPriceMismatch) / float64(curPriceRead) * 100
		k.PriceMismatchRate = &v
	}
	k.Deltas = map[string]float64{}
	if curAvg != nil && prevAvg != nil {
		k.Deltas["avg_compliance"] = round2(*curAvg - *prevAvg)
	}
	if curFacing > 0 && prevFacing > 0 {
		curRate := float64(curOos) / float64(curFacing) * 100
		prevRate := float64(prevOos) / float64(prevFacing) * 100
		k.Deltas["oos_rate"] = round2(curRate - prevRate)
	}
	k.Period.From = p.From.Format("2006-01-02")
	k.Period.To = p.To.AddDate(0, 0, -1).Format("2006-01-02")
	return &k, nil
}

func (s *Store) QueryTrend(ctx context.Context, ws uuid.UUID, p Period, region string) ([]TrendPoint, error) {
	const q = `
	SELECT s.audit_date::text AS day,
	       coalesce(avg(m.compliance_score) FILTER (WHERE m.compliance_score IS NOT NULL), 0)::float8 AS compliance,
	       CASE WHEN coalesce(sum(m.facing_total),0) > 0
	            THEN (sum(m.oos_count)::float8 / sum(m.facing_total)::float8 * 100)
	            ELSE 0 END AS oos_rate,
	       count(*)::int AS audits
	FROM audit_sessions s
	JOIN audit_metrics m ON m.session_id = s.id
	JOIN stores st ON st.id = s.store_id
	WHERE s.workspace_id = $1 AND s.deleted_at IS NULL
	  AND s.status IN ('review','final','partial')
	  AND s.audit_date >= $2 AND s.audit_date < $3
	  AND ($4 = '' OR st.region = $4)
	GROUP BY s.audit_date
	ORDER BY s.audit_date`
	rows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, q, ws, p.From, p.To, region)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	out := []TrendPoint{}
	for rows.Next() {
		var t TrendPoint
		if err := rows.Scan(&t.Date, &t.Compliance, &t.OosRate, &t.Audits); err != nil {
			return nil, err
		}
		t.Compliance = round2(t.Compliance)
		t.OosRate = round2(t.OosRate)
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) QueryRanking(ctx context.Context, ws uuid.UUID, p Period, region string, limit int, order string) ([]StoreRank, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	if order != "worst" {
		order = "best"
	}
	prevFrom := p.From.Add(-p.To.Sub(p.From))
	const q = `
	WITH cur AS (
	  SELECT st.id, st.name, st.region,
	         coalesce(avg(m.compliance_score) FILTER (WHERE m.compliance_score IS NOT NULL), 0)::float8 AS avg_compliance,
	         CASE WHEN coalesce(sum(m.facing_total),0) > 0
	              THEN (sum(m.oos_count)::float8 / sum(m.facing_total)::float8 * 100)
	              ELSE 0 END AS oos_rate,
	         count(s.id)::int AS audits,
	         max(s.created_at) AS last_audit_at
	  FROM stores st
	  JOIN audit_sessions s
	    ON s.store_id = st.id AND s.deleted_at IS NULL
	   AND s.status IN ('review','final','partial')
	   AND s.audit_date >= $2 AND s.audit_date < $3
	  LEFT JOIN audit_metrics m ON m.session_id = s.id
	  WHERE st.workspace_id = $1 AND st.deleted_at IS NULL
	    AND ($4 = '' OR st.region = $4)
	  GROUP BY st.id, st.name, st.region
	), prev AS (
	  SELECT s.store_id,
	         avg(m.compliance_score) FILTER (WHERE m.compliance_score IS NOT NULL)::float8 AS avg_compliance,
	         sum(m.oos_count)::int AS oos_count,
	         sum(m.facing_total)::int AS facing_total
	  FROM audit_sessions s
	  JOIN audit_metrics m ON m.session_id = s.id
	  WHERE s.workspace_id = $1 AND s.deleted_at IS NULL
	    AND s.status IN ('review','final','partial')
	    AND s.audit_date >= $7 AND s.audit_date < $2
	  GROUP BY s.store_id
	)
	SELECT cur.id::text, cur.name, cur.region, cur.avg_compliance, cur.oos_rate,
	       cur.audits, cur.last_audit_at, prev.avg_compliance,
	       CASE WHEN coalesce(prev.facing_total,0) > 0
	            THEN (prev.oos_count::float8 / prev.facing_total::float8 * 100)
	            END AS prev_oos_rate
	FROM cur
	LEFT JOIN prev ON prev.store_id = cur.id
	ORDER BY CASE WHEN $6 = 'worst' THEN cur.avg_compliance END ASC,
	         CASE WHEN $6 <> 'worst' THEN cur.avg_compliance END DESC,
	         cur.audits DESC
	LIMIT $5`
	rows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, q, ws, p.From, p.To, region, limit, order, prevFrom)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	out := []StoreRank{}
	for rows.Next() {
		var r StoreRank
		var prevAvg, prevOos *float64
		if err := rows.Scan(&r.StoreID, &r.StoreName, &r.Region, &r.AvgCompliance, &r.OosRate,
			&r.Audits, &r.LastAuditAt, &prevAvg, &prevOos); err != nil {
			return nil, err
		}
		r.AvgCompliance = round2(r.AvgCompliance)
		r.OosRate = round2(r.OosRate)
		if prevAvg != nil {
			d := round2(r.AvgCompliance - *prevAvg)
			r.DeltaCompliance = &d
		}
		if prevOos != nil {
			d := round2(r.OosRate - *prevOos)
			r.DeltaOosRate = &d
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) ListAlerts(ctx context.Context, ws uuid.UUID, status, severity, typ, storeID string, limit, offset int) ([]Alert, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	const q = `
	SELECT a.id::text, a.store_id::text, st.name, a.type, a.severity, a.status,
	       a.session_id::text, a.detail, a.created_at
	FROM alerts a
	JOIN stores st ON st.id = a.store_id
	WHERE a.workspace_id = $1
	  AND ($2 = '' OR a.status = $2)
	  AND ($3 = '' OR a.severity = $3)
	  AND ($4 = '' OR a.type = $4)
	  AND ($5 = '' OR a.store_id::text = $5)
	ORDER BY a.created_at DESC
	LIMIT $6 OFFSET $7`
	rows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, q, ws, status, severity, typ, storeID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	out := []Alert{}
	for rows.Next() {
		var a Alert
		if err := rows.Scan(&a.ID, &a.StoreID, &a.StoreName, &a.Type, &a.Severity, &a.Status, &a.SessionID, &a.Detail, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) UpdateAlertStatus(ctx context.Context, ws, user uuid.UUID, alertID, status, note string) (*Alert, error) {
	const upd = `
	UPDATE alerts SET status = $1,
	       acknowledged_by = CASE WHEN $1 IN ('acknowledged','resolved') THEN $2 ELSE acknowledged_by END,
	       resolved_at = CASE WHEN $1 = 'resolved' THEN now() ELSE NULL END,
	       updated_at = now()
	WHERE id = $3 AND workspace_id = $4
	RETURNING id`
	var id string
	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, upd, status, user.String(), alertID, ws.String()).Scan(&id); err != nil {
			return err
		}
		action := "alert.update"
		switch status {
		case "acknowledged":
			action = "alert.acknowledge"
		case "resolved":
			action = "alert.resolve"
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO audit_logs (workspace_id, actor_id, action, entity, entity_id, detail)
			VALUES ($1,$2,$3,'alerts',$4, jsonb_build_object('status',$5::text,'note',$6::text))`,
			ws.String(), user.String(), action, alertID, status, note)
		return err
	})
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	rows, cleanup, err := s.ListWorkspace(ctx, ws, user, `
		SELECT a.id::text, a.store_id::text, st.name, a.type, a.severity, a.status,
		       a.session_id::text, a.detail, a.created_at
		FROM alerts a JOIN stores st ON st.id = a.store_id
		WHERE a.workspace_id = $1 AND a.id = $2`, ws, id)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	if !rows.Next() {
		return nil, ErrNotFound
	}
	var a Alert
	if err := rows.Scan(&a.ID, &a.StoreID, &a.StoreName, &a.Type, &a.Severity, &a.Status, &a.SessionID, &a.Detail, &a.CreatedAt); err != nil {
		return nil, err
	}
	return &a, nil
}

func round2(f float64) float64 {
	return float64(int64(f*100+0.5*sign(f))) / 100
}

func sign(f float64) float64 {
	if f < 0 {
		return -1
	}
	return 1
}
