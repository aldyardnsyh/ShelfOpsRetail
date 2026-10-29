package httpx

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	shelfopsv1 "github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/gen/shelfops/v1"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/problem"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/store"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/upload"
)

const maxAuditImageBody = 11 << 20 // 10 MB + overhead multipart

type createAuditRequest struct {
	StoreID     string  `json:"store_id"`
	PlanogramID *string `json:"planogram_id"`
}

type auditImageResponse struct {
	ID         string `json:"id"`
	SessionID  string `json:"session_id"`
	Status     string `json:"status"`
	StorageKey string `json:"storage_key"`
}

// handleCreateAudit membuat sesi audit draft untuk satu toko.
func (s *Server) handleCreateAudit(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())

	var req createAuditRequest
	if perr := decodeJSON(w, r, &req, traceID); perr != nil {
		perr.Write(w)
		return
	}
	storeID := strings.TrimSpace(req.StoreID)
	if _, err := uuid.Parse(storeID); err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "store_id", Message: "harus UUID valid"}).Write(w)
		return
	}
	if req.PlanogramID != nil {
		pid := strings.TrimSpace(*req.PlanogramID)
		if pid == "" {
			req.PlanogramID = nil
		} else if _, err := uuid.Parse(pid); err != nil {
			problem.Validation(traceID, problem.FieldError{Field: "planogram_id", Message: "harus UUID valid"}).Write(w)
			return
		} else {
			req.PlanogramID = &pid
		}
	}

	session, err := s.Store.CreateAuditSession(r.Context(), id.WorkspaceID, id.UserID, storeID, req.PlanogramID)
	if err != nil {
		if isNotFound(err) {
			problem.NotFound("Toko tidak ditemukan di workspace ini.", traceID).Write(w)
			return
		}
		s.Log.Error("create audit session", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusCreated, session)
}

// handleUploadAuditImage menerima satu foto rak (multipart) untuk sesi audit.
func (s *Server) handleUploadAuditImage(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	sessionID := chiURLParam(r, "auditId")
	if _, err := uuid.Parse(sessionID); err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "auditId", Message: "harus UUID valid"}).Write(w)
		return
	}
	if s.Objects == nil {
		problem.ServiceUnavailable("Object store belum dikonfigurasi.", traceID).Write(w)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxAuditImageBody)
	if err := r.ParseMultipartForm(4 << 20); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			problem.New(http.StatusRequestEntityTooLarge, "Foto terlalu besar", "Maksimal 10 MB.", traceID).Write(w)
			return
		}
		problem.BadRequest("Form multipart tidak valid.", traceID).Write(w)
		return
	}
	if r.MultipartForm != nil {
		defer func() { _ = r.MultipartForm.RemoveAll() }()
	}

	file, fh, err := r.FormFile("file")
	if err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "file", Message: "foto wajib diunggah"}).Write(w)
		return
	}
	defer file.Close()

	declared := fh.Header.Get("Content-Type")
	ruleMIME := declared
	if strings.EqualFold(strings.TrimSpace(strings.Split(declared, ";")[0]), "application/octet-stream") {
		ruleMIME = ""
	}
	rule, err := upload.FindRule(upload.KindImage, fh.Filename, ruleMIME)
	if err != nil {
		problem.UnsupportedMedia("Tipe foto tidak didukung. Gunakan JPG, PNG, atau WEBP.", traceID).Write(w)
		return
	}
	head, replay, err := upload.ReadHead(file, 4096)
	if err != nil {
		problem.BadRequest("Foto tidak dapat dibaca.", traceID).Write(w)
		return
	}
	if err := upload.Validate(rule, head, fh.Size); err != nil {
		if errors.Is(err, upload.ErrTooLarge) {
			problem.New(http.StatusRequestEntityTooLarge, "Foto terlalu besar", "Maksimal 10 MB.", traceID).Write(w)
			return
		}
		problem.UnsupportedMedia("Tipe foto tidak didukung.", traceID).Write(w)
		return
	}

	mime := declared
	if ruleMIME == "" || mime == "" {
		mime = rule.Mimes[0]
	}
	ext := strings.ToLower(rule.Extension)
	if ext == "" || ext == "." {
		ext = strings.ToLower(filepath.Ext(fh.Filename))
	}
	objectKey := fmt.Sprintf("audits/%s/%s/%s%s", id.WorkspaceID, sessionID, uuid.Must(uuid.NewV7()), ext)
	if err := s.Objects.Put(r.Context(), objectKey, replay, fh.Size, mime); err != nil {
		s.Log.Error("simpan foto audit", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}

	imageID, err := s.Store.InsertAuditImage(r.Context(), id.WorkspaceID, id.UserID, sessionID, store.NewAuditImage{
		StorageKey: objectKey,
		MIME:       mime,
		SizeBytes:  fh.Size,
	})
	if err != nil {
		if isNotFound(err) {
			problem.NotFound("Sesi audit tidak ditemukan.", traceID).Write(w)
			return
		}
		s.Log.Error("catat foto audit", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}

	writeJSON(w, http.StatusCreated, auditImageResponse{
		ID: imageID, SessionID: sessionID, Status: "uploaded", StorageKey: objectKey,
	})
}

// handleStartAudit menjalankan deteksi untuk seluruh foto yang belum diproses,
// menyimpan deteksi + price tag, lalu menghitung metrik dan menutup sesi.
func (s *Server) handleStartAudit(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	sessionID := chiURLParam(r, "auditId")
	if _, err := uuid.Parse(sessionID); err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "auditId", Message: "harus UUID valid"}).Write(w)
		return
	}
	if s.Vision == nil {
		problem.ServiceUnavailable("Layanan computer vision tidak dikonfigurasi pada deployment ini.", traceID).Write(w)
		return
	}

	pending, err := s.Store.PendingAuditImages(r.Context(), id.WorkspaceID, id.UserID, sessionID)
	if err != nil {
		if isNotFound(err) {
			problem.NotFound("Sesi audit tidak ditemukan.", traceID).Write(w)
			return
		}
		s.Log.Error("siapkan audit", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	if len(pending) == 0 {
		problem.Validation(traceID, problem.FieldError{Field: "images", Message: "unggah minimal satu foto sebelum memulai"}).Write(w)
		return
	}

	// OCR hanya dijalankan bila pembacaan label memang aktif. Stub OCR tidak
	// dipakai untuk mengarang harga.
	runOCR := s.Cfg.VLMProvider != "" && s.Cfg.VLMProvider != "off"
	processed, failed := 0, 0
	var lastErr string

	for _, img := range pending {
		ctx, cancel := context.WithTimeout(r.Context(), s.Cfg.VisionTimeout)
		resp, err := s.Vision.Detect(ctx, &shelfopsv1.DetectRequest{
			RequestId:           uuid.Must(uuid.NewV7()).String(),
			ImageUri:            img.StorageKey,
			WorkspaceId:         id.WorkspaceID.String(),
			RunOcr:              runOCR,
			ConfThreshold:       float32(0.25),
			ReferencePricesJson: "{}",
			Imgsz:               0,
		})
		cancel()

		if err != nil {
			failed++
			lastErr = "deteksi gagal: layanan vision tidak dapat dijangkau"
			_ = s.Store.MarkAuditImageFailed(r.Context(), id.WorkspaceID, id.UserID, img.ID, lastErr)
			s.Log.Warn("vision detect gagal", "trace_id", traceID, "image_id", img.ID, "error", err)
			continue
		}
		if resp.GetError() != "" {
			failed++
			lastErr = "deteksi gagal: " + resp.GetError()
			_ = s.Store.MarkAuditImageFailed(r.Context(), id.WorkspaceID, id.UserID, img.ID, lastErr)
			continue
		}

		boxes := make([]store.DetectionInput, 0, len(resp.GetBoxes()))
		for _, b := range resp.GetBoxes() {
			boxes = append(boxes, store.DetectionInput{
				X1: float64(b.GetX1()), Y1: float64(b.GetY1()),
				X2: float64(b.GetX2()), Y2: float64(b.GetY2()),
				Confidence: float64(b.GetConfidence()),
				Label:      b.GetLabel(), LabelScore: float64(b.GetLabelScore()),
			})
		}
		if err := s.Store.ReplaceDetections(r.Context(), id.WorkspaceID, id.UserID, img.ID,
			boxes, int(resp.GetWidth()), int(resp.GetHeight()), resp.GetLowConfidence()); err != nil {
			failed++
			lastErr = "deteksi gagal disimpan"
			_ = s.Store.MarkAuditImageFailed(r.Context(), id.WorkspaceID, id.UserID, img.ID, lastErr)
			s.Log.Error("simpan deteksi", "trace_id", traceID, "image_id", img.ID, "error", err)
			continue
		}

		tags := make([]store.PriceTagInput, 0, len(resp.GetPriceTags()))
		for _, t := range resp.GetPriceTags() {
			b := t.GetBox()
			if b == nil {
				continue
			}
			tags = append(tags, store.PriceTagInput{
				X1: float64(b.GetX1()), Y1: float64(b.GetY1()),
				X2: float64(b.GetX2()), Y2: float64(b.GetY2()),
				RawText:           t.GetRawText(),
				PriceIDR:          t.GetPriceIdr(),
				OCRConfidence:     float64(t.GetOcrConfidence()),
				MatchedLabel:      t.GetMatchedLabel(),
				ReferencePriceIDR: t.GetReferencePriceIdr(),
				Mismatch:          t.GetMismatch(),
			})
		}
		if err := s.Store.ReplacePriceTags(r.Context(), id.WorkspaceID, id.UserID, img.ID, tags); err != nil {
			s.Log.Warn("simpan price tag", "trace_id", traceID, "image_id", img.ID, "error", err)
		}
		processed++
	}

	metrics, err := s.Store.ComputeAuditMetrics(r.Context(), id.WorkspaceID, id.UserID, sessionID)
	if err != nil {
		s.Log.Error("hitung metrik audit", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	status, processedTotal, err := s.Store.AuditSessionStatus(r.Context(), id.WorkspaceID, id.UserID, sessionID)
	if err != nil {
		s.Log.Error("status audit", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	summary := store.AuditStartSummary{
		SessionID:       sessionID,
		Status:          status,
		Score:           metrics.ComplianceScore,
		ImagesProcessed: processed,
		ImagesFailed:    failed,
		Metrics:         *metrics,
		StartedAt:       time.Now().UTC(),
	}
	if processedTotal == 0 {
		detail := lastErr
		if detail == "" {
			detail = "tidak ada foto yang berhasil diproses"
		}
		problem.New(http.StatusBadGateway, "Analisis foto gagal", detail, traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

// handleFinalizeAudit menutup sesi audit menjadi "final" dan menurunkan alert
// serta satu task tindak lanjut dari temuan OOS / price mismatch. Status selain
// review/partial ditolak 409 agar pemanggilan ulang tidak membuat alert ganda.
func (s *Server) handleFinalizeAudit(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	sessionID := chiURLParam(r, "auditId")
	if _, err := uuid.Parse(sessionID); err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "auditId", Message: "harus UUID valid"}).Write(w)
		return
	}

	res, err := s.Store.FinalizeAudit(r.Context(), id.WorkspaceID, id.UserID, sessionID)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrNotFound):
			problem.NotFound("Sesi audit tidak ditemukan.", traceID).Write(w)
		case errors.Is(err, store.ErrInvalidState):
			reason := strings.TrimPrefix(err.Error(), store.ErrInvalidState.Error())
			reason = strings.TrimPrefix(reason, ": ")
			if reason == "" {
				reason = "Sesi audit tidak berada pada status review atau partial."
			}
			problem.New(http.StatusConflict, "Audit tidak bisa difinalisasi", reason, traceID).Write(w)
		default:
			s.Log.Error("finalisasi audit", "trace_id", traceID, "session_id", sessionID, "error", err)
			problem.Internal(traceID).Write(w)
		}
		return
	}
	writeJSON(w, http.StatusOK, res)
}
