// Package jobs: definisi pekerjaan async (River) beserta worker-nya.
// Semua job idempotent dan retry-safe (PRD §6 Reliability).
package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"

	shelfopsv1 "github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/gen/shelfops/v1"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/store"
)

// ---------------------------------------------------------------------------
// demo_reset — bersihkan data pengunjung demo setiap 24 jam (BR-08).
// ---------------------------------------------------------------------------

type DemoResetArgs struct {
	Hours int `json:"hours"`
}

func (DemoResetArgs) Kind() string { return "demo_reset" }

func (DemoResetArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: river.QueueDefault, MaxAttempts: 3, UniqueOpts: river.UniqueOpts{ByArgs: true}}
}

type DemoResetWorker struct {
	river.WorkerDefaults[DemoResetArgs]
	Store *store.Store
	Log   *slog.Logger
}

func (w *DemoResetWorker) Work(ctx context.Context, job *river.Job[DemoResetArgs]) error {
	hours := job.Args.Hours
	if hours <= 0 {
		hours = 24
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	var result map[string]any
	if err := w.Store.WithTx(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT demo_reset($1)`, hours).Scan(&result)
	}); err != nil {
		return fmt.Errorf("demo_reset: %w", err)
	}
	payload, _ := json.Marshal(result)
	w.Log.Info("reset demo selesai", "hours", hours, "result", string(payload))
	return nil
}

// ---------------------------------------------------------------------------
// token_purge — buang refresh token kedaluwarsa (higiene keamanan).
// ---------------------------------------------------------------------------

type TokenPurgeArgs struct{}

func (TokenPurgeArgs) Kind() string { return "token_purge" }

func (TokenPurgeArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: river.QueueDefault, MaxAttempts: 2}
}

type TokenPurgeWorker struct {
	river.WorkerDefaults[TokenPurgeArgs]
	Store *store.Store
	Log   *slog.Logger
}

func (w *TokenPurgeWorker) Work(ctx context.Context, _ *river.Job[TokenPurgeArgs]) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	n, err := w.Store.PurgeExpiredTokens(ctx)
	if err != nil {
		return fmt.Errorf("token purge: %w", err)
	}
	if n > 0 {
		w.Log.Info("refresh token kedaluwarsa dibersihkan", "count", n)
	}
	return nil
}

// ---------------------------------------------------------------------------
// object_gc — hapus berkas orphan/kedaluwarsa di ObjectStore (TTL 24 jam).
// ---------------------------------------------------------------------------

type ObjectGCArgs struct{}

func (ObjectGCArgs) Kind() string { return "object_gc" }

func (ObjectGCArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: river.QueueDefault, MaxAttempts: 2}
}

// ObjectGCWorker bergantung pada ObjectStore + store; disuntikkan dari main.
type ObjectGCWorker struct {
	river.WorkerDefaults[ObjectGCArgs]
	Log *slog.Logger
	Run func(ctx context.Context) (int, error)
}

func (w *ObjectGCWorker) Work(ctx context.Context, _ *river.Job[ObjectGCArgs]) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	n, err := w.Run(ctx)
	if err != nil {
		return fmt.Errorf("object gc: %w", err)
	}
	if n > 0 {
		w.Log.Info("objek kedaluwarsa dibersihkan", "count", n)
	}
	return nil
}

// ---------------------------------------------------------------------------
// kb_ingest — meneruskan dokumen ke ai-rag (parse/chunk/embed), lalu memperbarui
// status dokumen. Idempotent: ai-rag mengganti chunk per (document, version).
// ---------------------------------------------------------------------------

type KBIngestArgs struct {
	WorkspaceID string `json:"workspace_id"`
	DocumentID  string `json:"document_id"`
}

func (KBIngestArgs) Kind() string { return "kb_ingest" }

func (KBIngestArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: "ingest", MaxAttempts: 3, UniqueOpts: river.UniqueOpts{ByArgs: true}}
}

type KBIngestWorker struct {
	river.WorkerDefaults[KBIngestArgs]
	RAG  shelfopsv1.RagServiceClient
	St   *store.Store
	Log  *slog.Logger
	Addr string
}

func (w *KBIngestWorker) Work(ctx context.Context, job *river.Job[KBIngestArgs]) error {
	ws, err := uuid.Parse(job.Args.WorkspaceID)
	if err != nil {
		return fmt.Errorf("workspace_id tidak valid: %w", err)
	}
	if w.RAG == nil {
		w.Log.Warn("kb_ingest: ai-rag tidak dikonfigurasi, dokumen tetap uploaded",
			"workspace_id", job.Args.WorkspaceID, "document_id", job.Args.DocumentID)
		return nil
	}
	doc, err := w.St.GetDocument(ctx, ws, job.Args.DocumentID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			w.Log.Info("kb_ingest: dokumen sudah dihapus, lewati", "document_id", job.Args.DocumentID)
			return nil
		}
		return fmt.Errorf("ambil dokumen: %w", err)
	}
	if doc.SourceURI == nil {
		w.Log.Warn("kb_ingest: dokumen tanpa source_uri", "document_id", doc.ID)
		return nil
	}
	_ = w.St.UpdateDocumentStatus(ctx, ws, doc.ID, "processing", doc.ChunkCount, nil)

	gctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	stream, err := w.RAG.Ingest(gctx, &shelfopsv1.IngestRequest{
		RequestId:    doc.ID,
		WorkspaceId:  ws.String(),
		DocumentId:   doc.ID,
		Version:      int32(doc.CurrentVersion),
		ObjectKey:    *doc.SourceURI,
		Mime:         doc.MIME,
		Language:     doc.Language,
		ForceReindex: true,
	})
	if err != nil {
		return w.fail(ctx, ws, doc, err)
	}
	var msg string
	for {
		resp, err := stream.Recv()
		if err != nil {
			return w.fail(ctx, ws, doc, err)
		}
		msg = resp.Message
		switch resp.State {
		case shelfopsv1.IngestResponse_STATE_FAILED:
			if resp.Error != "" {
				msg = resp.Error
			}
			w.notifyFail(ctx, ws, doc.ID, msg)
			w.Log.Warn("kb_ingest: ai-rag melaporkan kegagalan", "document_id", doc.ID, "error", msg)
			return nil // konten bermasalah; retry tidak akan membantu
		case shelfopsv1.IngestResponse_STATE_READY:
			if err := w.St.UpdateDocumentStatus(ctx, ws, doc.ID, "ready", int(resp.ChunksDone), nil); err != nil {
				return fmt.Errorf("perbarui status dokumen: %w", err)
			}
			w.Log.Info("kb_ingest selesai", "document_id", doc.ID, "chunks", resp.ChunksDone)
			return nil
		}
	}
}

func (w *KBIngestWorker) fail(ctx context.Context, ws uuid.UUID, doc *store.DocumentRow, cause error) error {
	// Pesan untuk pengguna tidak membocorkan alamat internal/gRPC. Detail
	// teknis tetap tercatat di log agar bisa didiagnosis.
	errMsg := "Pemrosesan dokumen gagal. Berkas tersimpan; coba proses ulang setelah layanan AI pulih atau hubungi admin."
	_ = w.St.UpdateDocumentStatus(ctx, ws, doc.ID, "failed", 0, &errMsg)
	w.Log.Error("kb_ingest gagal", "document_id", doc.ID, "ai_rag_addr", w.Addr, "error", cause)
	return errors.New("ingest ai-rag: " + errMsg) // kembalikan error agar River mencoba ulang
}

func (w *KBIngestWorker) notifyFail(ctx context.Context, ws uuid.UUID, documentID, msg string) {
	_ = w.St.UpdateDocumentStatus(ctx, ws, documentID, "failed", 0, &msg)
}

// RegisterAll mendaftarkan seluruh worker ke registry River.
func RegisterAll(workers *river.Workers, st *store.Store, log *slog.Logger, rag shelfopsv1.RagServiceClient, ragAddr string, objectGC func(ctx context.Context) (int, error)) {
	river.AddWorker(workers, &DemoResetWorker{Store: st, Log: log})
	river.AddWorker(workers, &TokenPurgeWorker{Store: st, Log: log})
	river.AddWorker(workers, &KBIngestWorker{RAG: rag, St: st, Log: log, Addr: ragAddr})
	if objectGC != nil {
		river.AddWorker(workers, &ObjectGCWorker{Log: log, Run: objectGC})
	}
}

// Periodic mengembalikan jadwal berkala (dijalankan oleh worker mode).
func Periodic(resetHours int) []*river.PeriodicJob {
	if resetHours <= 0 {
		resetHours = 24
	}
	return []*river.PeriodicJob{
		river.NewPeriodicJob(
			river.PeriodicInterval(time.Duration(resetHours)*time.Hour),
			func() (river.JobArgs, *river.InsertOpts) {
				return DemoResetArgs{Hours: resetHours}, nil
			},
			&river.PeriodicJobOpts{RunOnStart: true},
		),
		river.NewPeriodicJob(
			river.PeriodicInterval(6*time.Hour),
			func() (river.JobArgs, *river.InsertOpts) { return TokenPurgeArgs{}, nil },
			&river.PeriodicJobOpts{RunOnStart: false},
		),
		river.NewPeriodicJob(
			river.PeriodicInterval(3*time.Hour),
			func() (river.JobArgs, *river.InsertOpts) { return ObjectGCArgs{}, nil },
			&river.PeriodicJobOpts{RunOnStart: false},
		),
	}
}
