package httpx

import (
	"errors"
	"net/http"
	"strings"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/problem"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/store"
)

// ---------------------------------------------------------------------------
// Setup produksi via web (wizard /setup): status + apply.
// Hanya admin/owner. Di mode demo, GET tetap bisa dibaca (untuk pratinjau
// wizard) tetapi POST ditolak — setup nyata butuh backend produksi.
// ---------------------------------------------------------------------------

func (s *Server) handleSetupStatus(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())

	modes, mocks := s.mockModes()
	providers := map[string]string{
		"llm":       modes.LLM,
		"embedding": modes.Embedding,
		"vlm":       modes.VLM,
		"detector":  modes.Detector,
		"ocr":       modes.OCR,
	}
	st, err := s.Store.GetSetupStatus(r.Context(), id.WorkspaceID, id.UserID, providers, len(mocks) == 0)
	if err != nil {
		s.Log.Error("setup status", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

type setupApplyRequest struct {
	WorkspaceName string `json:"workspace_name"`
	AdminEmail    string `json:"admin_email"`
	AdminPassword string `json:"admin_password"`
	AdminName     string `json:"admin_name"`
	LLMProvider   string `json:"llm_provider"`
	LLMBaseURL    string `json:"llm_base_url"`
	LLMAPIKey     string `json:"llm_api_key"`
	LLMModel      string `json:"llm_model"`
}

func (s *Server) handleSetupApply(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())

	var req setupApplyRequest
	if perr := decodeJSON(w, r, &req, traceID); perr != nil {
		perr.Write(w)
		return
	}
	if strings.TrimSpace(req.AdminEmail) != "" {
		if !strings.Contains(req.AdminEmail, "@") {
			problem.Validation(traceID, problem.FieldError{Field: "admin_email", Message: "email tidak valid"}).Write(w)
			return
		}
		if len(req.AdminPassword) < 8 {
			problem.Validation(traceID, problem.FieldError{Field: "admin_password", Message: "minimal 8 karakter"}).Write(w)
			return
		}
	}

	st, err := s.Store.ApplySetup(r.Context(), id.WorkspaceID, id.UserID, store.SetupInput{
		WorkspaceName: req.WorkspaceName,
		AdminEmail:    req.AdminEmail,
		AdminPassword: req.AdminPassword,
		AdminName:     req.AdminName,
		LLMProvider:   req.LLMProvider,
		LLMBaseURL:    req.LLMBaseURL,
		LLMAPIKey:     req.LLMAPIKey,
		LLMModel:      req.LLMModel,
	}, s.Hasher.Hash)
	if err != nil {
		if errors.Is(err, store.ErrInvalidContext) {
			problem.Validation(traceID, problem.FieldError{Field: "workspace_name", Message: "nama 2-80 karakter"}).Write(w)
			return
		}
		s.Log.Error("setup apply", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	modes, mocks := s.mockModes()
	st.Providers = map[string]string{
		"llm":       modes.LLM,
		"embedding": modes.Embedding,
		"vlm":       modes.VLM,
		"detector":  modes.Detector,
		"ocr":       modes.OCR,
	}
	st.ProviderOK = len(mocks) == 0
	writeJSON(w, http.StatusOK, st)
}
