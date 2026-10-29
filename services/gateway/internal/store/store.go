// Package store memegang akses database. Semua query yang menyentuh data tenant
// WAJIB lewat WithWorkspace agar konteks RLS (`app.workspace_id`) selalu di-set —
// fail-closed: tanpa konteks, policy mengembalikan nol baris.
package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound       = errors.New("tidak ditemukan")
	ErrConflict       = errors.New("konflik")
	ErrInvalidContext = errors.New("konteks workspace/user tidak valid")
	ErrDemoDisabled   = errors.New("mode demo dimatikan")
)

type Store struct {
	pool *pgxpool.Pool
}

func New(ctx context.Context, dsn string, maxConns int32) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	if maxConns > 0 {
		cfg.MaxConns = maxConns
	}
	cfg.MinConns = 1
	cfg.MaxConnLifetime = time.Hour
	cfg.HealthCheckPeriod = 30 * time.Second
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("buka pool: %w", err)
	}
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }

func (s *Store) Pool() *pgxpool.Pool { return s.pool }

func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

// WithTx menjalankan fn dalam transaksi (tanpa konteks tenant). Hanya untuk
// jalur pra-autentikasi dan job sistem.
func (s *Store) WithTx(ctx context.Context, fn func(pgx.Tx) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// WithWorkspace menjalankan fn dalam transaksi dengan `app.workspace_id` (dan
// opsional `app.user_id`) di-set lokal sehingga RLS berlaku.
func (s *Store) WithWorkspace(ctx context.Context, workspaceID, userID uuid.UUID, fn func(pgx.Tx) error) error {
	if workspaceID == uuid.Nil {
		return fmt.Errorf("%w: workspace kosong", ErrInvalidContext)
	}
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "SELECT set_config('app.workspace_id', $1, true)", workspaceID.String()); err != nil {
			return fmt.Errorf("set app.workspace_id: %w", err)
		}
		if userID != uuid.Nil {
			if _, err := tx.Exec(ctx, "SELECT set_config('app.user_id', $1, true)", userID.String()); err != nil {
				return fmt.Errorf("set app.user_id: %w", err)
			}
		}
		return fn(tx)
	})
}

// QueryRowWorkspace adalah helper untuk satu query di dalam konteks workspace.
func (s *Store) QueryRowWorkspace(ctx context.Context, workspaceID, userID uuid.UUID, sql string, args ...any) (pgx.Row, func(), error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, func() {}, err
	}
	if _, err := tx.Exec(ctx, "SELECT set_config('app.workspace_id', $1, true)", workspaceID.String()); err != nil {
		_ = tx.Rollback(ctx)
		return nil, func() {}, err
	}
	if userID != uuid.Nil {
		if _, err := tx.Exec(ctx, "SELECT set_config('app.user_id', $1, true)", userID.String()); err != nil {
			_ = tx.Rollback(ctx)
			return nil, func() {}, err
		}
	}
	cleanup := func() { _ = tx.Rollback(ctx) }
	return tx.QueryRow(ctx, sql, args...), cleanup, nil
}

// ListWorkspace menjalankan query banyak baris dalam konteks workspace.
func (s *Store) ListWorkspace(ctx context.Context, workspaceID, userID uuid.UUID, sql string, args ...any) (pgx.Rows, func(), error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, func() {}, err
	}
	if _, err := tx.Exec(ctx, "SELECT set_config('app.workspace_id', $1, true)", workspaceID.String()); err != nil {
		_ = tx.Rollback(ctx)
		return nil, func() {}, err
	}
	if userID != uuid.Nil {
		if _, err := tx.Exec(ctx, "SELECT set_config('app.user_id', $1, true)", userID.String()); err != nil {
			_ = tx.Rollback(ctx)
			return nil, func() {}, err
		}
	}
	rows, err := tx.Query(ctx, sql, args...)
	if err != nil {
		_ = tx.Rollback(ctx)
		return nil, func() {}, err
	}
	cleanup := func() { rows.Close(); _ = tx.Rollback(ctx) }
	return rows, cleanup, nil
}

// QueueDepth menghitung job aktif (dipakai /readyz dan L2).
func (s *Store) QueueDepth(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `
		SELECT count(*) FROM river_job
		WHERE state IN ('available','running','retryable','scheduled','pending')`).Scan(&n)
	if err != nil {
		return 0, err
	}
	return n, nil
}

// NewV7 menghasilkan UUIDv7 (D-019).
func NewV7() uuid.UUID { return uuid.Must(uuid.NewV7()) }
