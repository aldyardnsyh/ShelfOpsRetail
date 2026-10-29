package httpx

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/problem"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/store"
)

// ---------------------------------------------------------------------------
// Aksi tulis operasional (G4 lanjutan): laporan + jadwal, konektor +
// uji koneksi + rotasi API key.
// ---------------------------------------------------------------------------

type createReportRequest struct {
	Title      string `json:"title"`
	Kind       string `json:"kind"`
	PeriodFrom string `json:"period_from"`
	PeriodTo   string `json:"period_to"`
	Scope      string `json:"scope"`
	Format     string `json:"format"`
}

func (s *Server) handleCreateReport(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())

	var req createReportRequest
	if perr := decodeJSON(w, r, &req, traceID); perr != nil {
		perr.Write(w)
		return
	}

	rep, err := s.Store.CreateReport(r.Context(), id.WorkspaceID, id.UserID, store.ReportInput{
		Title:      req.Title,
		Kind:       req.Kind,
		PeriodFrom: req.PeriodFrom,
		PeriodTo:   req.PeriodTo,
		Scope:      req.Scope,
		Format:     req.Format,
	})
	if err != nil {
		if errors.Is(err, store.ErrInvalidContext) {
			problem.Validation(traceID, problem.FieldError{Field: "input", Message: err.Error()}).Write(w)
			return
		}
		s.Log.Error("buat laporan", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusCreated, rep)
}

type createReportScheduleRequest struct {
	Name       string   `json:"name"`
	Cadence    string   `json:"cadence"`
	Scope      string   `json:"scope"`
	Format     string   `json:"format"`
	Recipients []string `json:"recipients"`
}

func (s *Server) handleCreateReportSchedule(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())

	var req createReportScheduleRequest
	if perr := decodeJSON(w, r, &req, traceID); perr != nil {
		perr.Write(w)
		return
	}

	sc, err := s.Store.CreateReportSchedule(r.Context(), id.WorkspaceID, id.UserID, store.ReportScheduleInput{
		Name:       req.Name,
		Cadence:    req.Cadence,
		Scope:      req.Scope,
		Format:     req.Format,
		Recipients: req.Recipients,
	})
	if err != nil {
		if errors.Is(err, store.ErrInvalidContext) {
			problem.Validation(traceID, problem.FieldError{Field: "input", Message: err.Error()}).Write(w)
			return
		}
		s.Log.Error("buat jadwal laporan", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusCreated, sc)
}

type createIntegrationRequest struct {
	Name       string `json:"name"`
	Kind       string `json:"kind"`
	StoreScope string `json:"store_scope"`
	Note       string `json:"note"`
}

func (s *Server) handleCreateIntegration(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())

	var req createIntegrationRequest
	if perr := decodeJSON(w, r, &req, traceID); perr != nil {
		perr.Write(w)
		return
	}

	integ, err := s.Store.CreateIntegration(r.Context(), id.WorkspaceID, id.UserID, store.IntegrationInput{
		Name:       req.Name,
		Kind:       req.Kind,
		StoreScope: req.StoreScope,
		Note:       req.Note,
	})
	if err != nil {
		if errors.Is(err, store.ErrInvalidContext) {
			problem.Validation(traceID, problem.FieldError{Field: "input", Message: err.Error()}).Write(w)
			return
		}
		s.Log.Error("buat konektor", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusCreated, integ)
}

func (s *Server) handleTestIntegration(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	integrationID := chi.URLParam(r, "integrationId")

	run, err := s.Store.TestIntegration(r.Context(), id.WorkspaceID, id.UserID, integrationID)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrNotFound):
			problem.NotFound("Konektor tidak ditemukan di workspace ini.", traceID).Write(w)
		case errors.Is(err, store.ErrInvalidContext):
			problem.Validation(traceID, problem.FieldError{Field: "integrationId", Message: err.Error()}).Write(w)
		default:
			s.Log.Error("uji konektor", "trace_id", traceID, "error", err)
			problem.Internal(traceID).Write(w)
		}
		return
	}
	writeJSON(w, http.StatusOK, run)
}

func (s *Server) handleRotateAPIKey(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	keyID := chi.URLParam(r, "keyId")

	out, err := s.Store.RotateAPIKey(r.Context(), id.WorkspaceID, id.UserID, keyID)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrNotFound):
			problem.NotFound("API key aktif tidak ditemukan di workspace ini.", traceID).Write(w)
		case errors.Is(err, store.ErrInvalidContext):
			problem.Validation(traceID, problem.FieldError{Field: "keyId", Message: err.Error()}).Write(w)
		default:
			s.Log.Error("rotasi API key", "trace_id", traceID, "error", err)
			problem.Internal(traceID).Write(w)
		}
		return
	}
	writeJSON(w, http.StatusOK, out)
}
