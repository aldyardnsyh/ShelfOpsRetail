package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

type EvalRunRow struct {
	ID          string         `json:"id"`
	DatasetID   string         `json:"dataset_id"`
	DatasetName string         `json:"dataset_name"`
	Kind        string         `json:"kind"`
	Status      string         `json:"status"`
	Metrics     map[string]any `json:"metrics"`
	Error       *string        `json:"error"`
	CreatedAt   time.Time      `json:"created_at"`
	FinishedAt  *time.Time     `json:"finished_at"`
}

func (s *Store) ListEvalRuns(ctx context.Context, ws uuid.UUID, limit int) ([]EvalRunRow, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	const q = `
	SELECT r.id::text, r.dataset_id::text, d.name, r.kind, r.status, r.metrics, r.error,
	       r.created_at, r.finished_at
	FROM eval_runs r
	JOIN eval_datasets d ON d.id = r.dataset_id
	WHERE r.workspace_id = $1
	ORDER BY r.created_at DESC, r.id DESC
	LIMIT $2`
	rows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, q, ws.String(), limit)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	out := []EvalRunRow{}
	for rows.Next() {
		var r EvalRunRow
		if err := rows.Scan(&r.ID, &r.DatasetID, &r.DatasetName, &r.Kind, &r.Status,
			&r.Metrics, &r.Error, &r.CreatedAt, &r.FinishedAt); err != nil {
			return nil, fmt.Errorf("scan eval run: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
