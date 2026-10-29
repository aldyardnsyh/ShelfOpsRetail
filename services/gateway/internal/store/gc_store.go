package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// ListOrphanUploads mengembalikan kunci objek yang boleh dihapus oleh GC
// (slot upload kedaluwarsa + versi dokumen superseded). Query dijalankan lewat
// fungsi SECURITY DEFINER karena bersifat lintas workspace (job sistem).
func (s *Store) ListOrphanUploads(ctx context.Context, cutoff time.Time) ([]string, error) {
	rows, err := s.pool.Query(ctx, `SELECT gc_orphan_uploads($1)`, cutoff)
	if err != nil {
		return nil, fmt.Errorf("gc_orphan_uploads: %w", err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		out = append(out, key)
	}
	return out, rows.Err()
}

// DemoReset menjalankan reset workspace demo secara manual (tooling/ops).
func (s *Store) DemoReset(ctx context.Context, hours int) (map[string]any, error) {
	if hours <= 0 {
		hours = 24
	}
	var res map[string]any
	err := s.WithTx(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT demo_reset($1)`, hours).Scan(&res)
	})
	return res, err
}
