package store

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ---------------------------------------------------------------------------
// Purchasing, tracking, monitoring, laparan, integrasi (read-only).
// ---------------------------------------------------------------------------

type SupplierRow struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Category     string  `json:"category"`
	LeadTimeDays int     `json:"lead_time_days"`
	OnTimePct    float64 `json:"on_time_pct"`
	Active       bool    `json:"active"`
}

type POLine struct {
	PoLineID    string `json:"po_line_id"`
	ProductID   string `json:"product_id"`
	SKU         string `json:"sku"`
	ProductName string `json:"product_name"`
	QtyOrder    int    `json:"qty_order"`
	QtyReceived int    `json:"qty_received"`
	UnitCostIDR int64  `json:"unit_cost_idr"`
}

type PurchaseOrderRow struct {
	ID           string     `json:"id"`
	PoCode       string     `json:"po_code"`
	SupplierID   string     `json:"supplier_id"`
	SupplierName string     `json:"supplier_name"`
	StoreID      string     `json:"store_id"`
	StoreName    string     `json:"store_name"`
	Status       string     `json:"status"`
	CreatedAt    time.Time  `json:"created_at"`
	ExpectedAt   *time.Time `json:"expected_at"`
	Lines        []POLine   `json:"lines"`
	TotalIDR     int64      `json:"total_idr"`
	Note         string     `json:"note"`
}

type GRNRow struct {
	ID           string    `json:"id"`
	Ref          string    `json:"ref"`
	PurchaseID   *string   `json:"po_id"`
	StoreID      string    `json:"store_id"`
	StoreName    string    `json:"store_name"`
	ProductID    string    `json:"product_id"`
	SKU          string    `json:"sku"`
	ProductName  string    `json:"product_name"`
	Qty          int       `json:"qty"`
	ValueIDR     int64     `json:"value_idr"`
	ReceivedAt   time.Time `json:"received_at"`
	Status       string    `json:"status"`
	SupplierName string    `json:"supplier_name"`
}

type PurchasingSummary struct {
	SuppliersActive int       `json:"suppliers_active"`
	POsOpen         int       `json:"pos_open"`
	POsTotal        int       `json:"pos_total"`
	ValueOpenIDR    int64     `json:"value_open_idr"`
	LateCount       int       `json:"late_count"`
	ReceivedCount   int       `json:"received_count"`
	AsOf            time.Time `json:"as_of"`
}

type PurchasingOverview struct {
	Summary        PurchasingSummary  `json:"summary"`
	Suppliers      []SupplierRow      `json:"suppliers"`
	PurchaseOrders []PurchaseOrderRow `json:"purchase_orders"`
	GRNs           []GRNRow           `json:"grns"`
	Notes          string             `json:"notes"`
}

func (s *Store) PurchasingOverviewAll(ctx context.Context, ws uuid.UUID) (*PurchasingOverview, error) {
	out := &PurchasingOverview{
		Suppliers:      []SupplierRow{},
		PurchaseOrders: []PurchaseOrderRow{},
		GRNs:           []GRNRow{},
		Notes:          "PO terbuka memicu restock ke inventory; GRN dihitung dari garis penerimaan qty_received > 0.",
	}

	spRows, c1, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT id::text, name, category, lead_time_days, on_time_pct::float8, active
		FROM suppliers WHERE workspace_id = $1 ORDER BY name`, ws)
	if err != nil {
		return nil, err
	}
	defer c1()
	for spRows.Next() {
		var sp SupplierRow
		if err := spRows.Scan(&sp.ID, &sp.Name, &sp.Category, &sp.LeadTimeDays, &sp.OnTimePct, &sp.Active); err != nil {
			return nil, err
		}
		out.Suppliers = append(out.Suppliers, sp)
	}
	if err := spRows.Err(); err != nil {
		return nil, err
	}
	for _, sp := range out.Suppliers {
		if sp.Active {
			out.Summary.SuppliersActive++
		}
	}

	poRows, c2, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT po.id::text, po.po_code, s.id::text, s.name, st.id::text, st.name, po.status, po.created_at,
		       po.expected_date::timestamptz, po.total_idr, ''::text,
		       (SELECT coalesce(jsonb_agg(jsonb_build_object(
		          'po_line_id', pl.id, 'product_id', p.id, 'sku', p.sku, 'product_name', p.name,
		          'qty_order', pl.qty_order, 'qty_received', pl.qty_received, 'unit_cost_idr', pl.unit_cost_idr
		       ) ORDER BY p.sku), '[]')::jsonb::text
		        FROM po_lines pl JOIN products p ON p.id = pl.product_id
		        WHERE pl.po_id = po.id)
		FROM purchase_orders po
		JOIN suppliers s ON s.id = po.supplier_id
		JOIN stores st ON st.id = po.store_id
		WHERE po.workspace_id = $1
		ORDER BY po.created_at DESC
		LIMIT 50`, ws)
	if err != nil {
		return nil, err
	}
	defer c2()
	for poRows.Next() {
		var po PurchaseOrderRow
		var linesText string
		if err := poRows.Scan(&po.ID, &po.PoCode, &po.SupplierID, &po.SupplierName, &po.StoreID, &po.StoreName,
			&po.Status, &po.CreatedAt, &po.ExpectedAt, &po.TotalIDR, &po.Note, &linesText); err != nil {
			return nil, err
		}
		if linesText == "" {
			linesText = "[]"
		}
		var parsed []POLine
		if err := json.Unmarshal([]byte(linesText), &parsed); err != nil {
			return nil, fmt.Errorf("parsing garis PO: %w", err)
		}
		po.Lines = parsed
		out.PurchaseOrders = append(out.PurchaseOrders, po)
	}
	if err := poRows.Err(); err != nil {
		return nil, err
	}

	sumRow, c3, err := s.QueryRowWorkspace(ctx, ws, uuid.Nil, `
		SELECT
		  (SELECT count(*)::int FROM purchase_orders WHERE workspace_id = $1),
		  (SELECT count(*)::int FROM purchase_orders WHERE workspace_id = $1 AND status IN ('draft','sent','confirmed','receiving')),
		  (SELECT coalesce(sum(total_idr), 0)::bigint FROM purchase_orders WHERE workspace_id = $1 AND status IN ('draft','sent','confirmed','receiving')),
		  (SELECT count(*)::int FROM purchase_orders WHERE workspace_id = $1 AND expected_date < current_date AND status IN ('draft','sent','confirmed')),
		  (SELECT count(*)::int FROM purchase_orders WHERE workspace_id = $1 AND status = 'received'),
		  now()`, ws)
	if err != nil {
		return nil, err
	}
	defer c3()
	if err := sumRow.Scan(&out.Summary.POsTotal, &out.Summary.POsOpen, &out.Summary.ValueOpenIDR,
		&out.Summary.LateCount, &out.Summary.ReceivedCount, &out.Summary.AsOf); err != nil {
		if err != pgx.ErrNoRows {
			return nil, fmt.Errorf("purchasing summary: %w", err)
		}
	}

	grRows, c4, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT pl.id::text, 'GRN-' || substr(pl.id::text, 1, 8), po.id::text, po.store_id::text, st.name,
		       p.id::text, p.sku, p.name, pl.qty_received, (pl.qty_received * pl.unit_cost_idr)::bigint,
		       po.expected_date::timestamptz,
		       CASE WHEN pl.qty_received >= pl.qty_order THEN 'received' ELSE 'partial' END,
		       s.name
		FROM po_lines pl
		JOIN purchase_orders po ON po.id = pl.po_id
		JOIN suppliers s ON s.id = po.supplier_id
		JOIN stores st ON st.id = po.store_id
		JOIN products p ON p.id = pl.product_id
		WHERE pl.workspace_id = $1 AND pl.qty_received > 0
		ORDER BY po.created_at DESC
		LIMIT 50`, ws)
	if err != nil {
		return nil, err
	}
	defer c4()
	for grRows.Next() {
		var g GRNRow
		if err := grRows.Scan(&g.ID, &g.Ref, &g.PurchaseID, &g.StoreID, &g.StoreName,
			&g.ProductID, &g.SKU, &g.ProductName, &g.Qty, &g.ValueIDR, &g.ReceivedAt,
			&g.Status, &g.SupplierName); err != nil {
			return nil, err
		}
		out.GRNs = append(out.GRNs, g)
	}
	return out, grRows.Err()
}

type ShipmentRow struct {
	ID           string          `json:"id"`
	Poid         *string         `json:"po_id"`
	PoCode       *string         `json:"po_code"`
	SupplierName string          `json:"supplier_name"`
	Origin       string          `json:"origin"`
	Destination  string          `json:"destination"`
	Carrier      string          `json:"carrier"`
	TrackingNo   string          `json:"tracking_no"`
	ETA          *time.Time      `json:"eta"`
	Status       string          `json:"status"`
	ProgressPct  int             `json:"progress_pct"`
	Timeline     json.RawMessage `json:"timeline"`
	LastUpdate   *time.Time      `json:"last_update"`
	ItemsSummary string          `json:"items_summary"`
	TempOK       bool            `json:"temp_ok"`
}

func (s *Store) ListShipments(ctx context.Context, ws uuid.UUID, limit int) ([]ShipmentRow, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	const q = `
	SELECT sh.id::text, sh.po_id::text, po.po_code, sh.supplier_name, sh.origin, sh.destination, sh.carrier,
	       sh.tracking_no, sh.eta, sh.status, sh.progress_pct, sh.timeline, sh.last_update,
	       sh.items_summary, sh.temp_ok
FROM shipments sh
	LEFT JOIN purchase_orders po ON po.id = sh.po_id
	WHERE sh.workspace_id = $1
	ORDER BY sh.created_at DESC
	LIMIT $2`
	rows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, q, ws, limit)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	out := []ShipmentRow{}
	for rows.Next() {
		var sh ShipmentRow
		if err := rows.Scan(&sh.ID, &sh.Poid, &sh.PoCode, &sh.SupplierName, &sh.Origin, &sh.Destination,
			&sh.Carrier, &sh.TrackingNo, &sh.ETA, &sh.Status, &sh.ProgressPct, &sh.Timeline,
			&sh.LastUpdate, &sh.ItemsSummary, &sh.TempOK); err != nil {
			return nil, err
		}
		if sh.Timeline == nil {
			sh.Timeline = json.RawMessage("[]")
		}
		out = append(out, sh)
	}
	return out, rows.Err()
}

type MonitorHourPoint struct {
	Hour     int `json:"hour"`
	Visitors int `json:"visitors"`
}

type MonitorZone struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Footfall     int     `json:"footfall"`
	DwellSeconds int     `json:"dwell_seconds"`
	Share        float64 `json:"share"`
}

type MonitorCamera struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Zone   string `json:"zone"`
	Status string `json:"status"`
	FPS    int    `json:"fps"`
}

type MonitorVisitorRow struct {
	ID           string    `json:"id"`
	EnteredAt    time.Time `json:"entered_at"`
	DwellSeconds int       `json:"dwell_seconds"`
	Zone         string    `json:"zone"`
	Status       string    `json:"status"`
}

type MonitorHourDwell struct {
	Hour         int `json:"hour"`
	DwellSeconds int `json:"dwell_seconds"`
}

type MonitorOverview struct {
	Store           string              `json:"store"`
	StoreID         string              `json:"store_id"`
	VisitorsNow     int                 `json:"visitors_now"`
	FootfallToday   int                 `json:"footfall_today"`
	FootfallDelta   float64             `json:"footfall_delta"`
	AvgDwellSeconds int                 `json:"avg_dwell_seconds"`
	DwellDelta      float64             `json:"dwell_delta"`
	EmptyFacings    int                 `json:"empty_facings"`
	QueueSeconds    int                 `json:"queue_seconds"`
	CamerasOnline   int                 `json:"cameras_online"`
	CamerasTotal    int                 `json:"cameras_total"`
	Hourly          []MonitorHourPoint  `json:"hourly"`
	Zones           []MonitorZone       `json:"zones"`
	Cameras         []MonitorCamera     `json:"cameras"`
	Visitors        []MonitorVisitorRow `json:"visitors"`
	HourlyDwell     []MonitorHourDwell  `json:"hourly_dwell"`
}

func (s *Store) MonitorOverviewFor(ctx context.Context, ws uuid.UUID, storeID string) (*MonitorOverview, error) {
	out := &MonitorOverview{
		Hourly:      []MonitorHourPoint{},
		Zones:       []MonitorZone{},
		Cameras:     []MonitorCamera{},
		Visitors:    []MonitorVisitorRow{},
		HourlyDwell: []MonitorHourDwell{},
	}

	pickRows, c1, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT id::text, name FROM stores
		WHERE workspace_id = $1 AND deleted_at IS NULL AND ($2 = '' OR id::text = $2)
		ORDER BY name LIMIT 1`, ws, storeID)
	if err != nil {
		return nil, err
	}
	defer c1()
	if !pickRows.Next() {
		if err := pickRows.Err(); err != nil {
			return nil, err
		}
		return nil, ErrNotFound
	}
	if err := pickRows.Scan(&out.StoreID, &out.Store); err != nil {
		return nil, err
	}
	pickRows.Close()

	camRows, c2, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT c.id::text, c.name, coalesce(z.name, ''),
		       CASE c.status WHEN 'online' THEN 'online' ELSE 'offline' END, c.fps
		FROM cameras c LEFT JOIN zones z ON z.id = c.zone_id
		WHERE c.workspace_id = $1 AND c.store_id::text = $2
		ORDER BY c.name`, ws, out.StoreID)
	if err != nil {
		return nil, err
	}
	defer c2()
	for camRows.Next() {
		var mc MonitorCamera
		if err := camRows.Scan(&mc.ID, &mc.Name, &mc.Zone, &mc.Status, &mc.FPS); err != nil {
			return nil, err
		}
		out.Cameras = append(out.Cameras, mc)
	}
	if err := camRows.Err(); err != nil {
		return nil, err
	}
	out.CamerasTotal = len(out.Cameras)
	for _, mc := range out.Cameras {
		if mc.Status == "online" {
			out.CamerasOnline++
		}
	}

	zRows, c3, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT z.id::text, z.name, z.share::float8, z.dwell_seconds::int,
		       (SELECT count(*)::int FROM visitor_events ve
		        WHERE ve.zone_id = z.id AND ve.entered_at >= date_trunc('day', now()))
		FROM zones z
		WHERE z.workspace_id = $1 AND z.store_id::text = $2
		ORDER BY share DESC, z.name`, ws, out.StoreID)
	if err != nil {
		return nil, err
	}
	defer c3()
	for zRows.Next() {
		var mz MonitorZone
		if err := zRows.Scan(&mz.ID, &mz.Name, &mz.Share, &mz.DwellSeconds, &mz.Footfall); err != nil {
			return nil, err
		}
		out.Zones = append(out.Zones, mz)
	}
	if err := zRows.Err(); err != nil {
		return nil, err
	}

	hRows, c4, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		WITH hours AS (SELECT generate_series(0, 11) AS hoff),
		buckets AS (SELECT hoff, date_trunc('hour', now()) - make_interval(hours => hoff) AS bucket FROM hours),
		agg AS (
		  SELECT date_trunc('hour', entered_at) AS hour_ts, count(*)::int AS visits,
		         avg(dwell_seconds)::int AS dwell
		  FROM visitor_events
		  WHERE workspace_id = $1 AND store_id::text = $2 AND entered_at >= now() - interval '12 hours'
		  GROUP BY 1
		)
		SELECT extract(hour from b.bucket)::int,
		       coalesce((SELECT a.visits FROM agg a WHERE a.hour_ts = b.bucket), 0)::int,
		       coalesce((SELECT a.dwell FROM agg a WHERE a.hour_ts = b.bucket), 0)::int
		FROM buckets b
		ORDER BY b.bucket`, ws, out.StoreID)
	if err != nil {
		return nil, err
	}
	defer c4()
	for hRows.Next() {
		var hp MonitorHourPoint
		var hd MonitorHourDwell
		if err := hRows.Scan(&hp.Hour, &hp.Visitors, &hd.DwellSeconds); err != nil {
			return nil, err
		}
		hd.Hour = hp.Hour
		out.Hourly = append(out.Hourly, hp)
		out.HourlyDwell = append(out.HourlyDwell, hd)
	}
	if err := hRows.Err(); err != nil {
		return nil, err
	}

	vRows, c5, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT ve.id::text, ve.entered_at, ve.dwell_seconds, coalesce(z.name, ''),
		       CASE ve.status WHEN 'in' THEN 'in_store' ELSE 'checked_out' END
		FROM visitor_events ve
		LEFT JOIN zones z ON z.id = ve.zone_id
		WHERE ve.workspace_id = $1 AND ve.store_id::text = $2
		ORDER BY ve.entered_at DESC
		LIMIT 30`, ws, out.StoreID)
	if err != nil {
		return nil, err
	}
	defer c5()
	for vRows.Next() {
		var mv MonitorVisitorRow
		if err := vRows.Scan(&mv.ID, &mv.EnteredAt, &mv.DwellSeconds, &mv.Zone, &mv.Status); err != nil {
			return nil, err
		}
		out.Visitors = append(out.Visitors, mv)
	}
	if err := vRows.Err(); err != nil {
		return nil, err
	}

	aggRow, c6, err := s.QueryRowWorkspace(ctx, ws, uuid.Nil, `
		SELECT
		  (SELECT count(*)::int FROM visitor_events ve
		   WHERE ve.workspace_id = $1 AND ve.store_id::text = $2 AND ve.entered_at >= date_trunc('day', now())),
		  (SELECT coalesce(avg(dwell_seconds), 0)::int FROM visitor_events
		   WHERE workspace_id = $1 AND store_id::text = $2 AND entered_at >= date_trunc('day', now())),
		  (SELECT count(*)::int FROM visitor_events ve
		   WHERE ve.workspace_id = $1 AND ve.store_id::text = $2 AND ve.status = 'in'),
		  (SELECT count(*)::int FROM visitor_events ve
		   WHERE ve.workspace_id = $1 AND ve.store_id::text = $2
		     AND ve.entered_at >= date_trunc('day', now()) - interval '1 day'
		     AND ve.entered_at < date_trunc('day', now())),
		  (SELECT coalesce(avg(dwell_seconds), 0)::int FROM visitor_events
		   WHERE workspace_id = $1 AND store_id::text = $2
		     AND entered_at >= date_trunc('day', now()) - interval '1 day'
		     AND entered_at < date_trunc('day', now()))`, ws, out.StoreID)
	if err != nil {
		return nil, err
	}
	defer c6()
	var footfallYesterday, dwellYesterday int
	if err := aggRow.Scan(&out.FootfallToday, &out.AvgDwellSeconds, &out.VisitorsNow,
		&footfallYesterday, &dwellYesterday); err != nil {
		if err != pgx.ErrNoRows {
			return nil, err
		}
	}
	out.FootfallDelta = percentDelta(out.FootfallToday, footfallYesterday)
	out.DwellDelta = percentDelta(out.AvgDwellSeconds, dwellYesterday)
	return out, nil
}

// percentDelta mengembalikan perubahan relatif dalam persen, satu desimal.
// Bila pembanding belum ada, delta 0 lebih jujur daripada angka karangan.
func percentDelta(current, previous int) float64 {
	if previous <= 0 {
		return 0
	}
	value := (float64(current) - float64(previous)) / float64(previous) * 100
	return math.Round(value*10) / 10
}

type ReportRow struct {
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	Kind        string          `json:"kind"`
	PeriodFrom  time.Time       `json:"period_from"`
	PeriodTo    time.Time       `json:"period_to"`
	Scope       string          `json:"scope"`
	StoresCount int             `json:"stores_count"`
	Status      string          `json:"status"`
	GeneratedAt *time.Time      `json:"generated_at"`
	Format      string          `json:"format"`
	Metrics     json.RawMessage `json:"metrics"`
}

type ReportScheduleRow struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Cadence    string   `json:"cadence"`
	Scope      string   `json:"scope"`
	Format     string   `json:"format"`
	Recipients []string `json:"recipients"`
	Active     bool     `json:"active"`
}

type ReportSeriesPoint struct {
	Date         string  `json:"date"`
	Availability float64 `json:"availability_pct"`
	OosRate      float64 `json:"oos_rate_pct"`
	Visitors     int     `json:"visitors"`
}

type ReportsSummary struct {
	Total           int        `json:"total"`
	Ready           int        `json:"ready"`
	Scheduled       int        `json:"scheduled"`
	LastGenerated   *time.Time `json:"last_generated"`
	StoresCovered   int        `json:"stores_covered"`
	AvgAvailability *float64   `json:"avg_availability_pct"`
	PeriodDays      int        `json:"period_days"`
}

type ReportsOverview struct {
	Summary   ReportsSummary      `json:"summary"`
	Reports   []ReportRow         `json:"reports"`
	Series    []ReportSeriesPoint `json:"series"`
	Schedules []ReportScheduleRow `json:"schedules"`
	Notes     string              `json:"notes"`
}

func (s *Store) ReportsOverviewAll(ctx context.Context, ws uuid.UUID) (*ReportsOverview, error) {
	out := &ReportsOverview{
		Reports:   []ReportRow{},
		Series:    []ReportSeriesPoint{},
		Schedules: []ReportScheduleRow{},
		Notes:     "Laporan dihitung dari audit + traffic harian; jadwal aktif mengirim otomatis ke daftar penerima.",
	}

	repRows, c1, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT id::text, title, kind, period_from, period_to, scope, stores_count, status, generated_at, format, metrics
		FROM reports WHERE workspace_id = $1
		ORDER BY created_at DESC
		LIMIT 50`, ws)
	if err != nil {
		return nil, err
	}
	defer c1()
	for repRows.Next() {
		var r ReportRow
		if err := repRows.Scan(&r.ID, &r.Title, &r.Kind, &r.PeriodFrom, &r.PeriodTo, &r.Scope,
			&r.StoresCount, &r.Status, &r.GeneratedAt, &r.Format, &r.Metrics); err != nil {
			return nil, err
		}
		if r.Metrics == nil {
			r.Metrics = json.RawMessage("{}")
		}
		out.Reports = append(out.Reports, r)
	}
	if err := repRows.Err(); err != nil {
		return nil, err
	}
	out.Summary.Total = len(out.Reports)
	var earliest, latest *time.Time
	for _, r := range out.Reports {
		if r.StoresCount > out.Summary.StoresCovered {
			out.Summary.StoresCovered = r.StoresCount
		}
		if earliest == nil || r.PeriodFrom.Before(*earliest) {
			t := r.PeriodFrom
			earliest = &t
		}
		if latest == nil || r.PeriodTo.After(*latest) {
			t := r.PeriodTo
			latest = &t
		}
		switch r.Status {
		case "ready":
			out.Summary.Ready++
		case "scheduled":
			out.Summary.Scheduled++
		}
		if r.GeneratedAt != nil && (out.Summary.LastGenerated == nil || r.GeneratedAt.After(*out.Summary.LastGenerated)) {
			t := *r.GeneratedAt
			out.Summary.LastGenerated = &t
		}
	}

	if earliest != nil && latest != nil && latest.After(*earliest) {
		out.Summary.PeriodDays = int(latest.Sub(*earliest).Hours()/24) + 1
	}

	scRows, c2, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT id::text, name, cadence, scope, format, recipients, active
		FROM report_schedules WHERE workspace_id = $1
		ORDER BY name`, ws)
	if err != nil {
		return nil, err
	}
	defer c2()
	for scRows.Next() {
		var sc ReportScheduleRow
		if err := scRows.Scan(&sc.ID, &sc.Name, &sc.Cadence, &sc.Scope, &sc.Format, &sc.Recipients, &sc.Active); err != nil {
			return nil, err
		}
		out.Schedules = append(out.Schedules, sc)
	}
	if err := scRows.Err(); err != nil {
		return nil, err
	}

	// Series 14 hari terakhir: availability dari v_audit_daily, kunjungan dari visitor_events.
	serRows, c3, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT d.day::text,
		       coalesce(100 - d.oos_rate, 100.0)::float8,
		       coalesce(d.oos_rate, 0)::float8,
		       coalesce((SELECT count(*)::int FROM visitor_events ve
		                 WHERE ve.workspace_id = $1 AND date_trunc('day', ve.entered_at) = d.day), 0)
		FROM (
		  SELECT day,
		         CASE WHEN coalesce(sum(facing_total), 0) > 0 THEN (sum(oos_count)::float8 * 100 / sum(facing_total)::float8)
		              ELSE NULL END AS oos_rate
		  FROM v_audit_daily
		  WHERE workspace_id = $1 AND day >= current_date - 13
		  GROUP BY day
		) d
		ORDER BY d.day`, ws)
	if err != nil {
		return nil, err
	}
	defer c3()
	for serRows.Next() {
		var pt ReportSeriesPoint
		if err := serRows.Scan(&pt.Date, &pt.Availability, &pt.OosRate, &pt.Visitors); err != nil {
			return nil, err
		}
		pt.Availability = round2(pt.Availability)
		pt.OosRate = round2(pt.OosRate)
		out.Series = append(out.Series, pt)
	}
	if err := serRows.Err(); err != nil {
		return nil, err
	}
	if len(out.Series) > 0 {
		var sum float64
		for _, pt := range out.Series {
			sum += pt.Availability
		}
		v := round2(sum / float64(len(out.Series)))
		out.Summary.AvgAvailability = &v
	}
	return out, nil
}

type IntegrationRow struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Kind       string     `json:"kind"`
	Status     string     `json:"status"`
	StoreScope string     `json:"store_scope"`
	LastSync   *time.Time `json:"last_sync"`
	Records    int        `json:"records"`
	LatencyMS  int        `json:"latency_ms"`
	Note       string     `json:"note"`
}

type SyncRunRow struct {
	ID        string    `json:"id"`
	Connector string    `json:"connector"`
	Kind      string    `json:"kind"`
	StartedAt time.Time `json:"started_at"`
	DurationS int       `json:"duration_s"`
	Status    string    `json:"status"`
	Records   int       `json:"records"`
	Message   string    `json:"message"`
}

type APIKeyRow struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	Prefix    string     `json:"prefix"`
	Masked    string     `json:"masked"`
	Scope     string     `json:"scope"`
	CreatedAt time.Time  `json:"created_at"`
	LastUsed  *time.Time `json:"last_used"`
	Status    string     `json:"status"`
}

type WebhookEventRow struct {
	ID       string    `json:"id"`
	Event    string    `json:"event"`
	Endpoint string    `json:"endpoint"`
	Status   string    `json:"status"`
	Attempts int       `json:"attempts"`
	At       time.Time `json:"at"`
}

type IntegrationsSummary struct {
	Active     int        `json:"active"`
	Total      int        `json:"total"`
	LastSync   *time.Time `json:"last_sync"`
	Events24h  int        `json:"events_24h"`
	Failures24 int        `json:"failures_24h"`
	Pending    int        `json:"pending"`
}

type IntegrationsOverview struct {
	Summary       IntegrationsSummary `json:"summary"`
	Connectors    []IntegrationRow    `json:"connectors"`
	SyncRuns      []SyncRunRow        `json:"sync_runs"`
	APIKeys       []APIKeyRow         `json:"api_keys"`
	WebhookEvents []WebhookEventRow   `json:"webhook_events"`
	Notes         string              `json:"notes"`
}

func (s *Store) IntegrationsOverviewAll(ctx context.Context, ws uuid.UUID) (*IntegrationsOverview, error) {
	out := &IntegrationsOverview{
		Connectors:    []IntegrationRow{},
		SyncRuns:      []SyncRunRow{},
		APIKeys:       []APIKeyRow{},
		WebhookEvents: []WebhookEventRow{},
		Notes:         "Connector PO/pengiriman terhubung lewat API key; webhook error tinggal retry otomatis.",
	}

	conRows, c1, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT id::text, name, kind, status, store_scope, last_sync, records, latency_ms, note
		FROM integrations WHERE workspace_id = $1 ORDER BY name`, ws)
	if err != nil {
		return nil, err
	}
	defer c1()
	for conRows.Next() {
		var ir IntegrationRow
		if err := conRows.Scan(&ir.ID, &ir.Name, &ir.Kind, &ir.Status, &ir.StoreScope,
			&ir.LastSync, &ir.Records, &ir.LatencyMS, &ir.Note); err != nil {
			return nil, err
		}
		out.Connectors = append(out.Connectors, ir)
	}
	if err := conRows.Err(); err != nil {
		return nil, err
	}
	out.Summary.Total = len(out.Connectors)
	var latestSync *time.Time
	for _, ir := range out.Connectors {
		if ir.LastSync != nil && (latestSync == nil || ir.LastSync.After(*latestSync)) {
			t := *ir.LastSync
			latestSync = &t
		}
		if ir.Status == "connected" {
			out.Summary.Active++
		}
		if ir.Status == "pending" || ir.Status == "error" {
			out.Summary.Pending++
		}
	}

	srRows, c2, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT sr.id::text, i.name, sr.kind, sr.started_at, sr.duration_s, sr.status, sr.records, sr.message
		FROM integration_sync_runs sr
		JOIN integrations i ON i.id = sr.integration_id
		WHERE sr.workspace_id = $1
		ORDER BY sr.started_at DESC
		LIMIT 30`, ws)
	if err != nil {
		return nil, err
	}
	defer c2()
	for srRows.Next() {
		var sr SyncRunRow
		if err := srRows.Scan(&sr.ID, &sr.Connector, &sr.Kind, &sr.StartedAt, &sr.DurationS,
			&sr.Status, &sr.Records, &sr.Message); err != nil {
			return nil, err
		}
		out.SyncRuns = append(out.SyncRuns, sr)
		if latestSync == nil || sr.StartedAt.After(*latestSync) {
			t := sr.StartedAt
			latestSync = &t
		}
	}
	if err := srRows.Err(); err != nil {
		return nil, err
	}
	out.Summary.LastSync = latestSync

	kRows, c3, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT id::text, name, prefix, masked, scope, created_at, last_used_at, status
		FROM api_keys WHERE workspace_id = $1 ORDER BY created_at DESC`, ws)
	if err != nil {
		return nil, err
	}
	defer c3()
	for kRows.Next() {
		var k APIKeyRow
		if err := kRows.Scan(&k.ID, &k.Name, &k.Prefix, &k.Masked, &k.Scope, &k.CreatedAt, &k.LastUsed, &k.Status); err != nil {
			return nil, err
		}
		out.APIKeys = append(out.APIKeys, k)
	}
	if err := kRows.Err(); err != nil {
		return nil, err
	}

	wRows, c4, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT id::text, event, endpoint, status, attempts, at
		FROM webhook_events WHERE workspace_id = $1
		ORDER BY at DESC LIMIT 20`, ws)
	if err != nil {
		return nil, err
	}
	defer c4()
	for wRows.Next() {
		var we WebhookEventRow
		if err := wRows.Scan(&we.ID, &we.Event, &we.Endpoint, &we.Status, &we.Attempts, &we.At); err != nil {
			return nil, err
		}
		out.WebhookEvents = append(out.WebhookEvents, we)
	}
	if err := wRows.Err(); err != nil {
		return nil, err
	}

	aggRow, c5, err := s.QueryRowWorkspace(ctx, ws, uuid.Nil, `
		SELECT
		  (SELECT count(*)::int FROM webhook_events WHERE workspace_id = $1 AND at >= now() - interval '24 hours'),
		  (SELECT count(*)::int FROM webhook_events WHERE workspace_id = $1 AND at >= now() - interval '24 hours' AND status <> 'ok')`, ws)
	if err != nil {
		return nil, err
	}
	defer c5()
	if err := aggRow.Scan(&out.Summary.Events24h, &out.Summary.Failures24); err != nil {
		if err != pgx.ErrNoRows {
			return nil, err
		}
	}
	return out, nil
}
