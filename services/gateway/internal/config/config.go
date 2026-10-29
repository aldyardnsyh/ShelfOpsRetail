// Package config memuat konfigurasi 12-factor dari environment dan memvalidasinya
// saat startup (fail fast, PRD §14.2).
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Mode string

const (
	ModeAPI    Mode = "api"
	ModeWorker Mode = "worker"
	ModeAll    Mode = "all"
)

type Config struct {
	AppEnv      string
	BaseURL     string
	WebBaseURL  string
	LogLevel    string
	Mode        Mode
	HTTPAddr    string
	ShutdownTO  time.Duration
	DatabaseURL string
	DBMaxConns  int32
	Migrate     bool

	JWTSecret       string
	SessionSecret   string
	AccessTTL       time.Duration
	RefreshTTL      time.Duration
	CookieDomain    string
	CookieSecure    bool
	LoginRatePerMin int

	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURL  string

	DemoEnabled      bool
	DemoWorkspaceID  string
	DemoResetHours   int
	DemoAIReqPerHour int

	ObjectStoreDriver string
	ObjectStoreRoot   string
	UploadTTL         time.Duration
	UploadMaxDocMB    int
	UploadMaxImageMB  int

	LLMProvider        string
	LLMPrimaryBaseURL  string
	LLMPrimaryAPIKey   string
	LLMPrimaryModel    string
	LLMFallbackBaseURL string
	LLMFallbackAPIKey  string
	LLMFallbackModel   string
	LLMDailyBudgetUSD  float64
	LLMRequestTimeout  time.Duration

	EmbeddingProvider string
	EmbeddingBaseURL  string
	EmbeddingAPIKey   string
	EmbeddingModel    string
	EmbeddingDim      int
	EmbeddingBatch    int

	VLMProvider string
	VLMBaseURL  string
	VLMAPIKey   string
	VLMModel    string

	RAGGRPCAddr    string
	VisionGRPCAddr string
	VisionTimeout  time.Duration
	VisionConc     int
	VisionBatch    int
	VisionBatchMS  int

	RateLimitPerMin int
	QueueMaxDepth   int
	Commit          string
}

func Load(commit string) (*Config, error) {
	c := &Config{
		AppEnv:      env("APP_ENV", "development"),
		BaseURL:     env("APP_BASE_URL", "http://localhost:8080"),
		WebBaseURL:  env("WEB_BASE_URL", "http://localhost:3000"),
		LogLevel:    env("LOG_LEVEL", "info"),
		Mode:        Mode(env("GATEWAY_MODE", string(ModeAll))),
		HTTPAddr:    env("GATEWAY_HTTP_ADDR", ":8080"),
		ShutdownTO:  envDur("GATEWAY_SHUTDOWN_TIMEOUT", 20*time.Second),
		DatabaseURL: env("DATABASE_URL", ""),
		DBMaxConns:  int32(envInt("DB_MAX_CONNS", 10)),
		Migrate:     envBool("MIGRATE_ON_START", true),

		JWTSecret:       env("JWT_SECRET", ""),
		SessionSecret:   env("SESSION_SECRET", ""),
		AccessTTL:       envDur("ACCESS_TOKEN_TTL", 15*time.Minute),
		RefreshTTL:      envDur("REFRESH_TOKEN_TTL", 720*time.Hour),
		CookieDomain:    env("COOKIE_DOMAIN", ""),
		CookieSecure:    envBool("COOKIE_SECURE", false),
		LoginRatePerMin: envInt("LOGIN_RATE_LIMIT_PER_MIN", 10),

		GoogleClientID:     env("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: env("GOOGLE_CLIENT_SECRET", ""),
		GoogleRedirectURL:  env("GOOGLE_REDIRECT_URL", ""),

		DemoEnabled:      envBool("DEMO_ENABLED", true),
		DemoWorkspaceID:  env("DEMO_WORKSPACE_ID", "00000000-0000-7000-8000-000000000001"),
		DemoResetHours:   envInt("DEMO_RESET_HOURS", 24),
		DemoAIReqPerHour: envInt("DEMO_AI_REQUESTS_PER_HOUR", 30),

		ObjectStoreDriver: env("OBJECT_STORE_DRIVER", "local"),
		ObjectStoreRoot:   env("OBJECT_STORE_ROOT", "./data/uploads"),
		UploadTTL:         envDur("UPLOAD_TTL_HOURS", 24*time.Hour),
		UploadMaxDocMB:    envInt("UPLOAD_MAX_DOC_MB", 20),
		UploadMaxImageMB:  envInt("UPLOAD_MAX_IMAGE_MB", 10),

		LLMProvider:        strings.ToLower(env("LLM_PROVIDER", "replay")),
		LLMPrimaryBaseURL:  env("LLM_PRIMARY_BASE_URL", ""),
		LLMPrimaryAPIKey:   env("LLM_PRIMARY_API_KEY", ""),
		LLMPrimaryModel:    env("LLM_PRIMARY_MODEL", ""),
		LLMFallbackBaseURL: env("LLM_FALLBACK_BASE_URL", ""),
		LLMFallbackAPIKey:  env("LLM_FALLBACK_API_KEY", ""),
		LLMFallbackModel:   env("LLM_FALLBACK_MODEL", ""),
		LLMDailyBudgetUSD:  envFloat("LLM_DAILY_BUDGET_USD", 1.0),
		LLMRequestTimeout:  envDur("LLM_REQUEST_TIMEOUT", 45*time.Second),

		EmbeddingProvider: strings.ToLower(env("EMBEDDING_PROVIDER", "hash")),
		EmbeddingBaseURL:  env("EMBEDDING_BASE_URL", ""),
		EmbeddingAPIKey:   env("EMBEDDING_API_KEY", ""),
		EmbeddingModel:    env("EMBEDDING_MODEL", ""),
		EmbeddingDim:      envInt("EMBEDDING_DIM", 1024),
		EmbeddingBatch:    envInt("EMBEDDING_BATCH", 32),

		VLMProvider: strings.ToLower(env("VLM_PROVIDER", "off")),
		VLMBaseURL:  env("VLM_BASE_URL", ""),
		VLMAPIKey:   env("VLM_API_KEY", ""),
		VLMModel:    env("VLM_MODEL", ""),

		RAGGRPCAddr:    env("RAG_GRPC_ADDR", "localhost:9001"),
		VisionGRPCAddr: env("VISION_GRPC_ADDR", "localhost:9002"),
		VisionTimeout:  envDur("VISION_TIMEOUT", 30*time.Second),
		VisionConc:     envInt("VISION_CONCURRENCY", 1),
		VisionBatch:    envInt("VISION_BATCH_SIZE", 8),
		VisionBatchMS:  envInt("VISION_BATCH_WAIT_MS", 25),

		RateLimitPerMin: envInt("RATE_LIMIT_PER_MIN", 300),
		QueueMaxDepth:   envInt("QUEUE_MAX_DEPTH", 10),
		Commit:          commit,
	}

	if err := c.validate(); err != nil {
		return nil, err
	}
	return c, nil
}

func (c *Config) IsProduction() bool { return c.AppEnv == "production" }

// MaxConnsOrDefault menjaga jumlah koneksi Postgres kecil (VPS 2 GB).
func (c *Config) MaxConnsOrDefault() int32 {
	if c.DBMaxConns <= 0 {
		return 10
	}
	if c.DBMaxConns > 30 {
		return 30
	}
	return c.DBMaxConns
}

func (c *Config) validate() error {
	switch c.Mode {
	case ModeAPI, ModeWorker, ModeAll:
	default:
		return fmt.Errorf("GATEWAY_MODE tidak valid: %q (api|worker|all)", c.Mode)
	}
	if c.DatabaseURL == "" {
		return fmt.Errorf("DATABASE_URL wajib diisi")
	}
	if c.EmbeddingDim <= 0 || c.EmbeddingDim > 4096 {
		return fmt.Errorf("EMBEDDING_DIM tidak masuk akal: %d", c.EmbeddingDim)
	}
	switch c.ObjectStoreDriver {
	case "local":
		if c.ObjectStoreRoot == "" {
			return fmt.Errorf("OBJECT_STORE_ROOT wajib diisi untuk driver local")
		}
	case "s3":
		return fmt.Errorf("driver s3 belum diimplementasikan (lihat docs/BACKLOG.md B-03)")
	default:
		return fmt.Errorf("OBJECT_STORE_DRIVER tidak dikenal: %q", c.ObjectStoreDriver)
	}
	if c.IsProduction() {
		if len(c.JWTSecret) < 32 {
			return fmt.Errorf("JWT_SECRET wajib ≥32 karakter di produksi")
		}
		if len(c.SessionSecret) < 32 {
			return fmt.Errorf("SESSION_SECRET wajib ≥32 karakter di produksi")
		}
		if !c.CookieSecure {
			return fmt.Errorf("COOKIE_SECURE wajib true di produksi")
		}
	} else {
		if c.JWTSecret == "" {
			c.JWTSecret = "dev-only-insecure-jwt-secret-change-me-0123456789abcdef"
		}
		if c.SessionSecret == "" {
			c.SessionSecret = "dev-only-insecure-session-secret-change-me-0123456789"
		}
	}
	if c.LLMProvider != "replay" && c.LLMPrimaryAPIKey == "" {
		return fmt.Errorf("LLM_PRIMARY_API_KEY wajib diisi bila LLM_PROVIDER=%s", c.LLMProvider)
	}
	if c.EmbeddingProvider != "hash" && c.EmbeddingAPIKey == "" {
		return fmt.Errorf("EMBEDDING_API_KEY wajib diisi bila EMBEDDING_PROVIDER=%s", c.EmbeddingProvider)
	}
	if c.VisionConc < 1 {
		c.VisionConc = 1
	}
	if c.DemoResetHours <= 0 {
		c.DemoResetHours = 24
	}
	return nil
}

func env(k, def string) string {
	if v, ok := os.LookupEnv(k); ok && strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	return def
}

func envInt(k string, def int) int {
	if v, ok := os.LookupEnv(k); ok && strings.TrimSpace(v) != "" {
		if n, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			return n
		}
	}
	return def
}

func envFloat(k string, def float64) float64 {
	if v, ok := os.LookupEnv(k); ok && strings.TrimSpace(v) != "" {
		if f, err := strconv.ParseFloat(strings.TrimSpace(v), 64); err == nil {
			return f
		}
	}
	return def
}

func envBool(k string, def bool) bool {
	if v, ok := os.LookupEnv(k); ok && strings.TrimSpace(v) != "" {
		if b, err := strconv.ParseBool(strings.TrimSpace(v)); err == nil {
			return b
		}
	}
	return def
}

func envDur(k string, def time.Duration) time.Duration {
	if v, ok := os.LookupEnv(k); ok && strings.TrimSpace(v) != "" {
		s := strings.TrimSpace(v)
		if d, err := time.ParseDuration(s); err == nil {
			return d
		}
		// dukung bentuk "24h" untuk jam
		if n, err := strconv.Atoi(s); err == nil {
			return time.Duration(n) * time.Hour
		}
	}
	return def
}
