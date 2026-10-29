package httpx

import (
	"net/http"

	"github.com/google/uuid"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/problem"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/store"
)

func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	limit, offset, perr := pageParams(r, 20, 100)
	if perr != nil {
		perr.Write(w)
		return
	}
	storeID := r.URL.Query().Get("storeId")
	if storeID == "" {
		storeID = r.URL.Query().Get("store_id")
	}
	if storeID != "" {
		if _, err := uuid.Parse(storeID); err != nil {
			problem.Validation(traceID, problem.FieldError{Field: "storeId", Message: "harus UUID valid"}).Write(w)
			return
		}
	}
	sessions, err := s.Store.ListSessions(r.Context(), id.WorkspaceID, storeID, limit, offset)
	if err != nil {
		s.Log.Error("list sessions", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, pageResponse[store.SessionRow]{
		Items:      sessions,
		NextCursor: nextCursor(offset, len(sessions), limit),
	})
}

func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	sessionID := chiURLParam(r, "sessionId")
	if _, err := uuid.Parse(sessionID); err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "sessionId", Message: "harus UUID valid"}).Write(w)
		return
	}
	detail, err := s.Store.GetSessionDetail(r.Context(), id.WorkspaceID, sessionID)
	if err != nil {
		if isNotFound(err) {
			problem.NotFound("Sesi audit tidak ditemukan.", traceID).Write(w)
			return
		}
		s.Log.Error("get session detail", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}
