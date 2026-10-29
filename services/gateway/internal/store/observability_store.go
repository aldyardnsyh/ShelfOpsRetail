package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type ProviderUsage struct {
	Name      string  `json:"name"`
	Requests  int     `json:"requests"`
	Errors429 int     `json:"errors_429"`
	CostUSD   float64 `json:"cost_usd"`
	State     string  `json:"state"`
	Failures  int     `json:"failures"`
	LastError *string `json:"last_error"`
}

type QuotaSnapshot struct {
	Day           string          `json:"day"`
	RequestsToday int             `json:"requests_today"`
	CostUSDToday  float64         `json:"cost_usd_today"`
	BudgetUSDDay  *float64        `json:"budget_usd_day"`
	ReplayMode    bool            `json:"replay_mode"`
	Providers     []ProviderUsage `json:"providers"`
	LimitPerHour  int             `json:"limit_per_hour"`
}

// QuotaSnapshot membaca pemakaian AI hari ini (PRD §9.2, BR-09).
func (s *Store) QuotaSnapshot(ctx context.Context, ws uuid.UUID) (*QuotaSnapshot, error) {
	out := &QuotaSnapshot{Day: time.Now().Format("2006-01-02"), Providers: []ProviderUsage{}}
	if err := s.WithWorkspace(ctx, ws, uuid.Nil, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT provider, requests, errors_429, cost_usd::float8
			FROM ai_usage_daily WHERE workspace_id = $1 AND day = current_date
			ORDER BY provider`, ws.String())
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var p ProviderUsage
			if err := rows.Scan(&p.Name, &p.Requests, &p.Errors429, &p.CostUSD); err != nil {
				return err
			}
			p.State = "closed"
			out.Providers = append(out.Providers, p)
			out.RequestsToday += p.Requests
			out.CostUSDToday += p.CostUSD
		}
		return rows.Err()
	}); err != nil {
		return nil, err
	}
	if err := s.WithTx(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT cap_usd::float8, replay_mode FROM ai_budget WHERE day = current_date`).
			Scan(&out.BudgetUSDDay, &out.ReplayMode)
	}); err != nil && err != pgx.ErrNoRows {
		return nil, err
	}
	return out, nil
}

// RecordAIUsage menambah hitungan pemakaian (dipanggil pipeline chat, E3).
func (s *Store) RecordAIUsage(ctx context.Context, ws uuid.UUID, provider string, requests, errors429 int, tokensIn, tokensOut int64, costUSD float64) error {
	return s.WithWorkspace(ctx, ws, uuid.Nil, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			INSERT INTO ai_usage_daily (workspace_id, day, provider, requests, errors_429, tokens_in, tokens_out, cost_usd)
			VALUES ($1, current_date, $2, $3, $4, $5, $6, $7)
			ON CONFLICT (workspace_id, day, provider) DO UPDATE
			SET requests = ai_usage_daily.requests + EXCLUDED.requests,
			    errors_429 = ai_usage_daily.errors_429 + EXCLUDED.errors_429,
			    tokens_in = ai_usage_daily.tokens_in + EXCLUDED.tokens_in,
			    tokens_out = ai_usage_daily.tokens_out + EXCLUDED.tokens_out,
			    cost_usd = ai_usage_daily.cost_usd + EXCLUDED.cost_usd`,
			ws.String(), provider, requests, errors429, tokensIn, tokensOut, costUSD); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO ai_budget (day, requests, cost_usd)
			VALUES (current_date, $1, $2)
			ON CONFLICT (day) DO UPDATE
			SET requests = ai_budget.requests + EXCLUDED.requests,
			    cost_usd = ai_budget.cost_usd + EXCLUDED.cost_usd,
			    updated_at = now()`, requests, costUSD)
		return err
	})
}

// TraceRingkas + RecordTrace dipakai pipeline chat (E3/E9).
type TraceSpan struct {
	RequestID string
	Stage     string
	InputHash string
	LatencyMS int
	TokensIn  int
	TokensOut int
	CostUSD   float64
	Model     string
	Provider  string
	Status    string
	Meta      map[string]any
}

func (s *Store) RecordTrace(ctx context.Context, ws uuid.UUID, span TraceSpan) error {
	if span.Status == "" {
		span.Status = "ok"
	}
	if span.Meta == nil {
		span.Meta = map[string]any{}
	}
	return s.WithWorkspace(ctx, ws, uuid.Nil, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			INSERT INTO llm_traces (workspace_id, request_id, stage, input_hash, latency_ms, tokens_in, tokens_out, cost_usd, model, provider, status, meta)
			VALUES ($1,$2,$3,nullif($4,''),$5,$6,$7,$8,nullif($9,''),nullif($10,''),$11,$12)`,
			ws.String(), span.RequestID, span.Stage, span.InputHash, span.LatencyMS,
			span.TokensIn, span.TokensOut, span.CostUSD, span.Model, span.Provider, span.Status, span.Meta)
		return err
	})
}
