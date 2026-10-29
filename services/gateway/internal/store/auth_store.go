package store

import (
	"context"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/rbac"
)

// User adalah baris minimal untuk autentikasi.
type User struct {
	ID           string
	Email        string
	PasswordHash string
	Name         string
	Locale       string
	IsDemo       bool
}

type Membership struct {
	WorkspaceID   string
	WorkspaceName string
	Role          rbac.Role
	IsDemo        bool
	Locale        string
	DemoExpiresAt *time.Time
}

type RefreshRow struct {
	ID          string
	UserID      string
	WorkspaceID string
	ExpiresAt   time.Time
	RevokedAt   *time.Time
}

// LookupUserByEmail memanggil fungsi SECURITY DEFINER (satu-satunya jalur baca
// pra-auth, lihat migrasi 000005).
func (s *Store) LookupUserByEmail(ctx context.Context, email string) (*User, error) {
	return s.lookupUser(ctx, `SELECT * FROM auth_lookup_user($1)`, email)
}

func (s *Store) LookupUserByID(ctx context.Context, id string) (*User, error) {
	return s.lookupUser(ctx, `SELECT * FROM auth_lookup_user_by_id($1)`, id)
}

func (s *Store) lookupUser(ctx context.Context, sql string, arg any) (*User, error) {
	var u User
	err := s.pool.QueryRow(ctx, sql, arg).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Name, &u.Locale, &u.IsDemo)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("lookup user: %w", err)
	}
	return &u, nil
}

func (s *Store) LookupMembership(ctx context.Context, userID string) (*Membership, error) {
	var m Membership
	err := s.pool.QueryRow(ctx, `
		SELECT workspace_id, workspace_name, role, is_demo, locale, demo_expires_at
		FROM auth_lookup_membership($1)`, userID).
		Scan(&m.WorkspaceID, &m.WorkspaceName, &m.Role, &m.IsDemo, &m.Locale, &m.DemoExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("lookup membership: %w", err)
	}
	return &m, nil
}

func (s *Store) LookupRefresh(ctx context.Context, tokenHash string) (*RefreshRow, error) {
	var r RefreshRow
	err := s.pool.QueryRow(ctx, `
		SELECT id, user_id, workspace_id, expires_at, revoked_at
		FROM auth_lookup_refresh($1)`, tokenHash).
		Scan(&r.ID, &r.UserID, &r.WorkspaceID, &r.ExpiresAt, &r.RevokedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("lookup refresh: %w", err)
	}
	return &r, nil
}

// InsertRefresh menyimpan hash token (bukan token asli) di dalam konteks workspace.
func (s *Store) InsertRefresh(ctx context.Context, workspaceID, userID, tokenHash string, expiresAt time.Time, userAgent, ip string) error {
	ws, err := parseUUID(workspaceID)
	if err != nil {
		return err
	}
	us, err := parseUUID(userID)
	if err != nil {
		return err
	}
	return s.WithWorkspace(ctx, ws, us, func(tx pgx.Tx) error {
		var ipArg any
		if ip != "" {
			ipArg = ip
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO refresh_tokens (id, user_id, workspace_id, token_hash, expires_at, user_agent, ip)
			VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			NewV7(), userID, workspaceID, tokenHash, expiresAt, userAgent, ipArg)
		if err != nil {
			return fmt.Errorf("insert refresh token: %w", err)
		}
		return nil
	})
}

// RotateRefresh mencabut token lama dan mencatat rantai rotasinya.
func (s *Store) RotateRefresh(ctx context.Context, workspaceID, userID, oldID, newHash string, expiresAt time.Time, userAgent, ip string) error {
	ws, err := parseUUID(workspaceID)
	if err != nil {
		return err
	}
	us, err := parseUUID(userID)
	if err != nil {
		return err
	}
	return s.WithWorkspace(ctx, ws, us, func(tx pgx.Tx) error {
		var ipArg any
		if ip != "" {
			ipArg = ip
		}
		if _, err := tx.Exec(ctx, `UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, oldID); err != nil {
			return fmt.Errorf("revoke refresh lama: %w", err)
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO refresh_tokens (id, user_id, workspace_id, token_hash, expires_at, rotated_from, user_agent, ip)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			NewV7(), userID, workspaceID, newHash, expiresAt, oldID, userAgent, ipArg)
		return err
	})
}

func (s *Store) RevokeRefresh(ctx context.Context, workspaceID, userID, tokenID string) error {
	ws, err := parseUUID(workspaceID)
	if err != nil {
		return err
	}
	us, err := parseUUID(userID)
	if err != nil {
		return err
	}
	return s.WithWorkspace(ctx, ws, us, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, tokenID)
		return err
	})
}

// RevokeAllUserTokens dipakai saat terdeteksi token reuse (kemungkinan pencurian).
func (s *Store) RevokeAllUserTokens(ctx context.Context, userID, reason string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `SELECT auth_revoke_user_refresh_tokens($1, $2)`, userID, reason).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("revoke all: %w", err)
	}
	return n, nil
}

// PurgeExpiredTokensMembersihkan token kedaluwarsa (job terjadwal).
func (s *Store) PurgeExpiredTokens(ctx context.Context) (int, error) {
	var n int
	if err := s.pool.QueryRow(ctx, `SELECT auth_purge_expired_tokens()`).Scan(&n); err != nil {
		return 0, err
	}
	return n, nil
}

// CreateUser membuat user + keanggotaan. Dipakai demo & seed, dibatasi konteks
// RLS: users butuh app.user_id, memberships butuh app.workspace_id.
func (s *Store) CreateUser(ctx context.Context, workspaceID, email, name, passwordHash string, role rbac.Role, isDemo bool) (string, error) {
	ws, err := parseUUID(workspaceID)
	if err != nil {
		return "", err
	}
	userID := NewV7()
	err = s.WithWorkspace(ctx, ws, userID, func(tx pgx.Tx) error {
		var pwArg any
		if passwordHash != "" {
			pwArg = passwordHash
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO users (id, email, password_hash, name, locale, is_demo)
			VALUES ($1,$2,$3,$4,'id',$5)`, userID, email, pwArg, name, isDemo); err != nil {
			return fmt.Errorf("insert user: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO memberships (id, user_id, workspace_id, role)
			VALUES ($1,$2,$3,$4)`, NewV7(), userID, workspaceID, string(role)); err != nil {
			return fmt.Errorf("insert membership: %w", err)
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	return userID.String(), nil
}

// UpdateLastLogin.
func (s *Store) UpdateLastLogin(ctx context.Context, workspaceID, userID string) error {
	ws, err := parseUUID(workspaceID)
	if err != nil {
		return err
	}
	us, err := parseUUID(userID)
	if err != nil {
		return err
	}
	return s.WithWorkspace(ctx, ws, us, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `UPDATE users SET last_login_at = now() WHERE id = $1`, userID)
		return err
	})
}

// WorkspaceForUser mengembalikan workspace (dipakai /me setelah token valid).
func (s *Store) WorkspaceForUser(ctx context.Context, workspaceID, userID string) (*Membership, error) {
	return s.LookupMembership(ctx, userID)
}

func parseUUID(s string) (uuid.UUID, error) {
	u, err := uuid.Parse(s)
	if err != nil {
		return uuid.UUID{}, fmt.Errorf("%w: %s", ErrInvalidContext, s)
	}
	return u, nil
}
