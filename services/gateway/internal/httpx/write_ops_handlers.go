package httpx

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/problem"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/store"
)

// ---------------------------------------------------------------------------
// Aksi tulis operasional (G4): purchase order + penerimaan barang.
//
//-Web masih menyimpan form ini di state lokal; endpoint ini membuat datanya
// benar-benar persisten di server.
// ---------------------------------------------------------------------------

type createPurchaseOrderRequest struct {
	StoreID      string `json:"store_id"`
	SupplierID   string `json:"supplier_id"`
	ExpectedDate string `json:"expected_date"`
	Notes        string `json:"notes"`
	Items        []struct {
		ProductID   string `json:"product_id"`
		QtyOrder    int    `json:"qty_order"`
		UnitCostIDR int64  `json:"unit_cost_idr"`
	} `json:"items"`
}

// handleCreatePurchaseOrder membuat purchase order baru beserta baris-barisnya.
func (s *Server) handleCreatePurchaseOrder(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())

	var req createPurchaseOrderRequest
	if perr := decodeJSON(w, r, &req, traceID); perr != nil {
		perr.Write(w)
		return
	}
	if _, err := uuid.Parse(strings.TrimSpace(req.StoreID)); err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "store_id", Message: "harus UUID valid"}).Write(w)
		return
	}
	if _, err := uuid.Parse(strings.TrimSpace(req.SupplierID)); err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "supplier_id", Message: "harus UUID valid"}).Write(w)
		return
	}
	if len(req.Items) == 0 {
		problem.Validation(traceID, problem.FieldError{Field: "items", Message: "minimal satu baris barang"}).Write(w)
		return
	}
	items := make([]store.PurchaseOrderItemInput, 0, len(req.Items))
	for index, item := range req.Items {
		field := "items[" + strconv.Itoa(index) + "]"
		if _, err := uuid.Parse(strings.TrimSpace(item.ProductID)); err != nil {
			problem.Validation(traceID, problem.FieldError{Field: field + ".product_id", Message: "harus UUID valid"}).Write(w)
			return
		}
		if item.QtyOrder <= 0 {
			problem.Validation(traceID, problem.FieldError{Field: field + ".qty_order", Message: "harus lebih besar dari 0"}).Write(w)
			return
		}
		if item.UnitCostIDR < 0 {
			problem.Validation(traceID, problem.FieldError{Field: field + ".unit_cost_idr", Message: "tidak boleh negatif"}).Write(w)
			return
		}
		items = append(items, store.PurchaseOrderItemInput{
			ProductID:   strings.TrimSpace(item.ProductID),
			QtyOrder:    item.QtyOrder,
			UnitCostIDR: item.UnitCostIDR,
		})
	}

	po, err := s.Store.CreatePurchaseOrder(r.Context(), id.WorkspaceID, id.UserID, store.PurchaseOrderInput{
		StoreID:      strings.TrimSpace(req.StoreID),
		SupplierID:   strings.TrimSpace(req.SupplierID),
		ExpectedDate: strings.TrimSpace(req.ExpectedDate),
		Notes:        strings.TrimSpace(req.Notes),
		Items:        items,
	})
	if err != nil {
		switch {
		case errors.Is(err, store.ErrNotFound):
			problem.NotFound("Toko, supplier, atau produk tidak ditemukan di workspace ini.", traceID).Write(w)
		case errors.Is(err, store.ErrConflict):
			problem.New(http.StatusConflict, "Purchase order tidak bisa dibuat", err.Error(), traceID).Write(w)
		default:
			s.Log.Error("buat purchase order", "trace_id", traceID, "error", err)
			problem.Internal(traceID).Write(w)
		}
		return
	}
	writeJSON(w, http.StatusCreated, po)
}

type createGoodsReceiptRequest struct {
	StoreID        string `json:"store_id"`
	POID           string `json:"purchase_order_id"`
	IdempotencyKey string `json:"idempotency_key"`
	Notes          string `json:"notes"`
	Items          []struct {
		PoLineID    string `json:"po_line_id"`
		QtyReceived int    `json:"qty_received"`
	} `json:"items"`
}

// handleCreateGoodsReceipt mencatat penerimaan barang: menambah stok,
// menambah qty_received pada PO, dan menulis jejak pergerakan.
func (s *Server) handleCreateGoodsReceipt(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())

	var req createGoodsReceiptRequest
	if perr := decodeJSON(w, r, &req, traceID); perr != nil {
		perr.Write(w)
		return
	}
	if _, err := uuid.Parse(strings.TrimSpace(req.POID)); err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "purchase_order_id", Message: "harus UUID valid"}).Write(w)
		return
	}
	if len(req.Items) == 0 {
		problem.Validation(traceID, problem.FieldError{Field: "items", Message: "minimal satu baris barang"}).Write(w)
		return
	}
	items := make([]store.GoodsReceiptItemInput, 0, len(req.Items))
	for index, item := range req.Items {
		field := "items[" + strconv.Itoa(index) + "]"
		if _, err := uuid.Parse(strings.TrimSpace(item.PoLineID)); err != nil {
			problem.Validation(traceID, problem.FieldError{Field: field + ".po_line_id", Message: "harus UUID valid"}).Write(w)
			return
		}
		if item.QtyReceived <= 0 {
			problem.Validation(traceID, problem.FieldError{Field: field + ".qty_received", Message: "harus lebih besar dari 0"}).Write(w)
			return
		}
		items = append(items, store.GoodsReceiptItemInput{
			PoLineID:    strings.TrimSpace(item.PoLineID),
			QtyReceived: item.QtyReceived,
		})
	}

	// Idempotency key boleh dari body atau header (klien HTTP umum memakai header).
	key := strings.TrimSpace(req.IdempotencyKey)
	if key == "" {
		key = strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	}
	if len(key) > 120 {
		problem.Validation(traceID, problem.FieldError{Field: "idempotency_key", Message: "maksimal 120 karakter"}).Write(w)
		return
	}

	receipt, err := s.Store.CreateGoodsReceipt(r.Context(), id.WorkspaceID, id.UserID, store.GoodsReceiptInput{
		StoreID:        strings.TrimSpace(req.StoreID),
		POID:           strings.TrimSpace(req.POID),
		IdempotencyKey: key,
		Notes:          strings.TrimSpace(req.Notes),
		Items:          items,
	})
	if err != nil {
		switch {
		case errors.Is(err, store.ErrNotFound):
			problem.NotFound("Purchase order atau barisnya tidak ditemukan.", traceID).Write(w)
		case errors.Is(err, store.ErrConflict):
			problem.New(http.StatusConflict, "Penerimaan barang tidak bisa diproses", err.Error(), traceID).Write(w)
		default:
			s.Log.Error("catat penerimaan barang", "trace_id", traceID, "error", err)
			problem.Internal(traceID).Write(w)
		}
		return
	}

	status := http.StatusCreated
	if receipt.IdempotentReplay {
		// Permintaan yang sama diulang: kembalikan dokumen yang sama, bukan error.
		status = http.StatusOK
	}
	writeJSON(w, status, receipt)
}
