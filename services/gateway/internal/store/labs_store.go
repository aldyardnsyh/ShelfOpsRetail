package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ---------------------------------------------------------------------------
// Lab observability: trace permintaan, evaluasi RAG, benchmark CV.
// ---------------------------------------------------------------------------

type TraceStep struct {
	Stage     string          `json:"stage"`
	SpanID    string          `json:"span_id"`
	Parent      *string        `json:"parent_span"`
	LatencyMS  int             `json:"latency_ms"`
	TokensIn   int             `json:"tokens_in"`
	TokensOut  int             `json:"tokens_out"`
	CostUSD    float64         `json:"cost_usd"`
	Model      *string         `json:"model"`
	Provider   *string         `json:"provider"`
	Status     string          `json:"status"`
	Meta       json.RawMessage `json:"meta"`
	StartedAt  time.Time       `json:"started_at"`
}

type TraceRow struct {
	ID         string      `json:"id"`           // request_id pertama
	RequestID  string      `json:"request_id"`
	Status     string      `json:"status"`
	CreatedAt  time.Time   `json:"created_at"`
	Query      string      `json:"query"`
	LatencyMS  int         `json:"latency_ms"`
	TokensIn   int         `json:"tokens_in"`
	TokensOut  int         `json:"tokens_out"`
	CostIDR    float64     `json:"cost_idr"`
	Model      string      `json:"model"`
	User       string      `json:"user"`
	Steps      []TraceStep `json:"steps"`
	Citations  json.RawMessage `json:"citations"`
}

type TraceDetail struct {
	RequestID string      `json:"request_id"`
	CreatedAt time.Time   `json:"created_at"`
	Query     string      `json:"query"`
	LatencyMS int         `json:"latency_ms"`
	Steps     []TraceStep `json:"steps"`
	Answer    string      `json:"answer"`
	Citations json.RawMessage `json:"citations"`
	Tools     json.RawMessage `json:"tools"`
}

// TraceSpan dipakai ulang dari observability_store.go (RecordTrace).
func (s *Store) ListTraces(ctx context.Context, ws uuid.UUID, limit int) ([]TraceRow, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	const q = `
	SELECT m.request_id, min(m.created_at), max(m.latency_ms), coalesce(max(m.model), ''),
	       coalesce(sum(m.tokens_in), 0)::int, coalesce(sum(m.tokens_out), 0)::int,
	       (SELECT coalesce(sum(cost_usd), 0)::float8 FROM llm_traces t WHERE t.request_id = m.request_id),
	       coalesce((SELECT max(content) FROM messages m2 WHERE m2.request_id = m.request_id AND m2.role = 'user'), ''),
	       coalesce((SELECT u.name FROM conversations c JOIN users u ON u.id = c.user_id
	        WHERE c.id = m.conversation_id), '')
	FROM messages m
	WHERE m.workspace_id = $1 AND m.request_id IS NOT NULL
	GROUP BY m.request_id, m.conversation_id
	ORDER BY min(m.created_at) DESC
	LIMIT $2`
	rows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, q, ws, limit)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	out := []TraceRow{}
	for rows.Next() {
		var t TraceRow
		var costUSD float64
		if err := rows.Scan(&t.RequestID, &t.CreatedAt, &t.LatencyMS, &t.Model,
			&t.TokensIn, &t.TokensOut, &costUSD, &t.Query, &t.User); err != nil {
			return nil, err
		}
		t.ID = t.RequestID
		t.Status = "ok"
		t.CostIDR = costUSD * 15500 // konversi kasar ke IDR untuk tampilan
		t.Steps = []TraceStep{}
		t.Citations = json.RawMessage("[]")
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) GetTraceDetail(ctx context.Context, ws uuid.UUID, requestID string) (*TraceDetail, error) {
	spans, c1, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT stage, coalesce(span_id, ''), parent_span, latency_ms, tokens_in, tokens_out,
		       cost_usd::float8, model, provider, status, meta, started_at
		FROM llm_traces
		WHERE workspace_id = $1 AND request_id = $2
		ORDER BY started_at`, ws, requestID)
	if err != nil {
		return nil, err
	}
	defer c1()
	d := &TraceDetail{
		RequestID: requestID,
		Steps:     []TraceStep{},
	}
	seen := false
	for spans.Next() {
		seen = true
		var st TraceStep
		var spanID string
		if err := spans.Scan(&st.Stage, &spanID, &st.Parent, &st.LatencyMS, &st.TokensIn, &st.TokensOut,
			&st.CostUSD, &st.Model, &st.Provider, &st.Status, &st.Meta, &st.StartedAt); err != nil {
			return nil, err
		}
		st.SpanID = spanID
		if st.Meta == nil {
			st.Meta = json.RawMessage("{}")
		}
		d.Steps = append(d.Steps, st)
	}
	if err := spans.Err(); err != nil {
		return nil, err
	}
	if !seen {
		return nil, ErrNotFound
	}

	msgRow, c2, err := s.QueryRowWorkspace(ctx, ws, uuid.Nil, `
		SELECT (SELECT coalesce(max(content), '') FROM messages WHERE request_id = $1 AND role = 'user'),
		       (SELECT coalesce(max(created_at), now()) FROM messages WHERE request_id = $1),
		       (SELECT coalesce(max(latency_ms), 0) FROM messages WHERE request_id = $1),
		       (SELECT coalesce(max(content), '') FROM messages WHERE request_id = $1 AND role = 'assistant')
		WHERE true`, requestID)
	if err != nil {
		return nil, err
	}
	defer c2()
	if err := msgRow.Scan(&d.Query, &d.CreatedAt, &d.LatencyMS, &d.Answer); err != nil {
		if err != pgx.ErrNoRows {
			return nil, err
		}
	}
	d.Citations = json.RawMessage("[]")
	d.Tools = json.RawMessage("[]")
	return d, nil
}

// ---------------------------------------------------------------------------
// Evals overview: dataset + run + label metric.
// ---------------------------------------------------------------------------

type EvalDatasetRow struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Region      string     `json:"region"`
	Cases       int        `json:"cases"`
	Version     string     `json:"version"`
	Status      string     `json:"status"`
	UpdatedAt   time.Time  `json:"updated_at"`
	Description string     `json:"description"`
}

type EvalRunDetailRow struct {
	ID        string          `json:"id"`
	Label     string          `json:"label"`
	Model     string          `json:"model"`
	Retrieval string          `json:"retrieval"`
	DatasetID string          `json:"dataset_id"`
	CreatedAt time.Time       `json:"created_at"`
	Metrics   json.RawMessage `json:"metrics"`
}

type EvalsOverview struct {
	Datasets     []EvalDatasetRow  `json:"datasets"`
	Runs         []EvalRunDetailRow `json:"runs"`
	MetricLabels map[string]string `json:"metric_labels"`
}

func (s *Store) EvalsOverviewAll(ctx context.Context, ws uuid.UUID) (*EvalsOverview, error) {
	out := &EvalsOverview{
		Datasets:     []EvalDatasetRow{},
		Runs:         []EvalRunDetailRow{},
		MetricLabels: map[string]string{
			"faithfulness":       "Kesetiaan Jawaban",
			"answer_relevance":   "Relevansi Jawaban",
			"context_precision":  "Presisi Konteks",
			"context_recall":     "Recall Konteks",
			"refusal_accuracy":   "Akurasi Menolak",
			"p95_latency_ms":     "P95 Latensi (ms)",
		},
	}

	dsRows, c1, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT d.id::text, d.name,
		       coalesce(d.description, ''),
		       (SELECT count(*)::int FROM eval_cases c WHERE c.dataset_id = d.id),
		       'v1',
		       'aktif',
		       d.updated_at
		FROM eval_datasets d
		WHERE d.workspace_id = $1
		ORDER BY d.created_at DESC`, ws)
	if err != nil {
		return nil, err
	}
	defer c1()
	for dsRows.Next() {
		var ds EvalDatasetRow
		if err := dsRows.Scan(&ds.ID, &ds.Name, &ds.Description, &ds.Cases, &ds.Version, &ds.Status, &ds.UpdatedAt); err != nil {
			return nil, err
		}
		out.Datasets = append(out.Datasets, ds)
	}
	if err := dsRows.Err(); err != nil {
		return nil, err
	}

	runRows, c2, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT r.id::text, coalesce(r.config_snapshot->>'label', 'Run ' || substr(r.id::text, 1, 6)),
		       coalesce(r.config_snapshot->>'model', 'glm-5-flash'),
		       coalesce(r.config_snapshot->>'retrieval', 'bm25+vector'),
		       r.dataset_id::text, r.created_at, r.metrics
		FROM eval_runs r
		WHERE r.workspace_id = $1 AND r.status = 'completed'
		ORDER BY r.created_at DESC
		LIMIT 10`, ws)
	if err != nil {
		return nil, err
	}
	defer c2()
	for runRows.Next() {
		var er EvalRunDetailRow
		if err := runRows.Scan(&er.ID, &er.Label, &er.Model, &er.Retrieval,
			&er.DatasetID, &er.CreatedAt, &er.Metrics); err != nil {
			return nil, err
		}
		if er.Metrics == nil {
			er.Metrics = json.RawMessage("{}")
		}
		out.Runs = append(out.Runs, er)
	}
	return out, runRows.Err()
}

// ---------------------------------------------------------------------------
// Benchmark CV
// ---------------------------------------------------------------------------

type BenchmarkMeta struct {
	Testbed  string    `json:"testbed"`
	TestedAt time.Time `json:"tested_at"`
	ImageSet string    `json:"image_set"`
	NoteKey  string    `json:"note_key"`
}

type BenchmarkAREntry struct {
	ID            string  `json:"id"`
	Platform      string  `json:"platform"`
	Runtime       string  `json:"runtime"`
	LatencyMsP50  float64 `json:"latency_ms_p50"`
	ThroughputIps float64 `json:"throughput_ips"`
	MemoryMb      float64 `json:"memory_mb"`
	Map50         float64 `json:"map50"`
	Note          string  `json:"note"`
}

type BenchmarksOverview struct {
	Meta BenchmarkMeta       `json:"meta"`
	Rows []BenchmarkAREntry  `json:"rows"`
}

func (s *Store) BenchmarksOverviewAll(ctx context.Context, ws uuid.UUID) (*BenchmarksOverview, error) {
	out := &BenchmarksOverview{
		Rows: []BenchmarkAREntry{},
	}
	out.Meta.Testbed = "jetson-orin-nano"
	out.Meta.TestedAt = time.Now()
	out.Meta.ImageSet = "ShelfOps CV bench v3 (1.240 gambar)"
	out.Meta.NoteKey = "benchmark_notes"

	rows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT id::text, model_variant, coalesce(nullif(hardware, ''), 'cloud'),
		       coalesce(p50_ms, 0)::float8, coalesce(throughput_ips, 0)::float8,
		       coalesce(memory_mb, 0)::float8, coalesce(map50, 0)::float8, notes
		FROM benchmark_runs
		WHERE (workspace_id = $1 OR committed)
		ORDER BY created_at DESC
		LIMIT 10`, ws)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	for rows.Next() {
		var r BenchmarkAREntry
		var variant string
		if err := rows.Scan(&r.ID, &variant, &r.Platform, &r.LatencyMsP50, &r.ThroughputIps,
			&r.MemoryMb, &r.Map50, &r.Note); err != nil {
			return nil, err
		}
		r.Runtime = variant
		out.Rows = append(out.Rows, r)
	}
	return out, rows.Err()
}
