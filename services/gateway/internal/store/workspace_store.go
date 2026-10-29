package store

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/rbac"
)

type Workspace struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	IsDemo        bool    `json:"is_demo"`
	DemoExpiresAt *string `json:"demo_expires_at"`
	Locale        string  `json:"locale"`
	RetentionNote string  `json:"retention_note"`
}

type Member struct {
	ID        string    `json:"id"`
	User      UserBrief `json:"user"`
	Role      rbac.Role `json:"role"`
	CreatedAt string    `json:"created_at"`
}

type UserBrief struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

type StoreRow struct {
	ID      string `json:"id"`
	Code    string `json:"code"`
	Name    string `json:"name"`
	Region  string `json:"region"`
	Channel string `json:"channel"`
}

type PlanogramRow struct {
	ID     string         `json:"id"`
	Name   string         `json:"name"`
	Config map[string]any `json:"config"`
}

func (s *Store) GetWorkspace(ctx context.Context, ws, user uuid.UUID) (*Workspace, error) {
	const q = `SELECT id::text, name, is_demo, demo_expires_at, locale FROM workspaces WHERE id = $1`
	var w Workspace
	var demoExp *string
	row, cleanup, err := s.QueryRowWorkspace(ctx, ws, user, q, ws.String())
	if err != nil {
		return nil, err
	}
	defer cleanup()
	if err := row.Scan(&w.ID, &w.Name, &w.IsDemo, &demoExp, &w.Locale); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get workspace: %w", err)
	}
	if demoExp != nil {
		w.DemoExpiresAt = demoExp
		w.RetentionNote = "Workspace demo: data pengunjung dihapus otomatis setiap 24 jam."
	}
	return &w, nil
}

func (s *Store) UpdateWorkspace(ctx context.Context, ws, user uuid.UUID, name, locale string) (*Workspace, error) {
	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		var n int
		if err := tx.QueryRow(ctx, `
			UPDATE workspaces SET name = coalesce(nullif($1,''), name),
			                     locale = coalesce(nullif($2,''), locale),
			                     updated_at = now()
			WHERE id = $3 RETURNING 1`, name, locale, ws.String()).Scan(&n); err != nil {
			if err == pgx.ErrNoRows {
				return ErrNotFound
			}
			return err
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO audit_logs (workspace_id, actor_id, action, entity, entity_id, detail)
			VALUES ($1,$2,'workspace.update','workspaces',$1, jsonb_build_object('name',$3,'locale',$4))`,
			ws.String(), user.String(), name, locale)
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.GetWorkspace(ctx, ws, user)
}

func (s *Store) ListMembers(ctx context.Context, ws, user uuid.UUID) ([]Member, error) {
	const q = `
	SELECT m.id::text, u.id::text, u.email, u.name, m.role, m.created_at::text
	FROM memberships m JOIN users u ON u.id = m.user_id
	WHERE m.workspace_id = $1
	ORDER BY m.created_at`
	rows, cleanup, err := s.ListWorkspace(ctx, ws, user, q, ws.String())
	if err != nil {
		return nil, err
	}
	defer cleanup()
	out := []Member{}
	for rows.Next() {
		var m Member
		if err := rows.Scan(&m.ID, &m.User.ID, &m.User.Email, &m.User.Name, &m.Role, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// AddMemberByEmail menambahkan pengguna terdaftar ke workspace (admin).
func (s *Store) AddMemberByEmail(ctx context.Context, ws, actor uuid.UUID, email string, role rbac.Role) (*Member, error) {
	u, err := s.LookupUserByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	var memberID string
	err = s.WithWorkspace(ctx, ws, actor, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `
			INSERT INTO memberships (id, user_id, workspace_id, role)
			VALUES ($1,$2,$3,$4)
			ON CONFLICT (user_id, workspace_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now()
			RETURNING id::text`, NewV7(), u.ID, ws.String(), string(role)).Scan(&memberID); err != nil {
			return fmt.Errorf("upsert membership: %w", err)
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO audit_logs (workspace_id, actor_id, action, entity, entity_id, detail)
			VALUES ($1,$2,'member.upsert','memberships',$3, jsonb_build_object('email',$4,'role',$5))`,
			ws.String(), actor.String(), memberID, email, string(role))
		return err
	})
	if err != nil {
		return nil, err
	}
	return &Member{ID: memberID, User: UserBrief{ID: u.ID, Email: u.Email, Name: u.Name}, Role: role}, nil
}

func (s *Store) UpdateMemberRole(ctx context.Context, ws, actor uuid.UUID, memberID string, role rbac.Role) error {
	return s.WithWorkspace(ctx, ws, actor, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE memberships SET role = $1, updated_at = now() WHERE id = $2 AND workspace_id = $3`,
			string(role), memberID, ws.String())
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO audit_logs (workspace_id, actor_id, action, entity, entity_id, detail)
			VALUES ($1,$2,'member.role','memberships',$3, jsonb_build_object('role',$4))`,
			ws.String(), actor.String(), memberID, string(role))
		return err
	})
}

func (s *Store) RemoveMember(ctx context.Context, ws, actor uuid.UUID, memberID string) error {
	return s.WithWorkspace(ctx, ws, actor, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `DELETE FROM memberships WHERE id = $1 AND workspace_id = $2`, memberID, ws.String())
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO audit_logs (workspace_id, actor_id, action, entity, entity_id)
			VALUES ($1,$2,'member.remove','memberships',$3)`, ws.String(), actor.String(), memberID)
		return err
	})
}

func (s *Store) ListStores(ctx context.Context, ws, user uuid.UUID, region, query string) ([]StoreRow, error) {
	const q = `
	SELECT id::text, code, name, region, channel FROM stores
	WHERE workspace_id = $1 AND deleted_at IS NULL
	  AND ($2 = '' OR region = $2)
	  AND ($3 = '' OR name ILIKE '%' || $3 || '%' OR code ILIKE '%' || $3 || '%')
	ORDER BY code`
	rows, cleanup, err := s.ListWorkspace(ctx, ws, user, q, ws.String(), region, query)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	out := []StoreRow{}
	for rows.Next() {
		var r StoreRow
		if err := rows.Scan(&r.ID, &r.Code, &r.Name, &r.Region, &r.Channel); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) CreateStore(ctx context.Context, ws, user uuid.UUID, code, name, region, channel string) (*StoreRow, error) {
	var id string
	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			INSERT INTO stores (id, workspace_id, code, name, region, channel)
			VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text`,
			NewV7(), ws.String(), code, name, region, channel).Scan(&id)
	})
	if err != nil {
		return nil, err
	}
	return &StoreRow{ID: id, Code: code, Name: name, Region: region, Channel: channel}, nil
}

func (s *Store) ListPlanograms(ctx context.Context, ws, user uuid.UUID) ([]PlanogramRow, error) {
	rows, cleanup, err := s.ListWorkspace(ctx, ws, user,
		`SELECT id::text, name, config FROM planograms WHERE workspace_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`, ws.String())
	if err != nil {
		return nil, err
	}
	defer cleanup()
	out := []PlanogramRow{}
	for rows.Next() {
		var p PlanogramRow
		if err := rows.Scan(&p.ID, &p.Name, &p.Config); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) CreatePlanogram(ctx context.Context, ws, user uuid.UUID, name string, config []byte) (*PlanogramRow, error) {
	var id string
	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			INSERT INTO planograms (id, workspace_id, name, config)
			VALUES ($1,$2,$3, coalesce($4::jsonb, '{}'::jsonb)) RETURNING id::text`,
			NewV7(), ws.String(), name, string(config)).Scan(&id)
	})
	if err != nil {
		return nil, err
	}
	return &PlanogramRow{ID: id, Name: name}, nil
}

// LogAudit mencatat aksi tingkat workspace (append-only, PRD §17).
func (s *Store) LogAudit(ctx context.Context, ws, actor uuid.UUID, action, entity string, entityID *string, detail map[string]any) error {
	if detail == nil {
		detail = map[string]any{}
	}
	payload, err := json.Marshal(detail)
	if err != nil {
		return fmt.Errorf("marshal detail audit: %w", err)
	}
	return s.WithWorkspace(ctx, ws, actor, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			INSERT INTO audit_logs (workspace_id, actor_id, action, entity, entity_id, detail)
			VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
			ws.String(), actor.String(), action, entity, entityID, string(payload))
		return err
	})
}
