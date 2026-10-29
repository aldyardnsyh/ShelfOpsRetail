package httpx

import (
	"net/http"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/problem"
)

func (s *Server) handleListEvals(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	limit := atoiDefault(r.URL.Query().Get("limit"), 20)
	runs, err := s.Store.ListEvalRuns(r.Context(), id.WorkspaceID, limit)
	if err != nil {
		s.Log.Error("list eval runs", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, runs)
}

type toolDefinition struct {
	Name                 string         `json:"name"`
	Description          string         `json:"description"`
	Source               string         `json:"source"`
	Permission           string         `json:"permission"`
	RequiresConfirmation bool           `json:"requires_confirmation"`
	Parameters           map[string]any `json:"parameters"`
}

// agentTools adalah registri kontrak tool agent (PRD §9.2). Eksekusi tool
// data audit tetap di Go; ai-rag hanya memilih tool & argumen.
var agentTools = []toolDefinition{
	{
		Name:        "search_knowledge",
		Description: "Cari dokumen SOP/pengetahuan workspace",
		Source:      "ai-rag",
		Permission:  "document.read",
		Parameters: map[string]any{
			"query":   map[string]any{"type": "string", "required": true},
			"filters": map[string]any{"type": "object", "required": false},
		},
	},
	{
		Name:        "get_audit_summary",
		Description: "Ringkasan metrik audit satu toko pada rentang tanggal",
		Source:      "gateway",
		Permission:  "dashboard.read",
		Parameters: map[string]any{
			"store_id": map[string]any{"type": "string", "format": "uuid", "required": true},
			"from":     map[string]any{"type": "string", "format": "date", "required": false},
			"to":       map[string]any{"type": "string", "format": "date", "required": false},
		},
	},
	{
		Name:        "compare_stores",
		Description: "Bandingkan KPI dua toko",
		Source:      "gateway",
		Permission:  "dashboard.read",
		Parameters: map[string]any{
			"store_ids": map[string]any{"type": "array", "items": "string", "required": true},
			"from":      map[string]any{"type": "string", "format": "date", "required": false},
			"to":        map[string]any{"type": "string", "format": "date", "required": false},
		},
	},
	{
		Name:        "list_alerts",
		Description: "Daftar alert terbuka dengan filter status/severity",
		Source:      "gateway",
		Permission:  "dashboard.read",
		Parameters: map[string]any{
			"status":   map[string]any{"type": "string", "required": false},
			"severity": map[string]any{"type": "string", "required": false},
			"limit":    map[string]any{"type": "integer", "required": false},
		},
	},
	{
		Name:                 "create_followup_task",
		Description:          "Buat tugas tindak lanjut (aksi tulis, wajib konfirmasi pengguna)",
		Source:               "gateway",
		Permission:           "task.write",
		RequiresConfirmation: true,
		Parameters: map[string]any{
			"store_id": map[string]any{"type": "string", "format": "uuid", "required": true},
			"title":    map[string]any{"type": "string", "required": true},
			"due_at":   map[string]any{"type": "string", "format": "date-time", "required": false},
		},
	},
}

func (s *Server) handleListTools(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, agentTools)
}
