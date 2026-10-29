package store

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var taskStatuses = map[string]bool{
	"open":        true,
	"in_progress": true,
	"done":        true,
	"cancelled":   true,
}

// UpdateTaskStatus mengubah status tugas. Nilai valid mengikuti constraint DB.
func (s *Store) UpdateTaskStatus(
	ctx context.Context, ws, user uuid.UUID, taskID, status string,
) error {
	if !taskStatuses[status] {
		return fmt.Errorf("status tugas tidak dikenal: %s", status)
	}
	return s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			UPDATE tasks SET status = $2, updated_at = now()
			WHERE id = $1 AND workspace_id = $3`,
			taskID, status, ws)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	})
}
