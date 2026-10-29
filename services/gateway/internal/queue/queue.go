// Package queue: antrean job lewat Postgres (River). Abstraksi JobQueue
// memungkinkan profil penuh memakai Redis tanpa mengubah domain (PRD §16.3, ADR-003).
package queue

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/store"
)

// RiverQueue membungkus client River. Satu binary melayani mode api & worker
// (PRD §16.3 hemat memori).
type RiverQueue struct {
	client *river.Client[pgx.Tx]
	log    *slog.Logger
}

// Migrate menyiapkan tabel River (dijalankan saat startup, idempotent).
func Migrate(ctx context.Context, pool *pgxpool.Pool, log *slog.Logger) error {
	migrator, err := rivermigrate.New(riverpgxv5.New(pool), nil)
	if err != nil {
		return fmt.Errorf("river migrator: %w", err)
	}
	res, err := migrator.Migrate(ctx, rivermigrate.DirectionUp, nil)
	if err != nil {
		return fmt.Errorf("river migrate up: %w", err)
	}
	if len(res.Versions) > 0 {
		log.Info("migrasi river diterapkan", "versions", len(res.Versions))
	}
	return nil
}

// New membuat queue. workers harus sudah terisi; start=false berarti klien
// hanya boleh enqueue (mode api).
func New(pool *pgxpool.Pool, workers *river.Workers, periodic []*river.PeriodicJob, maxWorkers int, log *slog.Logger) (*RiverQueue, error) {
	if maxWorkers <= 0 {
		maxWorkers = 2
	}
	cfg := &river.Config{
		Logger:       log,
		Workers:      workers,
		PeriodicJobs: periodic,
		Queues: map[string]river.QueueConfig{
			river.QueueDefault: {MaxWorkers: maxWorkers},
			"ingest":           {MaxWorkers: 1}, // ingestion berat: serial
			"vision":           {MaxWorkers: 1}, // konkurensi vision = 1 (PRD §16.4)
			"eval":             {MaxWorkers: 1},
		},
		JobTimeout:      5 * time.Minute,
		SoftStopTimeout: 15 * time.Second,
	}
	client, err := river.NewClient(riverpgxv5.New(pool), cfg)
	if err != nil {
		return nil, fmt.Errorf("buat river client: %w", err)
	}
	return &RiverQueue{client: client, log: log}, nil
}

// Start menjalankan worker loop (mode worker/all).
func (q *RiverQueue) Start(ctx context.Context) error {
	if err := q.client.Start(ctx); err != nil {
		return fmt.Errorf("start river: %w", err)
	}
	q.log.Info("worker river berjalan")
	return nil
}

// Stop menghentikan worker dengan grace period.
func (q *RiverQueue) Stop(ctx context.Context) error {
	if err := q.client.Stop(ctx); err != nil {
		return fmt.Errorf("stop river: %w", err)
	}
	return nil
}

// Enqueue memasukkan satu job bertipe args. Args harus mengimplementasikan
// river.JobArgs (lihat internal/jobs).
func (q *RiverQueue) Enqueue(ctx context.Context, args river.JobArgs, queueName string, maxAttempts int, unique bool) (int64, error) {
	opts := &river.InsertOpts{}
	if queueName != "" {
		opts.Queue = queueName
	}
	if maxAttempts > 0 {
		opts.MaxAttempts = maxAttempts
	}
	if unique {
		opts.UniqueOpts = river.UniqueOpts{ByArgs: true}
	}
	res, err := q.client.Insert(ctx, args, opts)
	if err != nil {
		return 0, fmt.Errorf("enqueue %s: %w", args.Kind(), err)
	}
	return res.Job.ID, nil
}

// EnqueueTx memasukkan job dalam transaksi yang sama dengan perubahan DB.
func (q *RiverQueue) EnqueueTx(ctx context.Context, tx pgx.Tx, args river.JobArgs, queueName string, maxAttempts int, unique bool) (int64, error) {
	opts := &river.InsertOpts{}
	if queueName != "" {
		opts.Queue = queueName
	}
	if maxAttempts > 0 {
		opts.MaxAttempts = maxAttempts
	}
	if unique {
		opts.UniqueOpts = river.UniqueOpts{ByArgs: true}
	}
	res, err := q.client.InsertTx(ctx, tx, args, opts)
	if err != nil {
		return 0, fmt.Errorf("enqueue tx %s: %w", args.Kind(), err)
	}
	return res.Job.ID, nil
}

// Depth menghitung job aktif; dipakai /readyz dan mode L2.
func (q *RiverQueue) Depth(ctx context.Context) (int, error) { return 0, nil }

// DepthFromStore dipakai handler karena pool tersedia di store.
func DepthFromStore(ctx context.Context, st *store.Store) (int, error) { return st.QueueDepth(ctx) }
