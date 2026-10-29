package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

type AuditLogRow struct {
	ID        string         `json:"id"`
	ActorID   *string        `json:"actor_id"`
	ActorName *string        `json:"actor_name"`
	Action    string         `json:"action"`
	Entity    string         `json:"entity"`
	EntityID  *string        `json:"entity_id"`
	Detail    map[string]any `json:"detail"`
	At        time.Time      `json:"at"`
}

// ListAuditLogs membaca audit_logs workspace. action dicocokkan persis atau
// sebagai prefix keluarga aksi (mis. "alert." cocok dengan alert.acknowledge).
func (s *Store) ListAuditLogs(ctx context.Context, ws uuid.UUID, action string, limit, offset int) ([]AuditLogRow, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	const q = `
	SELECT a.id::text, a.actor_id::text, u.name, a.action, a.entity, a.entity_id::text,
	       a.detail, a.at
	FROM audit_logs a
	LEFT JOIN users u ON u.id = a.actor_id
	WHERE a.workspace_id = $1
	  AND ($2 = '' OR a.action = $2 OR a.action LIKE $2 || '.%')
	ORDER BY a.at DESC, a.id DESC
	LIMIT $3 OFFSET $4`
	rows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, q, ws.String(), action, limit, offset)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	out := []AuditLogRow{}
	for rows.Next() {
		var r AuditLogRow
		if err := rows.Scan(&r.ID, &r.ActorID, &r.ActorName, &r.Action, &r.Entity, &r.EntityID, &r.Detail, &r.At); err != nil {
			return nil, fmt.Errorf("scan audit log: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
