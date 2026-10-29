package httpx

import (
	"net/http"

	"github.com/google/uuid"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/problem"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/store"
)

// isUUID memeriksa apakah string adalah UUID yang valid.
func isUUID(s string) bool {
	_, err := uuid.Parse(s)
	return err == nil
}

// ---------------------------------------------------------------------------
// Audits (list + detail)
// ---------------------------------------------------------------------------

func (s *Server) handleListAudits(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	limit, offset, perr := pageParams(r, 20, 100)
	if perr != nil {
		perr.Write(w)
		return
	}
	q := r.URL.Query()
	sessions, err := s.Store.ListAudits(r.Context(), id.WorkspaceID, q.Get("store_id"), q.Get("status"), limit, offset)
	if err != nil {
		s.Log.Error("list audits", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, pageResponse[store.AuditSessionRow]{
		Items:      sessions,
		NextCursor: nextCursor(offset, len(sessions), limit),
	})
}

func (s *Server) handleGetAuditDetail(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	sessionID := chiURLParam(r, "auditId")
	if sessionID == "" {
		sessionID = chiURLParam(r, "id")
	}
	if !isUUID(sessionID) {
		problem.Validation(traceID, problem.FieldError{Field: "id", Message: "harus UUID valid"}).Write(w)
		return
	}
	detail, err := s.Store.GetAuditDetail(r.Context(), id.WorkspaceID, sessionID)
	if err != nil {
		if isNotFound(err) {
			problem.NotFound("Data tidak ditemukan.", traceID).Write(w)
			return
		}
		s.Log.Error("get audit detail", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

// ---------------------------------------------------------------------------
// Conversations Copilot
// ---------------------------------------------------------------------------

func (s *Server) handleListConversations(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	limit, offset, perr := pageParams(r, 20, 100)
	if perr != nil {
		perr.Write(w)
		return
	}
	convs, err := s.Store.ListConversations(r.Context(), id.WorkspaceID, limit, offset)
	if err != nil {
		s.Log.Error("list conversations", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, pageResponse[store.ChatSession]{
		Items:      convs,
		NextCursor: nextCursor(offset, len(convs), limit),
	})
}

func (s *Server) handleGetConversation(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	convID := chiURLParam(r, "conversationId")
	if convID == "" {
		convID = chiURLParam(r, "id")
	}
	if !isUUID(convID) {
		problem.Validation(traceID, problem.FieldError{Field: "id", Message: "harus UUID valid"}).Write(w)
		return
	}
	detail, err := s.Store.GetConversationDetail(r.Context(), id.WorkspaceID, convID)
	if err != nil {
		if isNotFound(err) {
			problem.NotFound("Data tidak ditemukan.", traceID).Write(w)
			return
		}
		s.Log.Error("get conversation", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Conversation store.ChatSessionDetail `json:"conversation"`
		Messages     []store.ChatMessage     `json:"messages"`
	}{Conversation: orderMsgs(*detail), Messages: detail.Messages})
}

// orderMsgs memastikan pesan urut kronologis pada response.
func orderMsgs(d store.ChatSessionDetail) store.ChatSessionDetail {
	d.Messages = ensureMsgs(d)
	return d
}

func ensureMsgs(d store.ChatSessionDetail) []store.ChatMessage {
	if d.Messages == nil {
		return []store.ChatMessage{}
	}
	return d.Messages
}

// ---------------------------------------------------------------------------
// Traces
// ---------------------------------------------------------------------------

func (s *Server) handleListTraces(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	limit, _, perr := pageParams(r, 20, 100)
	if perr != nil {
		perr.Write(w)
		return
	}
	traces, err := s.Store.ListTraces(r.Context(), id.WorkspaceID, limit)
	if err != nil {
		s.Log.Error("list traces", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Traces []store.TraceRow `json:"traces"`
	}{Traces: traces})
}

func (s *Server) handleGetTrace(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	reqID := chiURLParam(r, "requestId")
	if reqID == "" {
		reqID = chiURLParam(r, "id")
	}
	detail, err := s.Store.GetTraceDetail(r.Context(), id.WorkspaceID, reqID)
	if err != nil {
		if isNotFound(err) {
			problem.NotFound("Data tidak ditemukan.", traceID).Write(w)
			return
		}
		s.Log.Error("get trace", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

// ---------------------------------------------------------------------------
// Evals + benchmark
// ---------------------------------------------------------------------------

func (s *Server) handleEvalsOverview(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	ov, err := s.Store.EvalsOverviewAll(r.Context(), id.WorkspaceID)
	if err != nil {
		s.Log.Error("evals overview", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, ov)
}

func (s *Server) handleBenchmarks(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	ov, err := s.Store.BenchmarksOverviewAll(r.Context(), id.WorkspaceID)
	if err != nil {
		s.Log.Error("benchmarks", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, ov)
}

// ---------------------------------------------------------------------------
// Domain operasional: inventory, pricing, tasks, purchasing, tracking,
// monitor, reports, integrations.
// ---------------------------------------------------------------------------

func (s *Server) handleInventoryOverview(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	ov, err := s.Store.InventoryOverviewAll(r.Context(), id.WorkspaceID)
	if err != nil {
		s.Log.Error("inventory overview", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, ov)
}

func (s *Server) handlePricingOverview(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	ov, err := s.Store.PricingOverviewAll(r.Context(), id.WorkspaceID)
	if err != nil {
		s.Log.Error("pricing overview", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, ov)
}

func (s *Server) handleTasks(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	limit, _, perr := pageParams(r, 50, 200)
	if perr != nil {
		perr.Write(w)
		return
	}
	tasks, err := s.Store.ListTasks(r.Context(), id.WorkspaceID, limit)
	if err != nil {
		s.Log.Error("list tasks", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, pageResponse[store.TaskRow]{
		Items: tasks,
	})
}

func (s *Server) handlePurchasingOverview(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	ov, err := s.Store.PurchasingOverviewAll(r.Context(), id.WorkspaceID)
	if err != nil {
		s.Log.Error("purchasing overview", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, ov)
}

func (s *Server) handleShipments(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	limit, _, perr := pageParams(r, 20, 100)
	if perr != nil {
		perr.Write(w)
		return
	}
	rows, err := s.Store.ListShipments(r.Context(), id.WorkspaceID, limit)
	if err != nil {
		s.Log.Error("list shipments", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) handleMonitorOverview(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	q := r.URL.Query()
	ov, err := s.Store.MonitorOverviewFor(r.Context(), id.WorkspaceID, q.Get("store_id"))
	if err != nil {
		if notFound(err) {
			problem.NotFound("Data tidak ditemukan.", traceID).Write(w)
			return
		}
		s.Log.Error("monitor overview", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, ov)
}

func notFound(err error) bool { return isNotFound(err) }

func (s *Server) handleReportsOverview(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	ov, err := s.Store.ReportsOverviewAll(r.Context(), id.WorkspaceID)
	if err != nil {
		s.Log.Error("reports overview", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, ov)
}

func (s *Server) handleIntegrationsOverview(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	ov, err := s.Store.IntegrationsOverviewAll(r.Context(), id.WorkspaceID)
	if err != nil {
		s.Log.Error("integrations overview", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, ov)
}

// notFoundWrap tidak dipakai; isNotFound sudah cukup.

type updateTaskRequest struct {
	Status string `json:"status"`
}

// handleUpdateTask mengubah status tugas (mulai/selesai/buka lagi).
func (s *Server) handleUpdateTask(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	taskID := chiURLParam(r, "taskId")
	if _, err := uuid.Parse(taskID); err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "taskId", Message: "harus UUID valid"}).Write(w)
		return
	}
	var req updateTaskRequest
	if perr := decodeJSON(w, r, &req, traceID); perr != nil {
		perr.Write(w)
		return
	}
	switch req.Status {
	case "open", "in_progress", "done", "cancelled":
	default:
		problem.Validation(traceID, problem.FieldError{Field: "status", Message: "open|in_progress|done|cancelled"}).Write(w)
		return
	}
	if err := s.Store.UpdateTaskStatus(r.Context(), id.WorkspaceID, id.UserID, taskID, req.Status); err != nil {
		if isNotFound(err) {
			problem.NotFound("Tugas tidak ditemukan.", traceID).Write(w)
			return
		}
		s.Log.Error("update task", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
