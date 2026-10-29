package httpx

import (
	"net/http"

	"github.com/google/uuid"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/problem"
)

func (s *Server) handleGetStore(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	storeID := chiURLParam(r, "storeId")
	if _, err := uuid.Parse(storeID); err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "storeId", Message: "harus UUID valid"}).Write(w)
		return
	}
	detail, err := s.Store.GetStoreDetail(r.Context(), id.WorkspaceID, storeID)
	if err != nil {
		if isNotFound(err) {
			problem.NotFound("Toko tidak ditemukan.", traceID).Write(w)
			return
		}
		s.Log.Error("get store detail", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}
