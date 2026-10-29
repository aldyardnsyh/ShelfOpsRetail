package config

import (
	"strings"
	"testing"
)

// realProviders mengembalikan config dengan semua provider nyata.
func realProviders() *Config {
	return &Config{
		AppEnv:             "production",
		LLMProvider:        ProviderOpenAICompatible,
		LLMPrimaryBaseURL:  "https://llm.example.com/v1",
		LLMPrimaryAPIKey:   "test-key",
		LLMPrimaryModel:    "test-model",
		EmbeddingProvider:  ProviderOpenAICompatible,
		EmbeddingBaseURL:   "https://embed.example.com/v1",
		EmbeddingAPIKey:    "test-key",
		EmbeddingModel:     "test-embed",
		VLMProvider:        ProviderOpenAICompatible,
		VLMBaseURL:         "https://vlm.example.com/v1",
		VLMAPIKey:          "test-key",
		VLMModel:           "test-vlm",
		VisionDetector:     ProviderONNX,
		VisionOCREngine:    ProviderRapidOCR,
		AllowMockProviders: false,
	}
}

// mockProviders mengembalikan config dengan semua provider tiruan.
func mockProviders() *Config {
	return &Config{
		AppEnv:            "production",
		LLMProvider:       ProviderReplay,
		EmbeddingProvider: ProviderHash,
		VLMProvider:       ProviderOff,
		VisionDetector:    ProviderReplay,
		VisionOCREngine:   ProviderStub,
	}
}

func TestValidateProviderReadinessBlocksProductionWithMockProviders(t *testing.T) {
	cfg := mockProviders()

	err := cfg.ValidateProviderReadiness()
	if err == nil {
		t.Fatal("harus menolak boot produksi saat provider masih tiruan")
	}
	msg := err.Error()

	for _, want := range []string{
		"APP_ENV=production",
		"LLM_PROVIDER=replay",
		"EMBEDDING_PROVIDER=hash",
		"VLM_PROVIDER=off",
		"VISION_DETECTOR=replay",
		"VISION_OCR_ENGINE=stub",
		"ALLOW_MOCK_PROVIDERS=true",
		"LLM_PRIMARY_BASE_URL",
		"LLM_PRIMARY_API_KEY",
		"LLM_PRIMARY_MODEL",
		"EMBEDDING_BASE_URL",
		"EMBEDDING_API_KEY",
		"EMBEDDING_MODEL",
		"VLM_BASE_URL",
		"VLM_API_KEY",
		"VLM_MODEL",
		"MODEL_DIR",
	} {
		if !strings.Contains(msg, want) {
			t.Errorf("pesan guard harus menyebut %q\npesan: %s", want, msg)
		}
	}
}

func TestValidateProviderReadinessAllowsRealProviders(t *testing.T) {
	cfg := realProviders()
	if err := cfg.ValidateProviderReadiness(); err != nil {
		t.Fatalf("provider nyata harus lolos: %v", err)
	}
}

func TestValidateProviderReadinessAllowsExplicitAllowMockProviders(t *testing.T) {
	cfg := mockProviders()
	cfg.AllowMockProviders = true
	if err := cfg.ValidateProviderReadiness(); err != nil {
		t.Fatalf("ALLOW_MOCK_PROVIDERS=true harus meloloskan boot: %v", err)
	}
}

func TestValidateProviderReadinessIgnoresNonProduction(t *testing.T) {
	cfg := mockProviders()
	cfg.AppEnv = "development"
	if err := cfg.ValidateProviderReadiness(); err != nil {
		t.Fatalf("guard hanya berlaku untuk produksi: %v", err)
	}
	cfg.AppEnv = "test"
	if err := cfg.ValidateProviderReadiness(); err != nil {
		t.Fatalf("guard hanya berlaku untuk produksi: %v", err)
	}
}

func TestMockProvidersListsEveryMockProvider(t *testing.T) {
	cfg := mockProviders()
	mocks := cfg.MockProviders()
	if len(mocks) != 5 {
		t.Fatalf("harus ada 5 provider tiruan, got %d: %v", len(mocks), mocks)
	}
	joined := strings.Join(mocks, "|")
	for _, want := range []string{
		"llm=replay",
		"embedding=hash",
		"vlm=off",
		"detector=replay",
		"ocr=stub",
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("daftar mocks harus memuat %q, got %v", want, mocks)
		}
	}
	if cfg.MockProviderCount() != 5 {
		t.Errorf("MockProviderCount harus 5, got %d", cfg.MockProviderCount())
	}
}

func TestMockProvidersEmptyWhenAllProvidersReal(t *testing.T) {
	cfg := realProviders()
	if mocks := cfg.MockProviders(); len(mocks) != 0 {
		t.Fatalf("tidak boleh ada mocks saat semua provider nyata: %v", mocks)
	}
}

func TestProviderModesNormalized(t *testing.T) {
	cfg := &Config{
		LLMProvider:       "openai_compatible",
		EmbeddingProvider: "OPENAI-COMPATIBLE",
		VLMProvider:       "off",
		VisionDetector:    "onnx",
		VisionOCREngine:   "RapidOCR",
	}
	modes := cfg.ProviderModes()
	if modes.LLM != ProviderOpenAICompatible {
		t.Errorf("LLM harus ternormalisasi, got %q", modes.LLM)
	}
	if modes.Embedding != ProviderOpenAICompatible {
		t.Errorf("embedding harus ternormalisasi, got %q", modes.Embedding)
	}
	if modes.OCR != ProviderRapidOCR {
		t.Errorf("ocr harus ternormalisasi, got %q", modes.OCR)
	}
}

func TestValidateProviderModesRejectsUnknownProvider(t *testing.T) {
	cfg := realProviders()
	cfg.LLMProvider = "magic"
	if err := cfg.validateProviderModes(); err == nil {
		t.Fatal("provider LLM tak dikenal harus ditolak")
	}

	cfg = realProviders()
	cfg.VisionDetector = "tensorrt"
	if err := cfg.validateProviderModes(); err == nil {
		t.Fatal("detektor tak dikenal harus ditolak")
	}
}

func TestValidateProviderModesRequiresCredentialsForRealProviders(t *testing.T) {
	cfg := realProviders()
	cfg.LLMPrimaryAPIKey = ""
	if err := cfg.validateProviderModes(); err == nil ||
		!strings.Contains(err.Error(), "LLM_PRIMARY_API_KEY") {
		t.Fatalf("API key LLM kosong harus error jujur, got %v", err)
	}

	cfg = realProviders()
	cfg.EmbeddingBaseURL = ""
	if err := cfg.validateProviderModes(); err == nil ||
		!strings.Contains(err.Error(), "EMBEDDING_BASE_URL") {
		t.Fatalf("base URL embedding kosong harus error jujur, got %v", err)
	}

	cfg = realProviders()
	cfg.VLMModel = ""
	if err := cfg.validateProviderModes(); err == nil ||
		!strings.Contains(err.Error(), "VLM_MODEL") {
		t.Fatalf("model VLM kosong harus error jujur, got %v", err)
	}
}

func TestLoadForServeEnforcesProviderGuard(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/db")
	t.Setenv("JWT_SECRET", strings.Repeat("j", 40))
	t.Setenv("SESSION_SECRET", strings.Repeat("s", 40))
	t.Setenv("COOKIE_SECURE", "true")
	t.Setenv("LLM_PROVIDER", "replay")
	t.Setenv("EMBEDDING_PROVIDER", "hash")
	t.Setenv("VLM_PROVIDER", "off")
	t.Setenv("VISION_DETECTOR", "replay")
	t.Setenv("VISION_OCR_ENGINE", "stub")
	t.Setenv("ALLOW_MOCK_PROVIDERS", "false")

	if _, err := LoadForServe("test"); err == nil {
		t.Fatal("LoadForServe harus menolak boot produksi dengan provider tiruan")
	} else if !strings.Contains(err.Error(), "ALLOW_MOCK_PROVIDERS=true") {
		t.Errorf("pesan harus menyebut ALLOW_MOCK_PROVIDERS, got %v", err)
	}

	// Perintah operasional tetap boleh jalan (persiapan database).
	if _, err := Load("test"); err != nil {
		t.Fatalf("Load (operasional) tidak boleh diblokir guard provider: %v", err)
	}
}

func TestLoadForServeAllowsMockProvidersWhenExplicitlyAllowed(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/db")
	t.Setenv("JWT_SECRET", strings.Repeat("j", 40))
	t.Setenv("SESSION_SECRET", strings.Repeat("s", 40))
	t.Setenv("COOKIE_SECURE", "true")
	t.Setenv("LLM_PROVIDER", "replay")
	t.Setenv("EMBEDDING_PROVIDER", "hash")
	t.Setenv("VLM_PROVIDER", "off")
	t.Setenv("VISION_DETECTOR", "replay")
	t.Setenv("VISION_OCR_ENGINE", "stub")
	t.Setenv("ALLOW_MOCK_PROVIDERS", "true")

	if _, err := LoadForServe("test"); err != nil {
		t.Fatalf("ALLOW_MOCK_PROVIDERS=true harus meloloskan boot: %v", err)
	}
}
