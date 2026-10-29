package httpx

import (
	"errors"
	"net/http"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/problem"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/store"
)

func (s *Server) handleListAuditLogs(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	limit, offset, perr := pageParams(r, 20, 100)
	if perr != nil {
		perr.Write(w)
		return
	}
	logs, err := s.Store.ListAuditLogs(r.Context(), id.WorkspaceID, r.URL.Query().Get("action"), limit, offset)
	if err != nil {
		s.Log.Error("list audit logs", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, pageResponse[store.AuditLogRow]{
		Items:      logs,
		NextCursor: nextCursor(offset, len(logs), limit),
	})
}

func isNotFound(err error) bool { return errors.Is(err, store.ErrNotFound) }
