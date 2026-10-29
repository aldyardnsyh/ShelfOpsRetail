package httpx

import (
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/auth"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/problem"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/rbac"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/store"
)

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type meResponse struct {
	User        meUser   `json:"user"`
	Workspace   wsBrief  `json:"workspace"`
	Role        string   `json:"role"`
	Permissions []string `json:"permissions"`
	Demo        bool     `json:"demo"`
}

type meUser struct {
	ID     string `json:"id"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	Locale string `json:"locale"`
}

type wsBrief struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	IsDemo        bool    `json:"is_demo"`
	DemoExpiresAt *string `json:"demo_expires_at"`
	Locale        string  `json:"locale"`
}

// handleLogin memverifikasi kredensial lalu menerbitkan access+refresh cookie.
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	var req loginRequest
	if perr := decodeJSON(w, r, &req, traceID); perr != nil {
		perr.Write(w)
		return
	}
	if req.Email == "" || req.Password == "" {
		problem.Validation(traceID,
			problem.FieldError{Field: "email", Message: "email wajib diisi"},
			problem.FieldError{Field: "password", Message: "password wajib diisi"},
		).Write(w)
		return
	}

	user, err := s.Store.LookupUserByEmail(r.Context(), req.Email)
	if err != nil || user.PasswordHash == "" {
		// Pesan seragam: jangan membocorkan apakah email terdaftar.
		problem.Unauthorized("Email atau password salah.", traceID).Write(w)
		return
	}
	ok, err := s.Hasher.Verify(req.Password, user.PasswordHash)
	if err != nil {
		s.Log.Error("verify password", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	if !ok {
		problem.Unauthorized("Email atau password salah.", traceID).Write(w)
		return
	}

	m, err := s.Store.LookupMembership(r.Context(), user.ID)
	if err != nil {
		problem.Forbidden("Akun ini belum terhubung ke workspace.", traceID).Write(w)
		return
	}
	_ = s.Store.UpdateLastLogin(r.Context(), m.WorkspaceID, user.ID)

	s.respondWithSession(w, r, *user, *m)
}

// handleDemo membuat sesi demo satu klik (FR-AUTH-02, D-017).
func (s *Server) handleDemo(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	if !s.Cfg.DemoEnabled {
		problem.Forbidden("Mode demo sedang dimatikan.", traceID).Write(w)
		return
	}
	ctx := r.Context()
	email := auth.NewDemoEmail()
	name := "Pengunjung Demo"
	userID, err := s.Store.CreateUser(ctx, s.Cfg.DemoWorkspaceID, email, name, "", rbac.RoleAnalyst, true)
	if err != nil {
		s.Log.Error("buat user demo", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	user, err := s.Store.LookupUserByID(ctx, userID)
	if err != nil {
		s.Log.Error("lookup user demo", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	m, err := s.Store.LookupMembership(ctx, userID)
	if err != nil {
		s.Log.Error("lookup membership demo", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	_ = s.Store.LogAudit(ctx, uuid.MustParse(m.WorkspaceID), uuid.MustParse(userID), "auth.demo.start", "users", &userID,
		map[string]any{"ip": ClientIP(r)})
	s.respondWithSession(w, r, *user, *m)
}

// handleRefresh memutar refresh token (FR-AUTH-01: refresh rotation).
func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	c, err := r.Cookie(cookieRefresh)
	if err != nil || c.Value == "" {
		problem.Unauthorized("Refresh token tidak ada.", traceID).Write(w)
		return
	}
	hash := auth.HashRefreshToken(s.Cfg.SessionSecret, c.Value)
	row, err := s.Store.LookupRefresh(r.Context(), hash)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			s.clearAuthCookies(w)
			problem.Unauthorized("Refresh token tidak dikenal.", traceID).Write(w)
			return
		}
		problem.Internal(traceID).Write(w)
		return
	}
	if row.RevokedAt != nil {
		// Token sudah dipakai/dicabut → kemungkinan pencurian: cabut semua sesi user.
		n, _ := s.Store.RevokeAllUserTokens(r.Context(), row.UserID, "refresh token reuse terdeteksi")
		s.Log.Warn("refresh token reuse", "trace_id", traceID, "user_id", row.UserID, "revoked", n)
		s.clearAuthCookies(w)
		problem.Unauthorized("Sesi dicabut karena token digunakan ulang. Silakan masuk kembali.", traceID).Write(w)
		return
	}
	if time.Now().After(row.ExpiresAt) {
		s.clearAuthCookies(w)
		problem.Unauthorized("Refresh token kedaluwarsa.", traceID).Write(w)
		return
	}

	user, err := s.Store.LookupUserByID(r.Context(), row.UserID)
	if err != nil {
		problem.Internal(traceID).Write(w)
		return
	}
	m, err := s.Store.LookupMembership(r.Context(), row.UserID)
	if err != nil {
		problem.Internal(traceID).Write(w)
		return
	}
	_ = s.Store.RevokeRefresh(r.Context(), row.WorkspaceID, row.UserID, row.ID)
	s.respondWithSession(w, r, *user, *m)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	if c, err := r.Cookie(cookieRefresh); err == nil && c.Value != "" {
		hash := auth.HashRefreshToken(s.Cfg.SessionSecret, c.Value)
		if row, err := s.Store.LookupRefresh(r.Context(), hash); err == nil {
			_ = s.Store.RevokeRefresh(r.Context(), row.WorkspaceID, row.UserID, row.ID)
		}
	}
	s.clearAuthCookies(w)
	_ = traceID
	w.WriteHeader(http.StatusNoContent)
}

// handleGoogleStart menandai fitur belum dikonfigurasi, bukan pura-pura jalan
// (kredensial OAuth belum tersedia — lihat HUMAN_TASKS H-05).
func (s *Server) handleGoogleStart(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	if s.Cfg.GoogleClientID == "" || s.Cfg.GoogleClientSecret == "" {
		problem.ServiceUnavailable("Login Google belum dikonfigurasi pada deployment ini. Gunakan email/password atau Coba Demo.", traceID).Write(w)
		return
	}
	// Implementasi alur OAuth penuh ditambahkan setelah kredensial tersedia.
	problem.ServiceUnavailable("Login Google belum diaktifkan pada build ini.", traceID).Write(w)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, ok := IdentityFrom(r.Context())
	if !ok {
		problem.Unauthorized("Sesi tidak ditemukan.", traceID).Write(w)
		return
	}
	user, err := s.Store.LookupUserByID(r.Context(), id.UserID.String())
	if err != nil {
		problem.Unauthorized("Pengguna tidak ditemukan.", traceID).Write(w)
		return
	}
	m, err := s.Store.LookupMembership(r.Context(), id.UserID.String())
	if err != nil {
		problem.Forbidden("Keanggotaan workspace tidak ditemukan.", traceID).Write(w)
		return
	}
	out := meResponse{
		User:      meUser{ID: user.ID, Email: user.Email, Name: user.Name, Locale: user.Locale},
		Workspace: wsBrief{ID: m.WorkspaceID, Name: m.WorkspaceName, IsDemo: m.IsDemo, Locale: m.Locale},
		Role:      string(m.Role),
		Demo:      m.IsDemo,
	}
	out.Permissions = rbac.Permissions(m.Role)
	if m.DemoExpiresAt != nil {
		t := m.DemoExpiresAt.Format(time.RFC3339)
		out.Workspace.DemoExpiresAt = &t
	}
	writeJSON(w, http.StatusOK, out)
}

// respondWithSession menerbitkan access + refresh token baru.
func (s *Server) respondWithSession(w http.ResponseWriter, r *http.Request, user store.User, m store.Membership) {
	traceID := TraceID(r.Context())
	access, accessExp, err := s.Tokens.SignAccess(user.ID, m.WorkspaceID, m.Role, m.IsDemo)
	if err != nil {
		problem.Internal(traceID).Write(w)
		return
	}
	rt, err := auth.NewRefreshToken(s.Cfg.SessionSecret, s.Cfg.RefreshTTL)
	if err != nil {
		problem.Internal(traceID).Write(w)
		return
	}
	if err := s.Store.InsertRefresh(r.Context(), m.WorkspaceID, user.ID, rt.Hash, rt.ExpiresAt, r.UserAgent(), ClientIP(r)); err != nil {
		s.Log.Error("simpan refresh token", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	s.setAuthCookies(w, access, accessExp, rt.Plain, rt.ExpiresAt)

	out := meResponse{
		User:      meUser{ID: user.ID, Email: user.Email, Name: user.Name, Locale: user.Locale},
		Workspace: wsBrief{ID: m.WorkspaceID, Name: m.WorkspaceName, IsDemo: m.IsDemo, Locale: m.Locale},
		Role:      string(m.Role),
		Demo:      m.IsDemo,
	}
	out.Permissions = rbac.Permissions(m.Role)
	if m.DemoExpiresAt != nil {
		t := m.DemoExpiresAt.Format(time.RFC3339)
		out.Workspace.DemoExpiresAt = &t
	}
	writeJSON(w, http.StatusOK, out)
}

// handleQuota mengembalikan pemakaian kuota AI harian (admin). Angka berasal
// dari tabel ai_usage_daily/ai_budget; bila belum ada pemakaian → nol, bukan
// angka karangan.
func (s *Server) handleQuota(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	snap, err := s.Store.QuotaSnapshot(r.Context(), id.WorkspaceID)
	if err != nil {
		s.Log.Error("quota snapshot", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, snap)
}
