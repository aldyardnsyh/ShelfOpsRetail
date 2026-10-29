// Package config mendefinisikan mode provider AI dan guard produksi.
//
// G5 "AI nyata + kejujuran": provider tiruan (replay/hash/stub/off) tetap boleh
// dipakai untuk dev/CI/demo, tetapi deployment produksi tidak boleh boot
// dengan provider tiruan kecuali operator menandainya secara eksplisit lewat
// ALLOW_MOCK_PROVIDERS=true.
package config

import (
	"fmt"
	"strings"
)

// Mode provider AI yang dipilih lewat environment.
const (
	// ProviderReplay adalah LLM tiruan: jawaban diambil dari cassette.
	ProviderReplay = "replay"
	// ProviderHash adalah embedding leksikal berbasis hash token.
	ProviderHash = "hash"
	// ProviderStub adalah OCR tiruan: harga label dikarang.
	ProviderStub = "stub"
	// ProviderOff berarti provider tidak diaktifkan sama sekali.
	ProviderOff = "off"
	// ProviderOpenAICompatible adalah endpoint chat/completions & embeddings.
	ProviderOpenAICompatible = "openai-compatible"
	// ProviderONNX adalah detektor YOLO yang diekspor ke ONNX.
	ProviderONNX = "onnx"
	// ProviderRapidOCR adalah OCR lokal (RapidOCR / PaddleOCR).
	ProviderRapidOCR = "rapidocr"
	// ProviderCloud adalah OCR lewat VLM openai-compatible.
	ProviderCloud = "cloud"
	// ProviderPaddle adalah OCR lokal PaddleOCR (belum diimplementasikan di
	// ai-vision; gagal keras, bukan diam-diam tiruan).
	ProviderPaddle = "paddle"
)

// NormalizeProvider menyamakan ejaan env menjadi satu bentuk kanonik:
// "openai_compatible", "openai-compatible", dan "OpenAI Compatible" menjadi
// "openai-compatible". Env di .env.example ditulis "openai_compatible" (snake
// case) sedangkan dokumentasi memakai "openai-compatible"; keduanya diterima.
func NormalizeProvider(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	normalized = strings.ReplaceAll(normalized, "_", "-")
	normalized = strings.ReplaceAll(normalized, " ", "-")
	return normalized
}

// ProviderModes memuat mode provider yang sedang aktif. Dipakai /readyz
// supaya operator melihat kebenaran tanpa membaca env satu per satu.
type ProviderModes struct {
	LLM       string `json:"llm"`
	Embedding string `json:"embedding"`
	VLM       string `json:"vlm"`
	Detector  string `json:"detector"`
	OCR       string `json:"ocr"`
}

// providerStatus merangkum status satu provider beserta env yang harus diisi
// agar provider tersebut benar-benar nyata.
type providerStatus struct {
	// Key adalah nama internal provider (dipakai di log).
	Key string
	// EnvVar adalah env yang memilih mode provider.
	EnvVar string
	// Value adalah mode yang aktif sekarang.
	Value string
	// Mock true bila mode aktif masih tiruan.
	Mock bool
	// Note menjelaskan apa arti mode tiruan tersebut.
	Note string
	// Hint menjelaskan env yang harus diisi agar mode menjadi nyata.
	Hint string
}

// providerStatuses mengembalikan status semua provider yangKnown oleh gateway.
//
//nolint:funlen // tabel status provider memang panjang dan mudah dibaca apa adanya.
func (c *Config) providerStatuses() []providerStatus {
	modes := c.ProviderModes()
	return []providerStatus{
		{
			Key:    "llm",
			EnvVar: "LLM_PROVIDER",
			Value:  modes.LLM,
			Mock:   modes.LLM == ProviderReplay,
			Note:   "jawaban contoh, bukan model",
			Hint: "LLM_PROVIDER=" + ProviderOpenAICompatible +
				" + LLM_PRIMARY_BASE_URL/LLM_PRIMARY_API_KEY/LLM_PRIMARY_MODEL",
		},
		{
			Key:    "embedding",
			EnvVar: "EMBEDDING_PROVIDER",
			Value:  modes.Embedding,
			Mock:   modes.Embedding == ProviderHash,
			Note:   "leksikal, bukan semantik",
			Hint: "EMBEDDING_PROVIDER=" + ProviderOpenAICompatible +
				" + EMBEDDING_BASE_URL/EMBEDDING_API_KEY/EMBEDDING_MODEL/EMBEDDING_DIM",
		},
		{
			Key:    "vlm",
			EnvVar: "VLM_PROVIDER",
			Value:  modes.VLM,
			Mock:   modes.VLM == ProviderOff,
			Note:   "baca label/foto tidak aktif",
			Hint: "VLM_PROVIDER=" + ProviderOpenAICompatible +
				" + VLM_BASE_URL/VLM_API_KEY/VLM_MODEL",
		},
		{
			Key:    "detector",
			EnvVar: "VISION_DETECTOR",
			Value:  modes.Detector,
			Mock:   modes.Detector == ProviderReplay,
			Note:   "bounding box contoh, bukan model",
			Hint: "VISION_DETECTOR=" + ProviderONNX +
				" + file .onnx di volume MODEL_DIR (MODEL_PATH opsional)",
		},
		{
			Key:    "ocr",
			EnvVar: "VISION_OCR_ENGINE",
			Value:  modes.OCR,
			Mock:   modes.OCR == ProviderStub,
			Note:   "harga label dikarang dari hash gambar",
			Hint: "VISION_OCR_ENGINE=" + ProviderRapidOCR + " (lokal) atau " + ProviderCloud +
				" (+ VLM_BASE_URL/VLM_API_KEY/VLM_MODEL)",
		},
	}
}

// ProviderModes mengembalikan mode provider yang aktif (sudah dinormalisasi).
func (c *Config) ProviderModes() ProviderModes {
	return ProviderModes{
		LLM:       NormalizeProvider(c.LLMProvider),
		Embedding: NormalizeProvider(c.EmbeddingProvider),
		VLM:       NormalizeProvider(c.VLMProvider),
		Detector:  NormalizeProvider(c.VisionDetector),
		OCR:       NormalizeProvider(c.VisionOCREngine),
	}
}

// MockProviders mengembalikan daftar provider yang masih tiruan. Dipakai
// /readyz: tidak boleh ada provider tiruan yang lolos dari daftar.
func (c *Config) MockProviders() []string {
	var mocks []string
	for _, status := range c.providerStatuses() {
		if !status.Mock {
			continue
		}
		mocks = append(mocks, fmt.Sprintf("%s=%s (%s)", status.Key, status.Value, status.Note))
	}
	return mocks
}

// MockProviderCount menghitung berapa provider yang masih tiruan.
func (c *Config) MockProviderCount() int {
	count := 0
	for _, status := range c.providerStatuses() {
		if status.Mock {
			count++
		}
	}
	return count
}

// ValidateProviderReadiness menolak boot produksi ketika provider masih
// tiruan. Guard ini sengaja ada di package config (bukan hanya di handler)
// supaya bisa diuji tanpa database dan dipakai oleh semua entry point.
//
// Bool AllowMockProviders (env ALLOW_MOCK_PROVIDERS) adalah escape hatch
// eksplisit untuk staging/demo: operator yang benar-benar mau tiruan harus
// menyatakannya, bukanDiam-diam lolos karena lupa mengisi env.
func (c *Config) ValidateProviderReadiness() error {
	if !c.IsProduction() {
		return nil
	}
	if c.AllowMockProviders {
		return nil
	}

	var violations []string
	for _, status := range c.providerStatuses() {
		if !status.Mock {
			continue
		}
		violations = append(
			violations,
			fmt.Sprintf("  - %s=%s (%s)\n      isi: %s", status.EnvVar, status.Value, status.Note, status.Hint),
		)
	}
	if len(violations) == 0 {
		return nil
	}

	return fmt.Errorf(
		"APP_ENV=production: %d provider AI masih tiruan, boot ditolak.\n%s\n"+
			"Bila deployment ini memang sengaja memakai provider tiruan (staging/demo), "+
			"set ALLOW_MOCK_PROVIDERS=true secara eksplisit.",
		len(violations),
		strings.Join(violations, "\n"),
	)
}

// validateProviderModes menolak nilai provider yang tidak dikenal dan
// memastikan env wajib untuk mode nyata terisi (error jujur, bukan diam-diam
// memakai tiruan).
func (c *Config) validateProviderModes() error {
	modes := c.ProviderModes()

	switch modes.LLM {
	case ProviderReplay:
	case ProviderOpenAICompatible:
		if err := requireEnv("LLM_PRIMARY_BASE_URL", c.LLMPrimaryBaseURL); err != nil {
			return err
		}
		if err := requireEnv("LLM_PRIMARY_API_KEY", c.LLMPrimaryAPIKey); err != nil {
			return err
		}
		if err := requireEnv("LLM_PRIMARY_MODEL", c.LLMPrimaryModel); err != nil {
			return err
		}
	default:
		return fmt.Errorf(
			"LLM_PROVIDER tidak dikenal: %q (replay|%s)",
			c.LLMProvider, ProviderOpenAICompatible,
		)
	}

	switch modes.Embedding {
	case ProviderHash:
	case ProviderOpenAICompatible:
		if err := requireEnv("EMBEDDING_BASE_URL", c.EmbeddingBaseURL); err != nil {
			return err
		}
		if err := requireEnv("EMBEDDING_API_KEY", c.EmbeddingAPIKey); err != nil {
			return err
		}
		if err := requireEnv("EMBEDDING_MODEL", c.EmbeddingModel); err != nil {
			return err
		}
	default:
		return fmt.Errorf(
			"EMBEDDING_PROVIDER tidak dikenal: %q (hash|%s)",
			c.EmbeddingProvider, ProviderOpenAICompatible,
		)
	}

	switch modes.VLM {
	case ProviderOff:
	case ProviderOpenAICompatible:
		if err := requireEnv("VLM_BASE_URL", c.VLMBaseURL); err != nil {
			return err
		}
		if err := requireEnv("VLM_API_KEY", c.VLMAPIKey); err != nil {
			return err
		}
		if err := requireEnv("VLM_MODEL", c.VLMModel); err != nil {
			return err
		}
	default:
		return fmt.Errorf(
			"VLM_PROVIDER tidak dikenal: %q (off|%s)",
			c.VLMProvider, ProviderOpenAICompatible,
		)
	}

	switch modes.Detector {
	case ProviderReplay, ProviderONNX:
	default:
		return fmt.Errorf(
			"VISION_DETECTOR tidak dikenal: %q (replay|%s)",
			c.VisionDetector, ProviderONNX,
		)
	}

	switch modes.OCR {
	case ProviderStub, ProviderRapidOCR, ProviderCloud, ProviderPaddle:
	default:
		return fmt.Errorf(
			"VISION_OCR_ENGINE tidak dikenal: %q (stub|%s|%s)",
			c.VisionOCREngine, ProviderRapidOCR, ProviderCloud,
		)
	}

	return nil
}

func requireEnv(name, value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s wajib diisi", name)
	}
	return nil
}
