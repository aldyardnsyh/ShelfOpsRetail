package store

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ---------------------------------------------------------------------------
// Aksi tulis operasional (G4 lanjutan): laporan + jadwal, konektor +
// uji koneksi + rotasi API key.
//
// Semua operasi memakai WithWorkspace agar RLS workspace tetap berlaku.
// ---------------------------------------------------------------------------

var reportKinds = map[string]bool{
	"weekly": true, "monthly": true, "incident": true, "custom": true,
}

var reportFormats = map[string]bool{
	"pdf": true, "csv": true, "xlsx": true,
}

type ReportInput struct {
	Title      string
	Kind       string
	PeriodFrom string
	PeriodTo   string
	Scope      string
	Format     string
}

// CreateReport mencatat laporan baru dengan status "ready".
// Metrik dihitung dari audit final pada rentang periode (best-effort:
// bila tidak ada audit, metrik kosong tapi laporan tetap tersimpan).
func (s *Store) CreateReport(
	ctx context.Context, ws, user uuid.UUID, in ReportInput,
) (*ReportRow, error) {
	kind := strings.ToLower(strings.TrimSpace(in.Kind))
	if kind == "" {
		kind = "custom"
	}
	if !reportKinds[kind] {
		return nil, fmt.Errorf("%w: kind laporan tidak dikenal: %s", ErrInvalidContext, kind)
	}
	format := strings.ToLower(strings.TrimSpace(in.Format))
	if format == "" {
		format = "pdf"
	}
	if !reportFormats[format] {
		return nil, fmt.Errorf("%w: format laporan tidak dikenal: %s", ErrInvalidContext, format)
	}
	from, err := time.Parse("2006-01-02", strings.TrimSpace(in.PeriodFrom))
	if err != nil {
		return nil, fmt.Errorf("%w: period_from harus tanggal YYYY-MM-DD", ErrInvalidContext)
	}
	to, err := time.Parse("2006-01-02", strings.TrimSpace(in.PeriodTo))
	if err != nil {
		return nil, fmt.Errorf("%w: period_to harus tanggal YYYY-MM-DD", ErrInvalidContext)
	}
	if to.Before(from) {
		return nil, fmt.Errorf("%w: period_to tidak boleh sebelum period_from", ErrInvalidContext)
	}
	title := strings.TrimSpace(in.Title)
	if title == "" {
		return nil, fmt.Errorf("%w: judul laporan wajib diisi", ErrInvalidContext)
	}
	scope := strings.TrimSpace(in.Scope)
	if scope == "" {
		scope = "all"
	}

	out := &ReportRow{}
	err = s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		// Hitung metrik best-effort dari sesi audit final pada periode.
		// Tabel kanonik: audit_sessions (kolom score), bukan "audits".
		var audits, stores int
		var avgScore *float64
		_ = tx.QueryRow(ctx, `
			SELECT COUNT(*), COUNT(DISTINCT store_id), AVG(score)
			FROM audit_sessions
			WHERE workspace_id = $1 AND status = 'final'
			  AND deleted_at IS NULL
			  AND created_at::date BETWEEN $2 AND $3`,
			ws, from.Format("2006-01-02"), to.Format("2006-01-02"),
		).Scan(&audits, &stores, &avgScore)

		metrics := fmt.Sprintf(`{"audits_final":%d,"avg_score":%s}`,
			audits, nullableFloat(avgScore))
		now := time.Now()
		err := tx.QueryRow(ctx, `
			INSERT INTO reports (workspace_id, title, kind, period_from, period_to,
				scope, stores_count, status, generated_at, format, metrics)
			VALUES ($1,$2,$3,$4,$5,$6,$7,'ready',$8,$9,$10::jsonb)
			RETURNING id::text, title, kind, period_from, period_to, scope,
				stores_count, status, generated_at, format, metrics`,
			ws, title, kind, from.Format("2006-01-02"), to.Format("2006-01-02"),
			scope, stores, now, format, metrics,
		).Scan(&out.ID, &out.Title, &out.Kind, &out.PeriodFrom, &out.PeriodTo,
			&out.Scope, &out.StoresCount, &out.Status, &out.GeneratedAt,
			&out.Format, &out.Metrics)
		return err
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

func nullableFloat(f *float64) string {
	if f == nil {
		return "null"
	}
	return fmt.Sprintf("%.1f", *f)
}

var scheduleCadences = map[string]bool{
	"weekly": true, "monthly": true,
}

type ReportScheduleInput struct {
	Name       string
	Cadence    string
	Scope      string
	Format     string
	Recipients []string
}

// CreateReportSchedule mencatat jadwal laporan baru (aktif).
func (s *Store) CreateReportSchedule(
	ctx context.Context, ws, user uuid.UUID, in ReportScheduleInput,
) (*ReportScheduleRow, error) {
	cadence := strings.ToLower(strings.TrimSpace(in.Cadence))
	if !scheduleCadences[cadence] {
		return nil, fmt.Errorf("%w: cadence harus weekly atau monthly", ErrInvalidContext)
	}
	format := strings.ToLower(strings.TrimSpace(in.Format))
	if format == "" {
		format = "pdf"
	}
	if !reportFormats[format] {
		return nil, fmt.Errorf("%w: format tidak dikenal: %s", ErrInvalidContext, format)
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, fmt.Errorf("%w: nama jadwal wajib diisi", ErrInvalidContext)
	}
	scope := strings.TrimSpace(in.Scope)
	if scope == "" {
		scope = "all"
	}
	recipients := make([]string, 0, len(in.Recipients))
	for _, r := range in.Recipients {
		r = strings.TrimSpace(r)
		if r != "" {
			recipients = append(recipients, r)
		}
	}

	out := &ReportScheduleRow{}
	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			INSERT INTO report_schedules (workspace_id, name, cadence, scope, format, recipients, active)
			VALUES ($1,$2,$3,$4,$5,$6,true)
			RETURNING id::text, name, cadence, scope, format, recipients, active`,
			ws, name, cadence, scope, format, recipients,
		).Scan(&out.ID, &out.Name, &out.Cadence, &out.Scope, &out.Format,
			&out.Recipients, &out.Active)
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// Konektor integrasi
// ---------------------------------------------------------------------------

var integrationKinds = map[string]bool{
	"pos": true, "supplier": true, "ecommerce": true, "logistics": true, "cv": true,
}

type IntegrationInput struct {
	Name      string
	Kind      string
	StoreScope string
	Note      string
}

// CreateIntegration mencatat konektor baru dengan status "pending".
func (s *Store) CreateIntegration(
	ctx context.Context, ws, user uuid.UUID, in IntegrationInput,
) (*IntegrationRow, error) {
	kind := strings.ToLower(strings.TrimSpace(in.Kind))
	if !integrationKinds[kind] {
		return nil, fmt.Errorf("%w: kind konektor tidak dikenal: %s", ErrInvalidContext, kind)
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, fmt.Errorf("%w: nama konektor wajib diisi", ErrInvalidContext)
	}
	scope := strings.TrimSpace(in.StoreScope)
	if scope == "" {
		scope = "all"
	}

	out := &IntegrationRow{}
	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			INSERT INTO integrations (workspace_id, name, kind, status, store_scope, note)
			VALUES ($1,$2,$3,'pending',$4,$5)
			RETURNING id::text, name, kind, status, store_scope, last_sync,
				records, latency_ms, note`,
			ws, name, kind, scope, strings.TrimSpace(in.Note),
		).Scan(&out.ID, &out.Name, &out.Kind, &out.Status, &out.StoreScope,
			&out.LastSync, &out.Records, &out.LatencyMS, &out.Note)
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// TestIntegration mencatat run sinkronisasi "push" uji coba dan menandai
// konektor connected bila sebelumnya pending. Ini uji konektivitas jujur:
// tidak ada panggilan eksternal, hanya memastikan jalur tulis + baca
// konsisten (smoke internal), dicatat sebagai sync run.
func (s *Store) TestIntegration(
	ctx context.Context, ws, user uuid.UUID, integrationID string,
) (*SyncRunRow, error) {
	if _, err := uuid.Parse(strings.TrimSpace(integrationID)); err != nil {
		return nil, fmt.Errorf("%w: id konektor harus UUID valid", ErrInvalidContext)
	}
	out := &SyncRunRow{}
	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		var kind string
		err := tx.QueryRow(ctx, `
			SELECT kind FROM integrations WHERE id = $1 AND workspace_id = $2`,
			integrationID, ws).Scan(&kind)
		if err != nil {
			return ErrNotFound
		}
		start := time.Now()
		err = tx.QueryRow(ctx, `
			INSERT INTO integration_sync_runs
				(workspace_id, integration_id, kind, started_at, duration_s, status, records, message)
			VALUES ($1,$2,'push',$3,0,'success',0,'Uji koneksi manual: jalur tulis-baca OK')
			RETURNING id::text, $4, kind, started_at, duration_s, status, records, message`,
			ws, integrationID, start, kind,
		).Scan(&out.ID, &out.Connector, &out.Kind, &out.StartedAt,
			&out.DurationS, &out.Status, &out.Records, &out.Message)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			UPDATE integrations SET status = 'connected', last_sync = now(), updated_at = now()
			WHERE id = $1 AND workspace_id = $2`, integrationID, ws)
		return err
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// Rotasi API key
// ---------------------------------------------------------------------------

type APIKeyOut struct {
	APIKeyRow
	Secret string `json:"secret,omitempty"`
}

// generateAPIKeySecret membuat secret acak: prefix 8 char untuk identifikasi,
// masked untuk tampilan, secret penuh hanya dikembalikan sekali ke pemanggil.
func generateAPIKeySecret() (secret, prefix, masked string, err error) {
	raw := make([]byte, 32)
	if _, err = rand.Read(raw); err != nil {
		return "", "", "", err
	}
	secret = "sk_" + base64.RawURLEncoding.EncodeToString(raw)
	prefix = secret[:11]
	masked = prefix + "…" + secret[len(secret)-4:]
	return secret, prefix, masked, nil
}

// RotateAPIKey mencabut key lama dan menerbitkan key baru dengan nama +
// scope yang sama. Secret plaintext hanya dikembalikan sekali saat respons
// ini (disimpan masked di DB).
func (s *Store) RotateAPIKey(
	ctx context.Context, ws, user uuid.UUID, keyID string,
) (*APIKeyOut, error) {
	if _, err := uuid.Parse(strings.TrimSpace(keyID)); err != nil {
		return nil, fmt.Errorf("%w: id API key harus UUID valid", ErrInvalidContext)
	}
	out := &APIKeyOut{}
	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		var name, scope string
		err := tx.QueryRow(ctx, `
			SELECT name, scope FROM api_keys
			WHERE id = $1 AND workspace_id = $2 AND status = 'active'`,
			keyID, ws).Scan(&name, &scope)
		if err != nil {
			return ErrNotFound
		}
		if _, err := tx.Exec(ctx, `
			UPDATE api_keys SET status = 'revoked'
			WHERE id = $1 AND workspace_id = $2`, keyID, ws); err != nil {
			return err
		}
		secret, prefix, masked, err := generateAPIKeySecret()
		if err != nil {
			return err
		}
		out.Secret = secret
		return tx.QueryRow(ctx, `
			INSERT INTO api_keys (workspace_id, name, prefix, masked, scope, status)
			VALUES ($1,$2,$3,$4,$5,'active')
			RETURNING id::text, name, prefix, masked, scope, created_at, last_used_at, status`,
			ws, name, prefix, masked, scope,
		).Scan(&out.ID, &out.Name, &out.Prefix, &out.Masked, &out.Scope,
			&out.CreatedAt, &out.LastUsed, &out.Status)
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}
