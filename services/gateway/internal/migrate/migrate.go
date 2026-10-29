// Package migrate: runner migrasi kecil (expand/contract) di atas pgx.
//
// Kenapa bukan golang-migrate: kebutuhan kita sempit (up semua, down satu
// langkah, advisory lock, reversible), dan menghindari satu dependensi besar
// di VPS 2 GB. Perilaku yang dijamin: setiap migrasi dijalankan dalam satu
// transaksi, urut naik, dan berhenti pada error pertama.
// Lihat docs/DECISIONS.md D-009 catatan tooling.
package migrate

import (
	"context"
	"fmt"
	"io/fs"
	"log/slog"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var fileRe = regexp.MustCompile(`^(\d{4,})_([a-z0-9_]+)\.(up|down)\.sql$`)

type Migration struct {
	Version int
	Name    string
	UpPath  string
	DownSQL string
	UpSQL   string
}

type File struct {
	Version int
	Name    string
	Dir     string
	SQL     string
}

// Load membaca seluruh migrasi dari FS (urutan naik).
func Load(fsys fs.FS) ([]Migration, error) {
	entries, err := fs.ReadDir(fsys, ".")
	if err != nil {
		return nil, fmt.Errorf("baca direktori migrasi: %w", err)
	}
	ups := map[int]*Migration{}
	downs := map[int]string{}
	names := map[int]string{}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		m := fileRe.FindStringSubmatch(e.Name())
		if m == nil {
			continue
		}
		version, err := strconv.Atoi(m[1])
		if err != nil {
			return nil, fmt.Errorf("versi tidak valid pada %s", e.Name())
		}
		content, err := fs.ReadFile(fsys, e.Name())
		if err != nil {
			return nil, fmt.Errorf("baca %s: %w", e.Name(), err)
		}
		names[version] = m[2]
		if m[3] == "up" {
			ups[version] = &Migration{Version: version, Name: m[2], UpSQL: string(content)}
		} else {
			downs[version] = string(content)
		}
	}
	out := make([]Migration, 0, len(ups))
	for v, m := range ups {
		if _, ok := downs[v]; !ok {
			return nil, fmt.Errorf("migrasi %04d_%s tidak punya file .down.sql (harus reversible)", v, m.Name)
		}
		m.DownSQL = downs[v]
		out = append(out, *m)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Version < out[j].Version })
	return out, nil
}

type Runner struct {
	conn *pgx.Conn
	log  *slog.Logger
}

// Connect membuat koneksi khusus migrasi dengan simple protocol agar satu
// berkas SQL boleh berisi banyak statement (dan dollar-quoted function).
func Connect(ctx context.Context, dsn string, log *slog.Logger) (*Runner, error) {
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse DSN: %w", err)
	}
	cfg.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	cfg.RuntimeParams["application_name"] = "shelfops-migrate"
	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("koneksi migrasi: %w", err)
	}
	return &Runner{conn: conn, log: log}, nil
}

func (r *Runner) Close(ctx context.Context) { _ = r.conn.Close(ctx) }

const advisoryLockKey = 0x5E1F00D5 // sembarang, konstan

func (r *Runner) lock(ctx context.Context) error {
	_, err := r.conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, int64(advisoryLockKey))
	return err
}

func (r *Runner) unlock(ctx context.Context) {
	_, _ = r.conn.Exec(ctx, `SELECT pg_advisory_unlock($1)`, int64(advisoryLockKey))
}

func (r *Runner) ensureTable(ctx context.Context) error {
	_, err := r.conn.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    integer PRIMARY KEY,
			name       text NOT NULL,
			applied_at timestamptz NOT NULL DEFAULT now()
		)`)
	return err
}

func (r *Runner) applied(ctx context.Context) (map[int]bool, error) {
	rows, err := r.conn.Query(ctx, `SELECT version FROM schema_migrations ORDER BY version`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int]bool{}
	for rows.Next() {
		var v int
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		out[v] = true
	}
	return out, rows.Err()
}

// Up menerapkan seluruh migrasi yang belum dijalankan.
func (r *Runner) Up(ctx context.Context, fsys fs.FS) (applied []int, err error) {
	migs, err := Load(fsys)
	if err != nil {
		return nil, err
	}
	if err := r.lock(ctx); err != nil {
		return nil, fmt.Errorf("ambil advisory lock: %w", err)
	}
	defer r.unlock(ctx)
	if err := r.ensureTable(ctx); err != nil {
		return nil, err
	}
	done, err := r.applied(ctx)
	if err != nil {
		return nil, err
	}
	for _, m := range migs {
		if done[m.Version] {
			continue
		}
		start := time.Now()
		if err := r.applyOne(ctx, m); err != nil {
			return applied, fmt.Errorf("migrasi %04d_%s gagal: %w", m.Version, m.Name, err)
		}
		r.log.Info("migrasi diterapkan", "version", m.Version, "name", m.Name, "duration_ms", time.Since(start).Milliseconds())
		applied = append(applied, m.Version)
	}
	return applied, nil
}

func (r *Runner) applyOne(ctx context.Context, m Migration) error {
	tx, err := r.conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, m.UpSQL); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (version, name) VALUES ($1,$2)`, m.Version, m.Name); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Down membatalkan `steps` migrasi terakhir (default 1). Migrasi yang tidak
// punya file down akan menolak dijalankan.
func (r *Runner) Down(ctx context.Context, fsys fs.FS, steps int) (reverted []int, err error) {
	if steps <= 0 {
		steps = 1
	}
	migs, err := Load(fsys)
	if err != nil {
		return nil, err
	}
	byVersion := map[int]Migration{}
	maxVersion := 0
	for _, m := range migs {
		byVersion[m.Version] = m
		if m.Version > maxVersion {
			maxVersion = m.Version
		}
	}
	if err := r.lock(ctx); err != nil {
		return nil, fmt.Errorf("ambil advisory lock: %w", err)
	}
	defer r.unlock(ctx)
	if err := r.ensureTable(ctx); err != nil {
		return nil, err
	}
	done, err := r.applied(ctx)
	if err != nil {
		return nil, err
	}
	order := make([]int, 0, len(done))
	for v := range done {
		order = append(order, v)
	}
	sort.Sort(sort.Reverse(sort.IntSlice(order)))
	for i := 0; i < steps && i < len(order); i++ {
		v := order[i]
		m, ok := byVersion[v]
		if !ok {
			return reverted, fmt.Errorf("migrasi %04d tidak ada di repo; rollback manual diperlukan", v)
		}
		tx, err := r.conn.Begin(ctx)
		if err != nil {
			return reverted, err
		}
		if _, err := tx.Exec(ctx, m.DownSQL); err != nil {
			_ = tx.Rollback(ctx)
			return reverted, fmt.Errorf("rollback %04d_%s gagal: %w", v, m.Name, err)
		}
		if _, err := tx.Exec(ctx, `DELETE FROM schema_migrations WHERE version = $1`, v); err != nil {
			_ = tx.Rollback(ctx)
			return reverted, err
		}
		if err := tx.Commit(ctx); err != nil {
			return reverted, err
		}
		r.log.Info("migrasi di-rollback", "version", v, "name", m.Name)
		reverted = append(reverted, v)
	}
	return reverted, nil
}

// Status melaporkan versi yang sudah diterapkan dan yang tertunda.
func (r *Runner) Status(ctx context.Context, fsys fs.FS) (string, error) {
	migs, err := Load(fsys)
	if err != nil {
		return "", err
	}
	if err := r.ensureTable(ctx); err != nil {
		return "", err
	}
	done, err := r.applied(ctx)
	if err != nil {
		return "", err
	}
	var sb strings.Builder
	for _, m := range migs {
		state := "pending"
		if done[m.Version] {
			state = "applied"
		}
		fmt.Fprintf(&sb, "%04d_%-22s %s\n", m.Version, m.Name, state)
	}
	return sb.String(), nil
}
