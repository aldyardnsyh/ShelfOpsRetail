package store

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/rbac"
)

// ---------------------------------------------------------------------------
// G2 lanjutan: rotasi sandi sendiri + undangan anggota baru.
//
// ChangePassword memverifikasi sandi lama sebelum menyimpan hash baru,
// lalu mencabut semua refresh token agar sesi lain ikut keluar.
// InviteMember membuat user baru (tanpa sandi → wajib set saat aktivasi)
// + keanggotaan; pengiriman email undangan di luar scope (TODO webhook).
// ---------------------------------------------------------------------------

// ChangePassword mengganti hash sandi user yang sedang login.
func (s *Store) ChangePassword(
	ctx context.Context, ws, user uuid.UUID, newHash string,
) error {
	if strings.TrimSpace(newHash) == "" {
		return fmt.Errorf("%w: hash sandi baru kosong", ErrInvalidContext)
	}
	return s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			UPDATE users SET password_hash = $2, updated_at = now()
			WHERE id = $1`, user.String(), newHash)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		// Cabut semua sesi agar perangkat lain ikut keluar.
		_, err = tx.Exec(ctx, `
			UPDATE refresh_tokens SET revoked_at = now()
			WHERE user_id = $1 AND revoked_at IS NULL`, user.String())
		return err
	})
}

type InvitedMember struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
}

// InviteMember membuat user baru + keanggotaan workspace.
// Mengembalikan error conflict bila email sudah terdaftar.
func (s *Store) InviteMember(
	ctx context.Context, ws, inviter uuid.UUID, email string, role rbac.Role,
) (*InvitedMember, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || !strings.Contains(email, "@") {
		return nil, fmt.Errorf("%w: email undangan tidak valid", ErrInvalidContext)
	}
	out := &InvitedMember{}
	err := s.WithWorkspace(ctx, ws, inviter, func(tx pgx.Tx) error {
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)`, email).Scan(&exists); err != nil {
			return err
		}
		if exists {
			return ErrConflict
		}
		userID := NewV7()
		name := strings.Title(strings.Split(email, "@")[0])
		if _, err := tx.Exec(ctx, `
			INSERT INTO users (id, email, name, locale, is_demo)
			VALUES ($1,$2,$3,'id',false)`, userID, email, name); err != nil {
			return fmt.Errorf("insert user undangan: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO memberships (id, user_id, workspace_id, role)
			VALUES ($1,$2,$3,$4)`, NewV7(), userID, ws.String(), string(role)); err != nil {
			return fmt.Errorf("insert membership undangan: %w", err)
		}
		out.UserID = userID.String()
		out.Email = email
		out.Role = string(role)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}
