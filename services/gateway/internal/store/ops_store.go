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
// Inventory + tugas + buku harga (PRD M3 versi read-only).
// ---------------------------------------------------------------------------

type InventorySummary struct {
	SkuTotal        int       `json:"sku_total"`
	StoreCount      int       `json:"store_count"`
	BalanceLines    int       `json:"balance_lines"`
	HealthyCount    int       `json:"healthy_count"`
	LowStockCount   int       `json:"low_stock_count"`
	OutOfStockCount int       `json:"out_of_stock_count"`
	StockValueIDR   int64     `json:"stock_value_idr"`
	MovementCount   int       `json:"movement_count"`
	TaskOpen        int       `json:"task_open"`
	TaskInProgress  int       `json:"task_in_progress"`
	TaskDone        int       `json:"task_done"`
	TaskOverdue     int       `json:"task_overdue"`
	AsOf            time.Time `json:"as_of"`
}

type Product struct {
	ID           string `json:"id"`
	SKU          string `json:"sku"`
	Name         string `json:"name"`
	Category     string `json:"category"`
	SubCategory  string `json:"sub_category"`
	Unit         string `json:"unit"`
	PriceIDR     int64  `json:"price_idr"`
	CostIDR      int64  `json:"cost_idr"`
	ReorderPoint int    `json:"reorder_point"`
	Active       bool   `json:"active"`
}

type InventoryLocation struct {
	ID      string `json:"id"`
	StoreID string `json:"store_id"`
	Name    string `json:"name"`
	Kind    string `json:"kind"`
}

type InventoryBalance struct {
	StoreID        string     `json:"store_id"`
	StoreName      string     `json:"store_name"`
	LocationID     string     `json:"location_id"`
	LocationKind   string     `json:"location_kind"`
	ProductID      string     `json:"product_id"`
	SKU            string     `json:"sku"`
	ProductName    string     `json:"product_name"`
	Unit           string     `json:"unit"`
	OnHand         int        `json:"on_hand"`
	Reserved       int        `json:"reserved"`
	Available      int        `json:"available"`
	ReorderPoint   int        `json:"reorder_point"`
	Low            bool       `json:"low"`
	PriceIDR       int64      `json:"price_idr"`
	LastMovementAt *time.Time `json:"last_movement_at"`
}

type InventoryMovement struct {
	ID          string    `json:"id"`
	StoreID     string    `json:"store_id"`
	StoreName   string    `json:"store_name"`
	ProductID   string    `json:"product_id"`
	SKU         string    `json:"sku"`
	ProductName string    `json:"product_name"`
	Kind        string    `json:"kind"`
	Qty         int       `json:"qty"`
	UnitCostIDR int64     `json:"unit_cost_idr"`
	Reason      string    `json:"reason"`
	Ref         string    `json:"ref"`
	Unit        string    `json:"unit"`
	CreatedAt   time.Time `json:"created_at"`
}

// TaskRow dipakai halaman papan tugas & dashboard inventory.
type TaskRow struct {
	ID        string          `json:"id"`
	Title     string          `json:"title"`
	Detail    string          `json:"detail"`
	AlertID   *string         `json:"alert_id"`
	AlertType *string         `json:"alert_type"`
	Severity  string          `json:"severity"`
	StoreID   *string         `json:"store_id"`
	StoreName *string         `json:"store_name"`
	Assignee  *string         `json:"assignee"`
	Status    string          `json:"status"`
	Priority  string          `json:"priority"`
	DueAt     *time.Time      `json:"due_at"`
	CreatedAt time.Time       `json:"created_at"`
	Checklist json.RawMessage `json:"checklist"`
}

// PriceBookMini dipakai halaman inventory (book + ringkasan item).
type PriceBookMini struct {
	ID         string          `json:"id"`
	StoreID    string          `json:"store_id"`
	StoreName  string          `json:"store_name"`
	Channel    string          `json:"channel"`
	ValidFrom  time.Time       `json:"valid_from"`
	ValidTo    *time.Time      `json:"valid_to"`
	Status     string          `json:"status"`
	UpdatedAt  time.Time       `json:"updated_at"`
	ItemCount  int             `json:"item_count"`
	Items      json.RawMessage `json:"items"`
}

type InventoryOverview struct {
	Summary    InventorySummary    `json:"summary"`
	Products   []Product           `json:"products"`
	Locations  []InventoryLocation `json:"locations"`
	Balances   []InventoryBalance  `json:"balances"`
	Movements  []InventoryMovement `json:"movements"`
	PriceBooks []PriceBookMini     `json:"price_books"`
	Tasks      []TaskRow           `json:"tasks"`
}

func (s *Store) ListTasks(ctx context.Context, ws uuid.UUID, limit int) ([]TaskRow, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	const q = `
	SELECT t.id::text, t.title, t.detail, a.id::text, a.type,
	       t.severity, s.id::text, s.name, t.assignee, t.status, t.priority,
	       t.due_at, t.created_at, t.checklist
	FROM tasks t
	LEFT JOIN alerts a ON a.id = t.alert_id
	LEFT JOIN stores s ON s.id = t.store_id
	WHERE t.workspace_id = $1
	ORDER BY t.created_at DESC
	LIMIT $2`
	rows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, q, ws, limit)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	out := []TaskRow{}
	for rows.Next() {
		var t TaskRow
		if err := rows.Scan(&t.ID, &t.Title, &t.Detail, &t.AlertID, &t.AlertType,
			&t.Severity, &t.StoreID, &t.StoreName, &t.Assignee, &t.Status, &t.Priority,
			&t.DueAt, &t.CreatedAt, &t.Checklist); err != nil {
			return nil, err
		}
		if t.Checklist == nil {
			t.Checklist = json.RawMessage("[]")
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) ListPriceBookMinis(ctx context.Context, ws uuid.UUID, limit int) ([]PriceBookMini, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	const q = `
	SELECT pb.id::text, pb.store_id::text, st.name, pb.channel, pb.valid_from, pb.valid_to, pb.status, pb.updated_at,
	       (SELECT count(*)::int FROM price_book_items pi WHERE pi.book_id = pb.id),
	       (SELECT coalesce(jsonb_agg(jsonb_build_object(
	          'product_id', p.id, 'sku', p.sku, 'product_name', p.name,
	          'price_idr', pi.price_idr, 'cost_idr', pi.cost_idr) ORDER BY p.sku), '[]'::jsonb)::text
	        FROM price_book_items pi JOIN products p ON p.id = pi.product_id
	        WHERE pi.book_id = pb.id)
	FROM price_books pb
	JOIN stores st ON st.id = pb.store_id
	WHERE pb.workspace_id = $1 AND pb.deleted_at IS NULL
	ORDER BY pb.updated_at DESC
	LIMIT $2`
	rows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, q, ws, limit)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	out := []PriceBookMini{}
	for rows.Next() {
		var b PriceBookMini
		var itemsText string
		if err := rows.Scan(&b.ID, &b.StoreID, &b.StoreName, &b.Channel, &b.ValidFrom, &b.ValidTo,
			&b.Status, &b.UpdatedAt, &b.ItemCount, &itemsText); err != nil {
			return nil, err
		}
		if itemsText == "" {
			itemsText = "[]"
		}
		b.Items = json.RawMessage(itemsText)
		out = append(out, b)
	}
	return out, rows.Err()
}

func (s *Store) InventoryOverviewAll(ctx context.Context, ws uuid.UUID) (*InventoryOverview, error) {
	out := &InventoryOverview{
		Products:   []Product{},
		Locations:  []InventoryLocation{},
		Balances:   []InventoryBalance{},
		Movements:  []InventoryMovement{},
		PriceBooks: []PriceBookMini{},
		Tasks:      []TaskRow{},
	}

	// Rangkuman + saldo: satu query agregat tunggal untuk efisien.
	const sumQ = `
	SELECT
	  (SELECT count(*) FROM products p WHERE p.workspace_id = $1 AND p.active AND p.deleted_at IS NULL),
	  (SELECT count(*) FROM stores st WHERE st.workspace_id = $1 AND st.deleted_at IS NULL),
	  (SELECT count(*) FROM inventory_balances b WHERE b.workspace_id = $1),
	  (SELECT count(*) FROM inventory_balances b WHERE b.workspace_id = $1 AND b.on_hand >= b.reorder_point),
	  (SELECT count(*) FROM inventory_balances b WHERE b.workspace_id = $1 AND b.on_hand > 0 AND b.on_hand < b.reorder_point),
	  (SELECT count(*) FROM inventory_balances b WHERE b.workspace_id = $1 AND b.on_hand = 0),
	  (SELECT coalesce(sum(b.on_hand * p.cost_idr), 0)::bigint
	     FROM inventory_balances b JOIN products p ON p.id = b.product_id WHERE b.workspace_id = $1),
	  (SELECT count(*) FROM inventory_movements m WHERE m.workspace_id = $1 AND m.created_at > now() - interval '48 hours'),
	  (SELECT count(*) FROM tasks t WHERE t.workspace_id = $1 AND t.status = 'open'),
	  (SELECT count(*) FROM tasks t WHERE t.workspace_id = $1 AND t.status = 'in_progress'),
	  (SELECT count(*) FROM tasks t WHERE t.workspace_id = $1 AND t.status = 'done'),
	  (SELECT count(*) FROM tasks t WHERE t.workspace_id = $1 AND t.status = 'overdue'),
	  now()`
	row, cleanup, err := s.QueryRowWorkspace(ctx, ws, uuid.Nil, sumQ, ws)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	if err := row.Scan(&out.Summary.SkuTotal, &out.Summary.StoreCount, &out.Summary.BalanceLines,
		&out.Summary.HealthyCount, &out.Summary.LowStockCount, &out.Summary.OutOfStockCount,
		&out.Summary.StockValueIDR, &out.Summary.MovementCount,
		&out.Summary.TaskOpen, &out.Summary.TaskInProgress, &out.Summary.TaskDone, &out.Summary.TaskOverdue,
		&out.Summary.AsOf); err != nil {
		if err != pgx.ErrNoRows {
			return nil, fmt.Errorf("inventory summary: %w", err)
		}
	}
	cleanup()

	tasks, err := s.ListTasks(ctx, ws, 50)
	if err != nil {
		return nil, err
	}
	out.Tasks = tasks

	pRows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT id::text, sku, name, category, sub_category, unit, price_idr, cost_idr, reorder_point, active
		FROM products WHERE workspace_id = $1 AND active AND deleted_at IS NULL
		ORDER BY sku`, ws)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	for pRows.Next() {
		var p Product
		if err := pRows.Scan(&p.ID, &p.SKU, &p.Name, &p.Category, &p.SubCategory, &p.Unit,
			&p.PriceIDR, &p.CostIDR, &p.ReorderPoint, &p.Active); err != nil {
			return nil, err
		}
		out.Products = append(out.Products, p)
	}
	if err := pRows.Err(); err != nil {
		return nil, err
	}
	cleanup()

	lRows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT id::text, store_id::text, name, kind
		FROM inventory_locations WHERE workspace_id = $1 AND deleted_at IS NULL
		ORDER BY store_id, name`, ws)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	for lRows.Next() {
		var l InventoryLocation
		if err := lRows.Scan(&l.ID, &l.StoreID, &l.Name, &l.Kind); err != nil {
			return nil, err
		}
		out.Locations = append(out.Locations, l)
	}
	if err := lRows.Err(); err != nil {
		return nil, err
	}
	cleanup()

	bRows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT st.id::text, st.name, l.id::text, l.kind, p.id::text, p.sku, p.name, p.unit,
		       b.on_hand, b.reserved, (b.on_hand - b.reserved)::int, b.reorder_point,
		       (b.on_hand <= b.reorder_point), p.price_idr, b.last_movement_at
		FROM inventory_balances b
		JOIN stores st ON st.id = b.store_id
		JOIN inventory_locations l ON l.id = b.location_id
		JOIN products p ON p.id = b.product_id
		WHERE b.workspace_id = $1
		ORDER BY b.on_hand, st.name, p.sku
		LIMIT 400`, ws)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	for bRows.Next() {
		var b InventoryBalance
		if err := bRows.Scan(&b.StoreID, &b.StoreName, &b.LocationID, &b.LocationKind,
			&b.ProductID, &b.SKU, &b.ProductName, &b.Unit, &b.OnHand, &b.Reserved,
			&b.Available, &b.ReorderPoint, &b.Low, &b.PriceIDR, &b.LastMovementAt); err != nil {
			return nil, err
		}
		out.Balances = append(out.Balances, b)
	}
	if err := bRows.Err(); err != nil {
		return nil, err
	}
	cleanup()

	mRows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT m.id::text, m.store_id::text, st.name, p.id::text, p.sku, p.name,
		       m.kind, m.qty, m.unit_cost_idr, m.reason, m.ref, m.unit, m.created_at
		FROM inventory_movements m
		JOIN stores st ON st.id = m.store_id
		JOIN products p ON p.id = m.product_id
		WHERE m.workspace_id = $1
		ORDER BY m.created_at DESC
		LIMIT 200`, ws)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	for mRows.Next() {
		var mv InventoryMovement
		if err := mRows.Scan(&mv.ID, &mv.StoreID, &mv.StoreName, &mv.ProductID, &mv.SKU,
			&mv.ProductName, &mv.Kind, &mv.Qty, &mv.UnitCostIDR, &mv.Reason, &mv.Ref,
			&mv.Unit, &mv.CreatedAt); err != nil {
			return nil, err
		}
		out.Movements = append(out.Movements, mv)
	}
	if err := mRows.Err(); err != nil {
		return nil, err
	}
	cleanup()

	books, err := s.ListPriceBookMinis(ctx, ws, 50)
	if err != nil {
		return nil, err
	}
	out.PriceBooks = books
	return out, nil
}

// ---------------------------------------------------------------------------
// Pricing (buku harga + selisih label/book)
// ---------------------------------------------------------------------------

type PricingSummary struct {
	PriceBooksActive int       `json:"price_books_active"`
	ItemsCount       int       `json:"items_count"`
	MismatchOpen     int       `json:"mismatch_open"`
	MismatchTotal    int       `json:"mismatch_total"`
	AvgMarginPct     *float64  `json:"avg_margin_pct"`
	StoresCovered    int       `json:"stores_covered"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type PricingItem struct {
	StoreID     string    `json:"store_id"`
	StoreName   string    `json:"store_name"`
	BookID      string    `json:"book_id"`
	ProductID   string    `json:"product_id"`
	SKU         string    `json:"sku"`
	ProductName string    `json:"product_name"`
	Category    string    `json:"category"`
	Unit        string    `json:"unit"`
	PriceIDR    int64     `json:"price_idr"`
	CostIDR     int64     `json:"cost_idr"`
	MarginPct   *float64  `json:"margin_pct"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type PricingMismatch struct {
	ID                string    `json:"id"`
	StoreID           string    `json:"store_id"`
	StoreName         string    `json:"store_name"`
	ProductID         *string   `json:"product_id"`
	SKU               *string   `json:"sku"`
	ProductName       string    `json:"product_name"`
	LabelPriceIDR     *int64    `json:"label_price_idr"`
	PriceBookPriceIDR *int64    `json:"price_book_price_idr"`
	DeltaIDR          *int64    `json:"delta_idr"`
	Status            string    `json:"status"`
	AlertID           *string   `json:"alert_id"`
	SessionID         *string   `json:"session_id"`
	DetectedAt        time.Time `json:"detected_at"`
	Source            string    `json:"source"`
}

type PricingOverview struct {
	Summary    PricingSummary    `json:"summary"`
	PriceBooks []PriceBookMini   `json:"price_books"`
	Items      []PricingItem     `json:"items"`
	Mismatches []PricingMismatch `json:"mismatches"`
	Notes      string            `json:"notes"`
}

func (s *Store) PricingOverviewAll(ctx context.Context, ws uuid.UUID) (*PricingOverview, error) {
	out := &PricingOverview{
		PriceBooks: []PriceBookMini{},
		Items:      []PricingItem{},
		Mismatches: []PricingMismatch{},
		Notes:      "Semua margin dihitung dari buku harga; selisih label/book ditampilkan bila melewati toleransi planogram.",
	}

	const sumQ = `
	SELECT
	  (SELECT count(*)::int FROM price_book_items pi WHERE pi.workspace_id = $1),
	  (SELECT count(*)::int FROM price_tags pt WHERE pt.workspace_id = $1 AND pt.mismatch),
	  (SELECT count(*)::int FROM price_tags pt WHERE pt.workspace_id = $1),
	  (SELECT avg(CASE WHEN pi.cost_idr > 0 AND pi.price_idr > 0
	     THEN (pi.price_idr - pi.cost_idr)::float8 * 100.0 / pi.cost_idr::float8 END)
	   FROM price_book_items pi WHERE pi.workspace_id = $1),
	  (SELECT count(*)::int FROM price_books pb WHERE pb.workspace_id = $1 AND pb.status = 'active' AND pb.deleted_at IS NULL),
	  now()`
	row, cleanup, err := s.QueryRowWorkspace(ctx, ws, uuid.Nil, sumQ, ws)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	var avgMargin *float64
	if err := row.Scan(&out.Summary.ItemsCount, &out.Summary.MismatchOpen, &out.Summary.MismatchTotal,
		&avgMargin, &out.Summary.PriceBooksActive, &out.Summary.UpdatedAt); err != nil {
		if err != pgx.ErrNoRows {
			return nil, fmt.Errorf("pricing summary: %w", err)
		}
	}
	cleanup()

	books, err := s.ListPriceBookMinis(ctx, ws, 100)
	if err != nil {
		return nil, err
	}
	out.PriceBooks = books

	itRows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT st.id::text, st.name, pb.id::text, p.id::text, p.sku, p.name, p.category, p.unit,
		       pi.price_idr, pi.cost_idr, pb.updated_at
		FROM price_book_items pi
		JOIN price_books pb ON pb.id = pi.book_id
		JOIN stores st ON st.id = pb.store_id
		JOIN products p ON p.id = pi.product_id
		WHERE pi.workspace_id = $1
		ORDER BY pi.price_idr DESC
		LIMIT 300`, ws)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	for itRows.Next() {
		var it PricingItem
		if err := itRows.Scan(&it.StoreID, &it.StoreName, &it.BookID, &it.ProductID, &it.SKU,
			&it.ProductName, &it.Category, &it.Unit, &it.PriceIDR, &it.CostIDR, &it.UpdatedAt); err != nil {
			return nil, err
		}
		if it.CostIDR > 0 {
			v := round2(float64(it.PriceIDR-it.CostIDR) / float64(it.CostIDR) * 100)
			it.MarginPct = &v
		}
		out.Items = append(out.Items, it)
	}
	if err := itRows.Err(); err != nil {
		return nil, err
	}
	cleanup()

	// Mismatch = baris price_tags dengan mismatch + buku harga aktif toko terkait.
	msRows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT pt.id::text, st.id::text, st.name,
		       p.id::text, p.sku, coalesce(pt.matched_label, p.name, ''),
		       pt.price_idr, pb_item.price_idr,
		       (pt.price_idr - pb_item.price_idr)::bigint,
		       coalesce(al.status, 'open'), al.id::text, a.id::text, pt.created_at
		FROM price_tags pt
		JOIN audit_images ai ON ai.id = pt.image_id
		JOIN audit_sessions a ON a.id = ai.session_id
		JOIN stores st ON st.id = a.store_id
		LEFT JOIN LATERAL (
		  SELECT al.id, al.status FROM alerts al
		  WHERE al.session_id = a.id AND al.type = 'price_mismatch'
		  ORDER BY al.created_at DESC LIMIT 1
		) al ON true
		LEFT JOIN products p ON p.name = pt.matched_label AND p.workspace_id = pt.workspace_id
		LEFT JOIN price_books pb ON pb.store_id = a.store_id AND pb.status = 'active' AND pb.deleted_at IS NULL
		LEFT JOIN price_book_items pb_item ON pb_item.book_id = pb.id AND pb_item.product_id = p.id
		WHERE pt.workspace_id = $1 AND pt.mismatch
		ORDER BY pt.created_at DESC
		LIMIT 50`, ws)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	for msRows.Next() {
		var m PricingMismatch
		m.Source = "ocr"
		if err := msRows.Scan(&m.ID, &m.StoreID, &m.StoreName, &m.ProductID, &m.SKU,
			&m.ProductName, &m.LabelPriceIDR, &m.PriceBookPriceIDR, &m.DeltaIDR, &m.Status,
			&m.AlertID, &m.SessionID, &m.DetectedAt); err != nil {
			return nil, err
		}
		out.Mismatches = append(out.Mismatches, m)
	}
	return out, msRows.Err()
}
