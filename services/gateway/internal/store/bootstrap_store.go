package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/rbac"
)

// Bootstrap menjamin adanya satu workspace nyata (bukan demo) dan satu admin
// yang bisa login. Dipakai `shelfops bootstrap` pada deployment baru supaya
// tidak ada langkah manual SQL dan tidak ada deployment tanpa jalur masuk.
type Bootstrap struct {
	WorkspaceID   string
	WorkspaceName string
	UserID        string
	Created       bool
	PasswordReset bool
}

// EnsureWorkspace mengembalikan workspace non-demo dengan nama tertentu,
// membuatnya bila belum ada. Idempoten.
func (s *Store) EnsureWorkspace(ctx context.Context, name string) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx,
		`SELECT id::text FROM workspaces WHERE name = $1 AND is_demo = false ORDER BY created_at LIMIT 1`,
		name,
	).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("cari workspace: %w", err)
	}

	id = NewV7().String()
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO workspaces (id, name, is_demo) VALUES ($1, $2, false)`, id, name,
	); err != nil {
		return "", fmt.Errorf("buat workspace: %w", err)
	}
	return id, nil
}

// EnsureMembership menaikkan (atau membuat) keanggotaan dengan peran tertentu.
func (s *Store) EnsureMembership(ctx context.Context, workspaceID, userID string, role rbac.Role) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO memberships (id, user_id, workspace_id, role)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, workspace_id) DO UPDATE SET role = excluded.role`,
		NewV7().String(), userID, workspaceID, string(role),
	)
	if err != nil {
		return fmt.Errorf("simpan keanggotaan: %w", err)
	}
	return nil
}

// SetPasswordHash mengganti hash sandi pengguna yang sudah ada.
func (s *Store) SetPasswordHash(ctx context.Context, userID, hash string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2::uuid AND deleted_at IS NULL`,
		hash, userID,
	)
	if err != nil {
		return fmt.Errorf("perbarui sandi: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// BootstrapWorkspaceAdmin membuat workspace + admin bila belum ada, atau
// memperbarui sandi/peran admin yang sudah ada. Tidak pernah menghapus data.
func (s *Store) BootstrapWorkspaceAdmin(
	ctx context.Context,
	workspaceName, email, displayName, passwordHash string,
) (*Bootstrap, error) {
	wsID, err := s.EnsureWorkspace(ctx, workspaceName)
	if err != nil {
		return nil, err
	}

	out := &Bootstrap{WorkspaceID: wsID, WorkspaceName: workspaceName}

	existing, err := s.LookupUserByEmail(ctx, email)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return nil, fmt.Errorf("cari pengguna: %w", err)
	}

	if existing == nil {
		userID, err := s.CreateUser(ctx, wsID, email, displayName, passwordHash, rbac.RoleAdmin, false)
		if err != nil {
			return nil, err
		}
		out.UserID = userID
		out.Created = true
		return out, nil
	}

	if err := s.SetPasswordHash(ctx, existing.ID, passwordHash); err != nil {
		return nil, err
	}
	if err := s.EnsureMembership(ctx, wsID, existing.ID, rbac.RoleAdmin); err != nil {
		return nil, err
	}
	out.UserID = existing.ID
	out.PasswordReset = true
	return out, nil
}