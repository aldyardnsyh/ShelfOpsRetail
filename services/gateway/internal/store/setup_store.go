package store

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ---------------------------------------------------------------------------
// Setup produksi via web (wizard /setup): status + apply.
// ---------------------------------------------------------------------------

// SetupStatus adalah ringkasan kesiapan produksi untuk satu workspace.
type SetupStatus struct {
	WorkspaceName string `json:"workspace_name"`
	IsDemo        bool   `json:"is_demo"`
	HasAdmin      bool   `json:"has_admin"`
	SetupDone     bool   `json:"setup_done"`
	// Provider dari env (sumber kebenaran runtime) + override dari wizard.
	Providers  map[string]string `json:"providers"`
	ProviderOK bool              `json:"provider_ok"`
}

// GetSetupStatus membaca status setup: nama workspace, ada admin, flag selesai,
// dan mode provider dari env (bukan dari tabel — env yang menentukan runtime).
func (s *Store) GetSetupStatus(
	ctx context.Context, ws, user uuid.UUID, providers map[string]string, providerOK bool,
) (*SetupStatus, error) {
	out := &SetupStatus{
		Providers:  providers,
		ProviderOK: providerOK,
	}
	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `
			SELECT name, is_demo FROM workspaces WHERE id = $1`, ws,
		).Scan(&out.WorkspaceName, &out.IsDemo); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
				WHERE m.workspace_id = $1 AND m.role = 'admin' AND u.is_demo = false
			)`, ws).Scan(&out.HasAdmin); err != nil {
			return err
		}
		var done string
		if err := tx.QueryRow(ctx, `
			SELECT value FROM workspace_config
			WHERE workspace_id = $1 AND key = 'setup_done'`, ws,
		).Scan(&done); err == nil && done == "true" {
			out.SetupDone = true
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// SetupInput adalah pilihan operator dari wizard web.
type SetupInput struct {
	WorkspaceName string
	AdminEmail    string
	AdminPassword string
	AdminName     string
	// Provider override (disimpan ke workspace_config; runtime tetap baca env
	// dulu, tabel ini jadi dokumentasi + fallback bila env kosong).
	LLMProvider string
	LLMBaseURL  string
	LLMAPIKey   string
	LLMModel    string
}

// ApplySetup menyimpan pilihan wizard: rename workspace, pastikan admin,
// simpan provider override, tandai setup_done. Idempoten (upsert).
func (s *Store) ApplySetup(
	ctx context.Context, ws, user uuid.UUID, in SetupInput, hashPassword func(string) (string, error),
) (*SetupStatus, error) {
	name := strings.TrimSpace(in.WorkspaceName)
	if name != "" {
		if len(name) < 2 || len(name) > 80 {
			return nil, ErrInvalidContext
		}
	}
	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		if name != "" {
			if _, err := tx.Exec(ctx, `
				UPDATE workspaces SET name = $2, updated_at = now() WHERE id = $1`,
				ws, name); err != nil {
				return err
			}
		}
		// Pastikan admin: bila email sudah ada, update role + password;
		// bila belum, buat user + membership admin.
		email := strings.ToLower(strings.TrimSpace(in.AdminEmail))
		if email != "" {
			hash, err := hashPassword(strings.TrimSpace(in.AdminPassword))
			if err != nil {
				return err
			}
			var userID string
			err = tx.QueryRow(ctx, `SELECT id::text FROM users WHERE email = $1`, email).Scan(&userID)
			if err != nil {
				userID = NewV7().String()
				displayName := strings.TrimSpace(in.AdminName)
				if displayName == "" {
					displayName = email
				}
				if _, err := tx.Exec(ctx, `
					INSERT INTO users (id, email, password_hash, name, locale, is_demo)
					VALUES ($1,$2,$3,$4,'id',false)`,
					userID, email, hash, displayName); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `
					INSERT INTO memberships (id, user_id, workspace_id, role)
					VALUES ($1,$2,$3,'admin')`,
					NewV7().String(), userID, ws.String()); err != nil {
					return err
				}
			} else {
				if _, err := tx.Exec(ctx, `
					UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`,
					userID, hash); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `
					INSERT INTO memberships (id, user_id, workspace_id, role)
					VALUES ($1,$2,$3,'admin')
					ON CONFLICT DO NOTHING`, NewV7().String(), userID, ws.String()); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `
					UPDATE memberships SET role = 'admin'
					WHERE user_id = $1 AND workspace_id = $2`, userID, ws.String()); err != nil {
					return err
				}
			}
		}
		// Simpan provider override (upsert). Key kosong = tidak diubah.
		pairs := map[string]string{
			"llm_provider": strings.TrimSpace(in.LLMProvider),
			"llm_base_url": strings.TrimSpace(in.LLMBaseURL),
			"llm_api_key":  strings.TrimSpace(in.LLMAPIKey),
			"llm_model":    strings.TrimSpace(in.LLMModel),
		}
		for k, v := range pairs {
			if v == "" {
				continue
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO workspace_config (workspace_id, key, value, updated_at)
				VALUES ($1,$2,$3,now())
				ON CONFLICT (workspace_id, key) DO UPDATE SET value = $3, updated_at = now()`,
				ws, k, v); err != nil {
				return err
			}
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO workspace_config (workspace_id, key, value, updated_at)
			VALUES ($1,'setup_done','true',now())
			ON CONFLICT (workspace_id, key) DO UPDATE SET value = 'true', updated_at = now()`,
			ws)
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.GetSetupStatus(ctx, ws, user, nil, false)
}
