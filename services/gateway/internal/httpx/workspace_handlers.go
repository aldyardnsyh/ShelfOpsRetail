package httpx

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/problem"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/rbac"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/store"
)

type workspaceUpdateRequest struct {
	Name   string `json:"name"`
	Locale string `json:"locale"`
}

type memberCreateRequest struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

type memberRoleRequest struct {
	Role string `json:"role"`
}

type storeCreateRequest struct {
	Code    string `json:"code"`
	Name    string `json:"name"`
	Region  string `json:"region"`
	Channel string `json:"channel"`
}

type planogramCreateRequest struct {
	Name   string         `json:"name"`
	Config map[string]any `json:"config"`
}

func (s *Server) handleGetWorkspace(w http.ResponseWriter, r *http.Request) {
	id, _ := IdentityFrom(r.Context())
	ws, err := s.Store.GetWorkspace(r.Context(), id.WorkspaceID, id.UserID)
	if err != nil {
		problem.NotFound("Workspace tidak ditemukan.", TraceID(r.Context())).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

func (s *Server) handleUpdateWorkspace(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	var req workspaceUpdateRequest
	if perr := decodeJSON(w, r, &req, traceID); perr != nil {
		perr.Write(w)
		return
	}
	if req.Locale != "" && req.Locale != "id" && req.Locale != "en" {
		problem.Validation(traceID, problem.FieldError{Field: "locale", Message: "harus id atau en"}).Write(w)
		return
	}
	// Workspace demo tidak boleh diubah namanya oleh pengunjung.
	if id.IsDemo && req.Name != "" {
		problem.Forbidden("Workspace demo tidak dapat diubah.", traceID).Write(w)
		return
	}
	ws, err := s.Store.UpdateWorkspace(r.Context(), id.WorkspaceID, id.UserID, req.Name, req.Locale)
	if err != nil {
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

func (s *Server) handleListMembers(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	members, err := s.Store.ListMembers(r.Context(), id.WorkspaceID, id.UserID)
	if err != nil {
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, members)
}

func (s *Server) handleAddMember(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	var req memberCreateRequest
	if perr := decodeJSON(w, r, &req, traceID); perr != nil {
		perr.Write(w)
		return
	}
	role, err := rbac.ParseRole(req.Role)
	if err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "role", Message: "role tidak dikenal"}).Write(w)
		return
	}
	m, err := s.Store.AddMemberByEmail(r.Context(), id.WorkspaceID, id.UserID, req.Email, role)
	if err != nil {
		if err == store.ErrNotFound {
			problem.Validation(traceID, problem.FieldError{Field: "email", Message: "pengguna dengan email ini belum terdaftar"}).Write(w)
			return
		}
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

func (s *Server) handleUpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	memberID := chiURLParam(r, "id")
	var req memberRoleRequest
	if perr := decodeJSON(w, r, &req, traceID); perr != nil {
		perr.Write(w)
		return
	}
	role, err := rbac.ParseRole(req.Role)
	if err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "role", Message: "role tidak dikenal"}).Write(w)
		return
	}
	if err := s.Store.UpdateMemberRole(r.Context(), id.WorkspaceID, id.UserID, memberID, role); err != nil {
		if err == store.ErrNotFound {
			problem.NotFound("Anggota tidak ditemukan.", traceID).Write(w)
			return
		}
		problem.Internal(traceID).Write(w)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleRemoveMember(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	if err := s.Store.RemoveMember(r.Context(), id.WorkspaceID, id.UserID, chiURLParam(r, "id")); err != nil {
		if err == store.ErrNotFound {
			problem.NotFound("Anggota tidak ditemukan.", traceID).Write(w)
			return
		}
		problem.Internal(traceID).Write(w)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleListStores(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	q := r.URL.Query()
	search := strings.TrimSpace(q.Get("q"))
	if search == "" {
		search = strings.TrimSpace(q.Get("search"))
	}
	stores, err := s.Store.ListStores(r.Context(), id.WorkspaceID, id.UserID, q.Get("region"), search)
	if err != nil {
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, stores)
}

func (s *Server) handleCreateStore(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	var req storeCreateRequest
	if perr := decodeJSON(w, r, &req, traceID); perr != nil {
		perr.Write(w)
		return
	}
	if req.Code == "" || req.Name == "" {
		problem.Validation(traceID,
			problem.FieldError{Field: "code", Message: "kode toko wajib"},
			problem.FieldError{Field: "name", Message: "nama toko wajib"},
		).Write(w)
		return
	}
	channel := req.Channel
	if channel == "" {
		channel = "minimarket"
	}
	st, err := s.Store.CreateStore(r.Context(), id.WorkspaceID, id.UserID, req.Code, req.Name, req.Region, channel)
	if err != nil {
		problem.Conflict("Kode toko sudah dipakai di workspace ini.", traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusCreated, st)
}

func (s *Server) handleListPlanograms(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	items, err := s.Store.ListPlanograms(r.Context(), id.WorkspaceID, id.UserID)
	if err != nil {
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) handleCreatePlanogram(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	var req planogramCreateRequest
	if perr := decodeJSON(w, r, &req, traceID); perr != nil {
		perr.Write(w)
		return
	}
	if req.Name == "" {
		problem.Validation(traceID, problem.FieldError{Field: "name", Message: "nama planogram wajib"}).Write(w)
		return
	}
	cfg := []byte("{}")
	if req.Config != nil {
		b, err := jsonMarshal(req.Config)
		if err != nil {
			problem.Validation(traceID, problem.FieldError{Field: "config", Message: "config bukan JSON valid"}).Write(w)
			return
		}
		cfg = b
	}
	p, err := s.Store.CreatePlanogram(r.Context(), id.WorkspaceID, id.UserID, req.Name, cfg)
	if err != nil {
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

func (s *Server) handleKpis(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	q := r.URL.Query()
	p := store.DefaultPeriod(q.Get("from"), q.Get("to"))
	k, err := s.Store.QueryKpis(r.Context(), id.WorkspaceID, p)
	if err != nil {
		s.Log.Error("query kpis", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, k)
}

func (s *Server) handleTrend(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	q := r.URL.Query()
	p := store.DefaultPeriod(q.Get("from"), q.Get("to"))
	days := 0
	if raw := q.Get("days"); raw != "" {
		days = atoiDefault(raw, 30)
		if days < 1 || days > 365 {
			problem.Validation(traceID, problem.FieldError{Field: "days", Message: "harus 1-365"}).Write(w)
			return
		}
		p.To = time.Now().AddDate(0, 0, 1)
		p.From = p.To.AddDate(0, 0, -days)
	}
	points, err := s.Store.QueryTrend(r.Context(), id.WorkspaceID, p, q.Get("region"))
	if err != nil {
		s.Log.Error("query trend", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	if days > 0 {
		points = fillDailyTrend(points, p, days)
	}
	writeJSON(w, http.StatusOK, points)
}

// fillDailyTrend memastikan seri harian lengkap: hari tanpa audit bernilai nol.
func fillDailyTrend(points []store.TrendPoint, p store.Period, days int) []store.TrendPoint {
	byDate := make(map[string]store.TrendPoint, len(points))
	for _, pt := range points {
		byDate[pt.Date] = pt
	}
	out := make([]store.TrendPoint, 0, days)
	start := p.To.AddDate(0, 0, -days)
	for i := 0; i < days; i++ {
		d := start.AddDate(0, 0, i).Format("2006-01-02")
		if pt, ok := byDate[d]; ok {
			out = append(out, pt)
			continue
		}
		out = append(out, store.TrendPoint{Date: d})
	}
	return out
}

func (s *Server) handleRanking(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	q := r.URL.Query()
	p := store.DefaultPeriod(q.Get("from"), q.Get("to"))
	limit := atoiDefault(q.Get("limit"), 10)
	if limit < 1 || limit > 50 {
		problem.Validation(traceID, problem.FieldError{Field: "limit", Message: "harus bilangan 1-50"}).Write(w)
		return
	}
	order := q.Get("order")
	switch order {
	case "", "best":
		order = "best"
	case "worst":
	default:
		problem.Validation(traceID, problem.FieldError{Field: "order", Message: "harus best atau worst"}).Write(w)
		return
	}
	rows, err := s.Store.QueryRanking(r.Context(), id.WorkspaceID, p, q.Get("region"), limit, order)
	if err != nil {
		s.Log.Error("query ranking", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) handleListAlerts(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	limit, offset, perr := pageParams(r, 20, 100)
	if perr != nil {
		perr.Write(w)
		return
	}
	q := r.URL.Query()
	alerts, err := s.Store.ListAlerts(r.Context(), id.WorkspaceID, q.Get("status"), q.Get("severity"), q.Get("type"), q.Get("store_id"), limit, offset)
	if err != nil {
		s.Log.Error("query alerts", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, alerts)
}

func (s *Server) handleUpdateAlert(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	alertID := chiURLParam(r, "alertId")
	if alertID == "" {
		alertID = chiURLParam(r, "id")
	}
	if _, err := uuid.Parse(alertID); err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "alertId", Message: "harus UUID valid"}).Write(w)
		return
	}
	var req struct {
		Action string `json:"action"`
		Status string `json:"status"`
		Note   string `json:"note"`
	}
	if perr := decodeJSON(w, r, &req, traceID); perr != nil {
		perr.Write(w)
		return
	}
	status := req.Status
	switch req.Action {
	case "":
		// kompatibilitas klien lama yang mengirim status langsung
	case "ack":
		status = "acknowledged"
	case "resolve":
		status = "resolved"
	default:
		problem.Validation(traceID, problem.FieldError{Field: "action", Message: "harus ack atau resolve"}).Write(w)
		return
	}
	switch status {
	case "open", "acknowledged", "resolved":
	default:
		problem.Validation(traceID, problem.FieldError{Field: "action", Message: "action harus ack atau resolve"}).Write(w)
		return
	}
	if len(req.Note) > 1000 {
		problem.Validation(traceID, problem.FieldError{Field: "note", Message: "maksimal 1000 karakter"}).Write(w)
		return
	}
	a, err := s.Store.UpdateAlertStatus(r.Context(), id.WorkspaceID, id.UserID, alertID, status, req.Note)
	if err != nil {
		if err == store.ErrNotFound {
			problem.NotFound("Alert tidak ditemukan.", traceID).Write(w)
			return
		}
		s.Log.Error("update alert", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func atoiDefault(s string, def int) int {
	if s == "" {
		return def
	}
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return def
		}
		n = n*10 + int(c-'0')
		if n > 100000 {
			return def
		}
	}
	if n == 0 {
		return def
	}
	return n
}

func jsonMarshal(v any) ([]byte, error) { return jsonMarshalIndent(v) }
