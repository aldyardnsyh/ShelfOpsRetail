package httpx

import (
	"errors"
	"net/http"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/problem"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/rbac"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/store"
)

// ---------------------------------------------------------------------------
// G2 lanjutan: rotasi sandi sendiri + undangan anggota baru.
// ---------------------------------------------------------------------------

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// handleChangePassword memverifikasi sandi lama, menyimpan hash baru,
// dan mencabut semua refresh token (sesi lain ikut keluar).
func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())

	var req changePasswordRequest
	if perr := decodeJSON(w, r, &req, traceID); perr != nil {
		perr.Write(w)
		return
	}
	if len(req.NewPassword) < 8 {
		problem.Validation(traceID, problem.FieldError{Field: "new_password", Message: "minimal 8 karakter"}).Write(w)
		return
	}

	user, err := s.Store.LookupUserByID(r.Context(), id.UserID.String())
	if err != nil {
		problem.NotFound("Akun tidak ditemukan.", traceID).Write(w)
		return
	}
	if user.PasswordHash == "" {
		// Akun demo/undangan belum punya sandi: tidak ada yang bisa diverifikasi.
		problem.Unauthorized("Akun ini belum punya sandi.", traceID).Write(w)
		return
	}
	ok, err := s.Hasher.Verify(req.CurrentPassword, user.PasswordHash)
	if err != nil {
		s.Log.Error("verify sandi lama", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	if !ok {
		problem.Unauthorized("Sandi saat ini salah.", traceID).Write(w)
		return
	}

	hash, err := s.Hasher.Hash(req.NewPassword)
	if err != nil {
		s.Log.Error("hash sandi baru", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	if err := s.Store.ChangePassword(r.Context(), id.WorkspaceID, id.UserID, hash); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			problem.NotFound("Akun tidak ditemukan.", traceID).Write(w)
			return
		}
		s.Log.Error("ganti sandi", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type inviteMemberRequest struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

// handleInviteMember membuat user baru + keanggotaan workspace.
// Berbeda dari handleAddMember (user harus sudah terdaftar),
// endpoint ini untuk mengundang email yang belum punya akun.
func (s *Server) handleInviteMember(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())

	var req inviteMemberRequest
	if perr := decodeJSON(w, r, &req, traceID); perr != nil {
		perr.Write(w)
		return
	}
	role, err := rbac.ParseRole(req.Role)
	if err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "role", Message: "role tidak dikenal"}).Write(w)
		return
	}
	m, err := s.Store.InviteMember(r.Context(), id.WorkspaceID, id.UserID, req.Email, role)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrConflict):
			problem.New(http.StatusConflict, "Email sudah terdaftar",
				"Gunakan ubah role bila pengguna sudah menjadi anggota.", traceID).Write(w)
		case errors.Is(err, store.ErrInvalidContext):
			problem.Validation(traceID, problem.FieldError{Field: "email", Message: err.Error()}).Write(w)
		default:
			s.Log.Error("undang anggota", "trace_id", traceID, "error", err)
			problem.Internal(traceID).Write(w)
		}
		return
	}
	writeJSON(w, http.StatusCreated, m)
}
