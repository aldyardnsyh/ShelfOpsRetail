package migrate

import (
	"context"
	"fmt"
	"log/slog"
)

// Seed menjalankan SQL seed dalam satu transaksi dengan konteks RLS yang benar
// (workspace demo + user seed), sehingga tetap bekerja pada role non-superuser.
func Seed(ctx context.Context, dsn, workspaceID, userID, sql string, log *slog.Logger) error {
	r, err := Connect(ctx, dsn, log)
	if err != nil {
		return err
	}
	defer r.Close(ctx)

	tx, err := r.conn.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin seed: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `SELECT set_config('app.workspace_id', $1, true)`, workspaceID); err != nil {
		return fmt.Errorf("set workspace: %w", err)
	}
	if userID != "" {
		if _, err := tx.Exec(ctx, `SELECT set_config('app.user_id', $1, true)`, userID); err != nil {
			return fmt.Errorf("set user: %w", err)
		}
	}
	if _, err := tx.Exec(ctx, sql); err != nil {
		return fmt.Errorf("jalankan seed: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit seed: %w", err)
	}
	return nil
}
