package httpx

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/problem"
)

func chiURLParam(r *http.Request, name string) string {
	return chi.URLParam(r, name)
}

func jsonMarshalIndent(v any) ([]byte, error) { return json.Marshal(v) }

type providerModes struct {
	LLM       string `json:"llm"`
	Embedding string `json:"embedding"`
	VLM       string `json:"vlm"`
}

type healthResponse struct {
	Status      string        `json:"status"`
	Version     string        `json:"version"`
	Commit      string        `json:"commit"`
	UptimeS     int64         `json:"uptime_s"`
	DB          string        `json:"db"`
	QueueDepth  int           `json:"queue_depth"`
	Degradation string        `json:"degradation"`
	Providers   providerModes `json:"providers,omitempty"`
	Mocks       []string      `json:"mocks,omitempty"`
	Time        string        `json:"time"`
}

// mockModes menyebut provider yang masih berjalan sebagai tiruan. Deployment
// yang sehat secara teknis tetap bisa memakai mode ini, tetapi tidak boleh
// diklaim sebagai AI nyata: /readyz menampilkannya supaya operator melihat
// kebenaran tanpa membaca env satu per satu.
func (s *Server) mockModes() (providerModes, []string) {
	modes := providerModes{
		LLM:       s.Cfg.LLMProvider,
		Embedding: s.Cfg.EmbeddingProvider,
		VLM:       s.Cfg.VLMProvider,
	}
	var mocks []string
	if modes.LLM == "replay" {
		mocks = append(mocks, "llm=replay (jawaban contoh, bukan model)")
	}
	if modes.Embedding == "hash" {
		mocks = append(mocks, "embedding=hash (leksikal, bukan semantik)")
	}
	if modes.VLM == "off" {
		mocks = append(mocks, "vlm=off (OCR label harga tidak aktif)")
	}
	return modes, mocks
}

var startedAt = time.Now()

// handleHealth adalah liveness probe: tidak menyentuh DB (dipakai web untuk
// deteksi L3 dan uptime monitor eksternal).
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, healthResponse{
		Status:  "ok",
		Version: version(),
		Commit:  s.Cfg.Commit,
		UptimeS: int64(time.Since(startedAt).Seconds()),
		DB:      "skipped",
		Time:    time.Now().UTC().Format(time.RFC3339),
	})
}

// handleReady memeriksa DB + queue; gagal → 503 problem+json.
func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	dbState := "ok"
	depth := 0
	if err := s.Store.Ping(r.Context()); err != nil {
		dbState = "down"
	} else if d, err := s.Store.QueueDepth(r.Context()); err == nil {
		depth = d
	}
	if dbState != "ok" {
		problem.ServiceUnavailable("Database tidak dapat dijangkau.", traceID).Write(w)
		return
	}
	deg := "L0"
	if depth > s.Cfg.QueueMaxDepth {
		deg = "L2"
	}
	modes, mocks := s.mockModes()
	writeJSON(w, http.StatusOK, healthResponse{
		Status:      "ok",
		Version:     version(),
		Commit:      s.Cfg.Commit,
		UptimeS:     int64(time.Since(startedAt).Seconds()),
		DB:          dbState,
		QueueDepth:  depth,
		Degradation: deg,
		Providers:   modes,
		Mocks:       mocks,
		Time:        time.Now().UTC().Format(time.RFC3339),
	})
}

const appVersion = "0.1.0"

func version() string { return appVersion }
