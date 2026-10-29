// Command shelfops adalah binary tunggal gateway+worker (PRD §14.1).
//
// Penggunaan:
//
//	shelfops serve                      # jalankan API (dan worker bila GATEWAY_MODE=all)
//	shelfops migrate up|down [n]|status # migrasi DB
//	shelfops seed                       # isi sample data fiktif (idempotent)
//	shelfops user create --email --password --role [--workspace]
//	shelfops bootstrap --email --password [--workspace] [--name]
//	                                    # workspace nyata + admin pertama (idempoten)
//	shelfops gc objects                 # bersihkan berkas kedaluwarsa
//	shelfops version
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/riverqueue/river"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	shelfopsv1 "github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/gen/shelfops/v1"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/auth"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/config"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/httpx"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/jobs"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/migrate"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/objectstore"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/queue"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/rbac"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/store"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/migrations"
)

var commit = "dev"

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	cmd := os.Args[1]
	args := os.Args[2:]

	switch cmd {
	case "serve":
		must(runServe(args))
	case "migrate":
		must(runMigrate(args))
	case "seed":
		must(runSeed(args))
	case "user":
		must(runUser(args))
	case "bootstrap":
		must(runBootstrap(args))
	case "gc":
		must(runGC(args))
	case "version", "--version", "-v":
		fmt.Printf("shelfops %s (commit %s)\n", version(), commit)
	case "help", "-h", "--help":
		usage()
	default:
		fmt.Fprintf(os.Stderr, "perintah tidak dikenal: %s\n\n", cmd)
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Print(`shelfops — gateway + worker ShelfOps

  serve                                jalankan API/worker
  migrate up|down [n]|status           migrasi database
  seed                                 isi sample data fiktif (idempotent)
  user create --email E --password P --role R [--workspace UUID] [--name N]
  gc objects                           bersihkan berkas kedaluwarsa
  version
`)
}

func must(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func version() string { return "0.1.0" }

func newLogger(cfg *config.Config) *slog.Logger {
	level := slog.LevelInfo
	switch cfg.LogLevel {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	}
	h := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})
	return slog.New(h).With("service", "gateway", "version", version(), "commit", commit)
}

// ---------------------------------------------------------------------------
// serve
// ---------------------------------------------------------------------------

func runServe(args []string) error {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	cfgPath := fs.String("config", "", "file env tambahan (opsional)")
	_ = fs.Parse(args)
	_ = cfgPath

	// LoadForServe menjalankan guard provider produksi: boot ditolak bila
	// provider AI masih tiruan (kecuali ALLOW_MOCK_PROVIDERS=true).
	cfg, err := config.LoadForServe(commit)
	if err != nil {
		return err
	}
	log := newLogger(cfg)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if cfg.Migrate {
		if err := migrateUp(ctx, cfg, log); err != nil {
			return fmt.Errorf("migrasi otomatis: %w", err)
		}
	}

	st, err := store.New(ctx, cfg.DatabaseURL, cfg.MaxConnsOrDefault())
	if err != nil {
		return err
	}
	defer st.Close()

	if err := queue.Migrate(ctx, st.Pool(), log); err != nil {
		return err
	}

	osStore, err := objectstore.NewLocalFS(cfg.ObjectStoreRoot)
	if err != nil {
		return err
	}

	// Koneksi gRPC ke ai-rag dibuat sebelum worker karena worker kb_ingest
	// membutuhkannya (NewClient lazy — gagal connect tidak menghentikan boot).
	var ragClient shelfopsv1.RagServiceClient
	ragConn, err := grpc.NewClient(cfg.RAGGRPCAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Warn("ai-rag gRPC client tidak dapat dibuat; chat & ingest berjalan dalam mode degradasi", "error", err)
	} else {
		defer ragConn.Close()
		ragClient = shelfopsv1.NewRagServiceClient(ragConn)
	}

	// Klien ai-vision dipakai endpoint POST /audits/{id}/start. Gagal connect
	// tidak menghentikan boot; endpoint menjawab 503 dengan jujur.
	var visionClient shelfopsv1.VisionServiceClient
	visionConn, err := grpc.NewClient(cfg.VisionGRPCAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Warn("ai-vision gRPC client tidak dapat dibuat; analisis foto berjalan dalam mode degradasi", "error", err)
	} else {
		defer visionConn.Close()
		visionClient = shelfopsv1.NewVisionServiceClient(visionConn)
	}

	workers := river.NewWorkers()
	jobs.RegisterAll(workers, st, log, ragClient, cfg.RAGGRPCAddr, func(ctx context.Context) (int, error) {
		return gcObjects(ctx, cfg, osStore, st)
	})

	q, err := queue.New(st.Pool(), workers, jobs.Periodic(cfg.DemoResetHours), 2, log)
	if err != nil {
		return err
	}

	if cfg.Mode == config.ModeWorker || cfg.Mode == config.ModeAll {
		if err := q.Start(ctx); err != nil {
			return err
		}
		defer func() {
			stopCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			if err := q.Stop(stopCtx); err != nil {
				log.Error("stop worker", "error", err)
			}
		}()
	}

	if cfg.Mode == config.ModeWorker {
		log.Info("mode worker: API tidak dijalankan")
		<-ctx.Done()
		return nil
	}

	srv := httpx.NewServer(cfg, log, st)
	srv.Objects = osStore
	srv.Queue = q
	srv.RAGClient = ragClient
	srv.Vision = visionClient
	httpServer := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           srv.Router(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      120 * time.Second, // SSE butuh write timeout longgar
		IdleTimeout:       90 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info("gateway mendengarkan", "addr", cfg.HTTPAddr, "mode", cfg.Mode, "env", cfg.AppEnv)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		log.Info("sinyal berhenti diterima, menutup server")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTO)
	defer cancel()
	return httpServer.Shutdown(shutdownCtx)
}

// ---------------------------------------------------------------------------
// migrate / seed
// ---------------------------------------------------------------------------

func migrateUp(ctx context.Context, cfg *config.Config, log *slog.Logger) error {
	r, err := migrate.Connect(ctx, cfg.DatabaseURL, log)
	if err != nil {
		return err
	}
	defer r.Close(ctx)
	applied, err := r.Up(ctx, migrations.FS)
	if err != nil {
		return err
	}
	if len(applied) == 0 {
		log.Debug("tidak ada migrasi baru")
	}
	return nil
}

func runMigrate(args []string) error {
	cfg, err := config.Load(commit)
	if err != nil {
		return err
	}
	log := newLogger(cfg)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	action := "up"
	if len(args) > 0 {
		action = args[0]
	}
	r, err := migrate.Connect(ctx, cfg.DatabaseURL, log)
	if err != nil {
		return err
	}
	defer r.Close(ctx)

	switch action {
	case "up":
		applied, err := r.Up(ctx, migrations.FS)
		if err != nil {
			return err
		}
		fmt.Printf("migrasi up: %d diterapkan\n", len(applied))
	case "down":
		steps := 1
		if len(args) > 1 {
			fmt.Sscanf(args[1], "%d", &steps)
		}
		reverted, err := r.Down(ctx, migrations.FS, steps)
		if err != nil {
			return err
		}
		fmt.Printf("migrasi down: %v\n", reverted)
	case "status":
		s, err := r.Status(ctx, migrations.FS)
		if err != nil {
			return err
		}
		fmt.Print(s)
	default:
		return fmt.Errorf("aksi migrasi tidak dikenal: %s (up|down|status)", action)
	}
	return nil
}

// seedUserID adalah user sistem yang dimiliki baris sample data (tidak pernah dihapus reset demo).
const seedUserID = "00000000-0000-7000-8000-000000000101"

func runSeed(args []string) error {
	cfg, err := config.Load(commit)
	if err != nil {
		return err
	}
	log := newLogger(cfg)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	if err := migrateUp(ctx, cfg, log); err != nil {
		return err
	}
	st, err := store.New(ctx, cfg.DatabaseURL, 2)
	if err != nil {
		return err
	}
	defer st.Close()

	sql, err := migrations.SeedSQL(migrations.FS)
	if err != nil {
		return err
	}
	if err := migrate.Seed(ctx, cfg.DatabaseURL, cfg.DemoWorkspaceID, seedUserID, sql, log); err != nil {
		return err
	}
	fmt.Println("seed selesai (sample data fiktif siap)")
	return nil
}

// ---------------------------------------------------------------------------
// user
// ---------------------------------------------------------------------------

func runUser(args []string) error {
	if len(args) == 0 || args[0] != "create" {
		return errors.New("gunakan: shelfops user create --email E --password P --role R")
	}
	fs := flag.NewFlagSet("user create", flag.ExitOnError)
	email := fs.String("email", "", "email pengguna")
	name := fs.String("name", "", "nama tampilan")
	password := fs.String("password", "", "password (min 8 karakter)")
	role := fs.String("role", "admin", "admin|analyst|auditor|viewer")
	workspace := fs.String("workspace", "", "workspace id (default: workspace demo)")
	if err := fs.Parse(args[1:]); err != nil {
		return err
	}
	if *email == "" || *password == "" {
		return errors.New("--email dan --password wajib")
	}
	cfg, err := config.Load(commit)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	st, err := store.New(ctx, cfg.DatabaseURL, 2)
	if err != nil {
		return err
	}
	defer st.Close()

	parsedRole, err := rbac.ParseRole(*role)
	if err != nil {
		return err
	}
	wsID := cfg.DemoWorkspaceID
	if *workspace != "" {
		wsID = *workspace
	} else {
		// Workspace non-demo harus dibuat eksplisit; default memakai demo agar
		// selalu ada keanggotaan yang valid.
		wsID = cfg.DemoWorkspaceID
	}
	hash, err := auth.DefaultHasher().Hash(*password)
	if err != nil {
		return err
	}
	displayName := *name
	if displayName == "" {
		displayName = *email
	}
	id, err := st.CreateUser(ctx, wsID, *email, displayName, hash, parsedRole, false)
	if err != nil {
		return err
	}
	fmt.Printf("pengguna dibuat: %s (role %s, workspace %s)\n", id, parsedRole, wsID)
	return nil
}

// ---------------------------------------------------------------------------
// gc
// ---------------------------------------------------------------------------

func runGC(args []string) error {
	action := "objects"
	if len(args) > 0 {
		action = args[0]
	}
	if action != "objects" {
		return fmt.Errorf("aksi gc tidak dikenal: %s (objects)", action)
	}
	cfg, err := config.Load(commit)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	st, err := store.New(ctx, cfg.DatabaseURL, 2)
	if err != nil {
		return err
	}
	defer st.Close()

	osStore, err := objectstore.NewLocalFS(cfg.ObjectStoreRoot)
	if err != nil {
		return err
	}
	n, err := gcObjects(ctx, cfg, osStore, st)
	if err != nil {
		return err
	}
	fmt.Printf("gc objects: %d berkas dihapus\n", n)
	return nil
}

// gcObjects menghapus berkas upload yang sudah kedaluwarsa (TTL) atau yatim.
func gcObjects(ctx context.Context, cfg *config.Config, osStore objectstore.ObjectStore, st *store.Store) (int, error) {
	cutoff := time.Now().Add(-cfg.UploadTTL)
	keys, err := st.ListOrphanUploads(ctx, cutoff)
	if err != nil {
		return 0, err
	}
	removed := 0
	for _, k := range keys {
		if err := osStore.Delete(ctx, k); err != nil {
			return removed, err
		}
		removed++
	}
	return removed, nil
}

// ---------------------------------------------------------------------------
// bootstrap
// ---------------------------------------------------------------------------

// runBootstrap menyiapkan workspace nyata + admin pertama. Aman dijalankan
// berulang: workspace dicari berdasarkan nama, pengguna dicari berdasarkan
// email, dan sandi diperbarui ke nilai yang diberikan.
func runBootstrap(args []string) error {
	fs := flag.NewFlagSet("bootstrap", flag.ExitOnError)
	email := fs.String("email", "", "email admin")
	password := fs.String("password", os.Getenv("BOOTSTRAP_PASSWORD"), "password admin (min 8 karakter; bisa lewat BOOTSTRAP_PASSWORD)")
	name := fs.String("name", "", "nama tampilan admin")
	workspace := fs.String("workspace", "ShelfOps", "nama workspace nyata")
	if err := fs.Parse(args); err != nil {
		return err
	}
	*email = strings.TrimSpace(*email)
	*workspace = strings.TrimSpace(*workspace)
	if *email == "" || *password == "" {
		return errors.New("--email dan --password wajib (atau set BOOTSTRAP_PASSWORD)")
	}
	if len(*password) < 8 {
		return errors.New("password minimal 8 karakter")
	}
	displayName := strings.TrimSpace(*name)
	if displayName == "" {
		displayName = *email
	}

	cfg, err := config.Load(commit)
	if err != nil {
		return err
	}
	log := newLogger(cfg)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	if err := migrateUp(ctx, cfg, log); err != nil {
		return err
	}
	st, err := store.New(ctx, cfg.DatabaseURL, 2)
	if err != nil {
		return err
	}
	defer st.Close()

	hash, err := auth.DefaultHasher().Hash(*password)
	if err != nil {
		return err
	}
	res, err := st.BootstrapWorkspaceAdmin(ctx, *workspace, *email, displayName, hash)
	if err != nil {
		return err
	}

	switch {
	case res.Created:
		fmt.Printf("bootstrap selesai: admin %s dibuat di workspace %q (%s)\n", *email, res.WorkspaceName, res.WorkspaceID)
	case res.PasswordReset:
		fmt.Printf("bootstrap selesai: admin %s sudah ada, sandi diperbarui, workspace %q (%s)\n", *email, res.WorkspaceName, res.WorkspaceID)
	}
	return nil
}
