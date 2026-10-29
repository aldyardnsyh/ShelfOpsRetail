package httpx

import (
	"strings"
	"testing"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/config"
)

// TestMockModesListsEveryMockProvider memastikan /readyz tidak pernah
// concealing provider tiruan: semua mode tiruan wajib muncul di daftar mocks.
func TestMockModesListsEveryMockProvider(t *testing.T) {
	cfg := &config.Config{
		LLMProvider:       config.ProviderReplay,
		EmbeddingProvider: config.ProviderHash,
		VLMProvider:       config.ProviderOff,
		VisionDetector:    config.ProviderReplay,
		VisionOCREngine:   config.ProviderStub,
	}
	srv := &Server{Cfg: cfg}

	modes, mocks := srv.mockModes()
	if modes.LLM != "replay" || modes.Embedding != "hash" || modes.VLM != "off" {
		t.Fatalf("mode provider tidak sesuai: %+v", modes)
	}
	if modes.Detector != "replay" || modes.OCR != "stub" {
		t.Fatalf("mode vision tidak sesuai: %+v", modes)
	}
	if len(mocks) != 5 {
		t.Fatalf("harus ada 5 entri mocks, got %d: %v", len(mocks), mocks)
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
			t.Errorf("mocks harus memuat %q, got %v", want, mocks)
		}
	}
}

// TestMockModesEmptyWhenProvidersAreReal memastikan klaim produksi tidak
// menandai provider nyata sebagai tiruan.
func TestMockModesEmptyWhenProvidersAreReal(t *testing.T) {
	cfg := &config.Config{
		LLMProvider:       "openai-compatible",
		EmbeddingProvider: "openai-compatible",
		VLMProvider:       "openai-compatible",
		VisionDetector:    config.ProviderONNX,
		VisionOCREngine:   config.ProviderRapidOCR,
	}
	srv := &Server{Cfg: cfg}

	modes, mocks := srv.mockModes()
	if len(mocks) != 0 {
		t.Fatalf("tidak boleh ada mocks saat semua provider nyata: %v", mocks)
	}
	if modes.LLM != "openai-compatible" || modes.OCR != config.ProviderRapidOCR {
		t.Fatalf("mode provider tidak sesuai: %+v", modes)
	}
}
