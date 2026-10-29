package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// ---------------------------------------------------------------------------
// Aksi tulis operasional (G4): purchase order + penerimaan barang.
//
// Semua operasi memakai WithWorkspace agar RLS workspace tetap berlaku.
// Setiap operasi tulis adalah satu transaksi utuh: tidak boleh ada header
// tersimpan tanpa baris, atau stok bertambah tanpa movement.
// ---------------------------------------------------------------------------

type PurchaseOrderItemInput struct {
	ProductID   string
	QtyOrder    int
	UnitCostIDR int64
}

type PurchaseOrderInput struct {
	StoreID      string
	SupplierID   string
	ExpectedDate string
	Notes        string
	Items        []PurchaseOrderItemInput
}

type PurchaseOrderLineOut struct {
	ProductID   string `json:"product_id"`
	SKU         string `json:"sku"`
	ProductName string `json:"product_name"`
	QtyOrder    int    `json:"qty_order"`
	UnitCostIDR int64  `json:"unit_cost_idr"`
	SubtotalIDR int64  `json:"subtotal_idr"`
}

type PurchaseOrderOut struct {
	ID        string                 `json:"id"`
	Code      string                 `json:"code"`
	StoreID   string                 `json:"store_id"`
	Supplier  string                 `json:"supplier"`
	Status    string                 `json:"status"`
	TotalIDR  int64                  `json:"total_idr"`
	Lines     []PurchaseOrderLineOut `json:"lines"`
	CreatedAt time.Time              `json:"created_at"`
}

// CreatePurchaseOrder membuat PO dengan status "sent" beserta barisnya.
// po_code dibuat otomatis dan unik per workspace.
func (s *Store) CreatePurchaseOrder(
	ctx context.Context, ws, user uuid.UUID, in PurchaseOrderInput,
) (*PurchaseOrderOut, error) {
	out := &PurchaseOrderOut{Lines: []PurchaseOrderLineOut{}}

	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		var supplierName string
		if err := tx.QueryRow(ctx, `
			SELECT name FROM suppliers
			WHERE id = $1 AND workspace_id = $2 AND active`,
			in.SupplierID, ws).Scan(&supplierName); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("%w: supplier tidak ditemukan", ErrNotFound)
			}
			return err
		}

		var total int64
		for _, item := range in.Items {
			total += int64(item.QtyOrder) * item.UnitCostIDR
		}

		poID := NewV7()
		code := fmt.Sprintf("PO-%s-%s", time.Now().UTC().Format("20060102"), strings.ToUpper(poID.String()[:6]))
		expected := time.Now().UTC().AddDate(0, 0, 3)
		if strings.TrimSpace(in.ExpectedDate) != "" {
			if parsed, err := time.Parse("2006-01-02", strings.TrimSpace(in.ExpectedDate)); err == nil {
				expected = parsed
			}
		}

		if _, err := tx.Exec(ctx, `
			INSERT INTO purchase_orders (
				workspace_id, store_id, supplier_id, po_code, status,
				order_date, expected_date, total_idr, created_at, updated_at)
			VALUES ($1,$2,$3,$4,'sent',current_date,$5,$6,now(),now())`,
			ws, in.StoreID, in.SupplierID, code, expected, total); err != nil {
			return fmt.Errorf("simpan purchase order: %w", err)
		}

		for _, item := range in.Items {
			var sku, name string
			if err := tx.QueryRow(ctx, `
				SELECT sku, name FROM products
				WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
				item.ProductID, ws).Scan(&sku, &name); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return fmt.Errorf("%w: produk %s tidak ditemukan", ErrNotFound, item.ProductID)
				}
				return err
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO po_lines (workspace_id, po_id, product_id, qty_order, qty_received, unit_cost_idr)
				VALUES ($1,$2,$3,$4,0,$5)`,
				ws, poID, item.ProductID, item.QtyOrder, item.UnitCostIDR); err != nil {
				return fmt.Errorf("simpan baris purchase order: %w", err)
			}
			out.Lines = append(out.Lines, PurchaseOrderLineOut{
				ProductID:   item.ProductID,
				SKU:         sku,
				ProductName: name,
				QtyOrder:    item.QtyOrder,
				UnitCostIDR: item.UnitCostIDR,
				SubtotalIDR: int64(item.QtyOrder) * item.UnitCostIDR,
			})
		}

		if err := writeAuditLog(ctx, tx, ws, user, "purchase_order.create", "purchase_orders",
			poID.String(), map[string]any{
				"code":      code,
				"lines":     len(out.Lines),
				"total_idr": total,
			}); err != nil {
			return err
		}

		out.ID = poID.String()
		out.Code = code
		out.StoreID = in.StoreID
		out.Supplier = supplierName
		out.Status = "sent"
		out.TotalIDR = total
		out.CreatedAt = time.Now().UTC()
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

type GoodsReceiptItemInput struct {
	PoLineID    string
	QtyReceived int
}

type GoodsReceiptInput struct {
	StoreID        string
	POID           string
	IdempotencyKey string
	Notes          string
	Items          []GoodsReceiptItemInput
}

type GoodsReceiptLineOut struct {
	PoLineID    string `json:"po_line_id"`
	ProductID   string `json:"product_id"`
	SKU         string `json:"sku"`
	QtyReceived int    `json:"qty_received"`
	UnitCostIDR int64  `json:"unit_cost_idr"`
}

type GoodsReceiptOut struct {
	ID               string                `json:"id"`
	Code             string                `json:"code"`
	POID             string                `json:"purchase_order_id"`
	POCode           string                `json:"purchase_order_code"`
	StoreID          string                `json:"store_id"`
	Status           string                `json:"status"`
	Lines            []GoodsReceiptLineOut `json:"lines"`
	StockUpdated     int                   `json:"stock_updated"`
	IdempotentReplay bool                  `json:"idempotent_replay"`
	ReceivedAt       time.Time             `json:"received_at"`
}

// CreateGoodsReceipt mencatat penerimaan barang terhadap PO: menambah
// qty_received pada po_lines, menambah on_hand pada inventory_balances, dan
// menulis inventory_movements (kind 'in') — semuanya dalam satu transaksi.
//
// Idempotensi: idempotency_key yang sama mengembalikan dokumen penerimaan yang
// sudah ada (tanpa menambah stok dua kali).
func (s *Store) CreateGoodsReceipt(
	ctx context.Context, ws, user uuid.UUID, in GoodsReceiptInput,
) (*GoodsReceiptOut, error) {
	out := &GoodsReceiptOut{Lines: []GoodsReceiptLineOut{}}

	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		// 1. Idempotensi: kalau kuncinya sudah pernah dipakai, kembalikan
		//    dokumen yang sama.
		if key := strings.TrimSpace(in.IdempotencyKey); key != "" {
			existing, found, err := loadGoodsReceiptByKey(ctx, tx, ws, key)
			if err != nil {
				return err
			}
			if found {
				*out = *existing
				out.IdempotentReplay = true
				return nil
			}
		}

		// 2. Kunci baris PO supaya dua penerimaan paralel tidak saling menimpa.
		var (
			poStoreID string
			poStatus  string
			poCode    string
		)
		if err := tx.QueryRow(ctx, `
			SELECT store_id::text, status, po_code FROM purchase_orders
			WHERE id = $1 AND workspace_id = $2
			FOR UPDATE`, in.POID, ws).Scan(&poStoreID, &poStatus, &poCode); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("%w: purchase order tidak ditemukan", ErrNotFound)
			}
			return err
		}
		if poStatus == "received" || poStatus == "cancelled" {
			return fmt.Errorf("%w: purchase order berstatus %s tidak bisa diterima lagi", ErrConflict, poStatus)
		}
		storeID := poStoreID
		if strings.TrimSpace(in.StoreID) != "" && in.StoreID != poStoreID {
			return fmt.Errorf("%w: purchase order ini milik toko lain", ErrConflict)
		}

		// 3. Lokasi penyimpanan toko (dipakai untuk inventory_balances).
		var locationID string
		if err := tx.QueryRow(ctx, `
			SELECT id::text FROM inventory_locations
			WHERE workspace_id = $1 AND store_id = $2
			ORDER BY created_at LIMIT 1`, ws, storeID).Scan(&locationID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("%w: toko belum punya lokasi penyimpanan", ErrConflict)
			}
			return err
		}

		receiptID := NewV7()
		code := fmt.Sprintf("GR-%s-%s", time.Now().UTC().Format("20060102"), strings.ToUpper(receiptID.String()[:6]))

		for _, item := range in.Items {
			// 4. Kunci baris po_lines; tolak melebihi qty yang dipesan.
			var (
				lineID     string
				productID  string
				qtyOrder   int
				qtyAlready int
				unitCost   int64
				sku        string
			)
			if err := tx.QueryRow(ctx, `
				SELECT pl.id::text, pl.product_id::text, pl.qty_order, pl.qty_received, pl.unit_cost_idr, p.sku
				FROM po_lines pl
				JOIN products p ON p.id = pl.product_id
				WHERE pl.id = $1 AND pl.workspace_id = $2 AND pl.po_id = $3
				FOR UPDATE OF pl`, item.PoLineID, ws, in.POID).
				Scan(&lineID, &productID, &qtyOrder, &qtyAlready, &unitCost, &sku); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return fmt.Errorf("%w: baris purchase order tidak ditemukan", ErrNotFound)
				}
				return err
			}
			if qtyAlready+item.QtyReceived > qtyOrder {
				return fmt.Errorf(
					"%w: qty diterima untuk %s melebihi qty pesanan (%d dari %d)",
					ErrConflict, sku, qtyAlready+item.QtyReceived, qtyOrder,
				)
			}

			if _, err := tx.Exec(ctx, `
				UPDATE po_lines SET qty_received = qty_received + $2 WHERE id = $1`,
				lineID, item.QtyReceived); err != nil {
				return err
			}

			// 5. Stok: kunci baris balance, tambah on_hand.
			if err := applyStockIn(ctx, tx, ws, storeID, locationID, productID, item.QtyReceived, unitCost); err != nil {
				return err
			}

			// 6. Jejak pergerakan stok.
			if _, err := tx.Exec(ctx, `
				INSERT INTO inventory_movements (
					workspace_id, store_id, product_id, kind, qty, unit_cost_idr, reason, ref, unit)
				VALUES ($1,$2,$3,'in',$4,$5,$6,$7,'pcs')`,
				ws, storeID, productID, item.QtyReceived, unitCost,
				"penerimaan barang "+code, poCode); err != nil {
				return fmt.Errorf("catat pergerakan stok: %w", err)
			}

			if _, err := tx.Exec(ctx, `
				INSERT INTO goods_receipt_lines (
					workspace_id, receipt_id, po_line_id, product_id, qty_received, unit_cost_idr)
				VALUES ($1,$2,$3,$4,$5,$6)`,
				ws, receiptID, lineID, productID, item.QtyReceived, unitCost); err != nil {
				return err
			}

			out.Lines = append(out.Lines, GoodsReceiptLineOut{
				PoLineID:    lineID,
				ProductID:   productID,
				SKU:         sku,
				QtyReceived: item.QtyReceived,
				UnitCostIDR: unitCost,
			})
			out.StockUpdated++
		}

		// 7. Simpan dokumen penerimaan.
		var receivedBy any
		if user != uuid.Nil {
			receivedBy = user
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO goods_receipts (
				workspace_id, store_id, po_id, receipt_code, status,
				idempotency_key, notes, received_by, received_at)
			VALUES ($1,$2,$3,$4,'received',$5,$6,$7,now())`,
			ws, storeID, in.POID, code, strings.TrimSpace(in.IdempotencyKey),
			strings.TrimSpace(in.Notes), receivedBy); err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				// Balapan idempotensi: kembalikan dokumen yang menang.
				existing, found, loadErr := loadGoodsReceiptByKey(ctx, tx, ws, strings.TrimSpace(in.IdempotencyKey))
				if loadErr != nil {
					return loadErr
				}
				if found {
					*out = *existing
					out.IdempotentReplay = true
					return nil
				}
			}
			return fmt.Errorf("simpan penerimaan barang: %w", err)
		}

		// 8. Perbarui status PO sesuai persen penerimaan.
		if err := refreshPurchaseOrderProgress(ctx, tx, ws, in.POID); err != nil {
			return err
		}

		if err := writeAuditLog(ctx, tx, ws, user, "grn.create", "goods_receipts",
			receiptID.String(), map[string]any{
				"code":           code,
				"purchase_order": poCode,
				"lines":          len(out.Lines),
				"stock_updated":  out.StockUpdated,
			}); err != nil {
			return err
		}

		out.ID = receiptID.String()
		out.Code = code
		out.POID = in.POID
		out.POCode = poCode
		out.StoreID = storeID
		out.Status = "received"
		out.ReceivedAt = time.Now().UTC()
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// applyStockIn menambah on_hand pada inventory_balances untuk satu lokasi +
// produk. Baris balance dikunci supaya tidak ada lost update.
func applyStockIn(
	ctx context.Context, tx pgx.Tx, ws uuid.UUID, storeID, locationID, productID string,
	qty int, unitCost int64,
) error {
	var balanceID string
	var onHand int
	err := tx.QueryRow(ctx, `
		SELECT id::text, on_hand FROM inventory_balances
		WHERE workspace_id = $1 AND location_id = $2 AND product_id = $3
		FOR UPDATE`, ws, locationID, productID).Scan(&balanceID, &onHand)
	if err == nil {
		_, err = tx.Exec(ctx, `
			UPDATE inventory_balances
			SET on_hand = on_hand + $2, last_movement_at = now(), updated_at = now()
			WHERE id = $1`, balanceID, qty)
		return err
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	// Belum ada baris balance untuk (lokasi, produk) — buat dengan on_hand = qty.
	_, err = tx.Exec(ctx, `
		INSERT INTO inventory_balances (
			workspace_id, store_id, location_id, product_id, on_hand, reserved, reorder_point, last_movement_at)
		VALUES ($1,$2,$3,$4,$5,0,0,now())`, ws, storeID, locationID, productID, qty)
	return err
}

// refreshPurchaseOrderProgress menghitung persen penerimaan dan memindahkan
// status PO ke "received" bila seluruh qty sudah masuk.
func refreshPurchaseOrderProgress(ctx context.Context, tx pgx.Tx, ws uuid.UUID, poID string) error {
	var totalOrdered, totalReceived int
	if err := tx.QueryRow(ctx, `
		SELECT coalesce(sum(qty_order), 0), coalesce(sum(qty_received), 0)
		FROM po_lines WHERE workspace_id = $1 AND po_id = $2`, ws, poID).
		Scan(&totalOrdered, &totalReceived); err != nil {
		return err
	}
	pct := 0
	if totalOrdered > 0 {
		pct = totalReceived * 100 / totalOrdered
		if pct > 100 {
			pct = 100
		}
	}
	status := "receiving"
	if totalOrdered > 0 && totalReceived >= totalOrdered {
		status = "received"
	}
	_, err := tx.Exec(ctx, `
		UPDATE purchase_orders
		SET received_pct = $2, status = $3, updated_at = now()
		WHERE id = $1 AND workspace_id = $4`, poID, pct, status, ws)
	return err
}

func loadGoodsReceiptByKey(
	ctx context.Context, tx pgx.Tx, ws uuid.UUID, key string,
) (*GoodsReceiptOut, bool, error) {
	if key == "" {
		return nil, false, nil
	}
	out := &GoodsReceiptOut{Lines: []GoodsReceiptLineOut{}}
	var poID *string
	err := tx.QueryRow(ctx, `
		SELECT id::text, store_id::text, po_id::text, receipt_code, status, received_at
		FROM goods_receipts
		WHERE workspace_id = $1 AND idempotency_key = $2`, ws, key).
		Scan(&out.ID, &out.StoreID, &poID, &out.Code, &out.Status, &out.ReceivedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if poID != nil {
		out.POID = *poID
	}
	rows, err := tx.Query(ctx, `
		SELECT po_line_id::text, product_id::text, qty_received, unit_cost_idr
		FROM goods_receipt_lines
		WHERE workspace_id = $1 AND receipt_id = $2`, ws, out.ID)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	for rows.Next() {
		var line GoodsReceiptLineOut
		if err := rows.Scan(&line.PoLineID, &line.ProductID, &line.QtyReceived, &line.UnitCostIDR); err != nil {
			return nil, false, err
		}
		out.Lines = append(out.Lines, line)
	}
	return out, true, rows.Err()
}

// writeAuditLog menulis jejak audit di dalam transaksi yang sama.
func writeAuditLog(
	ctx context.Context, tx pgx.Tx, ws, user uuid.UUID,
	action, entity, entityID string, detail map[string]any,
) error {
	payload, err := json.Marshal(detail)
	if err != nil {
		return err
	}
	var actorID any
	if user != uuid.Nil {
		actorID = user
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO audit_logs (workspace_id, actor_id, action, entity, entity_id, detail)
		VALUES ($1,$2,$3,$4,$5,$6)`, ws, actorID, action, entity, entityID, payload)
	return err
}
