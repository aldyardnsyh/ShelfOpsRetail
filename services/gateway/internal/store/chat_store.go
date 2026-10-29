package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type ChatSession struct {
	ID           string    `json:"id"`
	Title        string    `json:"title"`
	MessageCount int       `json:"message_count"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type ChatCitation struct {
	Ordinal       int     `json:"ordinal"`
	DocumentID    *string `json:"document_id"`
	DocumentTitle string  `json:"document_title"`
	ChunkID       *string `json:"chunk_id"`
	Page          *int    `json:"page"`
	HeadingPath   string  `json:"heading_path"`
	Score         float64 `json:"score"`
	Snippet       string  `json:"snippet"`
}

type ChatMessage struct {
	ID        string         `json:"id"`
	Role      string         `json:"role"`
	Content   string         `json:"content"`
	Status    string         `json:"status"`
	Model     *string        `json:"model"`
	TokensIn  int            `json:"tokens_in"`
	TokensOut int            `json:"tokens_out"`
	CostUSD   float64        `json:"cost_usd"`
	LatencyMS int            `json:"latency_ms"`
	Refused   bool           `json:"refused"`
	Replay    bool           `json:"replay"`
	Citations []ChatCitation `json:"citations"`
	ToolCalls []ChatToolCall `json:"tool_calls"`
	CreatedAt time.Time      `json:"created_at"`
}

// ChatToolCall dipakai detail percakapan (alur agent tool).
type ChatToolCall struct {
	ID                   string          `json:"id"`
	Name                 string          `json:"name"`
	Args                 json.RawMessage `json:"args"`
	ResultSummary        *string         `json:"result_summary"`
	Status               string          `json:"status"`
	RequiresConfirmation bool            `json:"requires_confirmation"`
	DurationMS           int             `json:"duration_ms"`
	CreatedAt            time.Time       `json:"created_at"`
}

// ChatSessionDetail dipakai endpoint composite GET /conversations/{id}.
type ChatSessionDetail struct {
	ID           string        `json:"id"`
	Title        string        `json:"title"`
	MessageCount int           `json:"message_count"`
	CreatedAt    time.Time     `json:"created_at"`
	UpdatedAt    time.Time     `json:"updated_at"`
	Messages     []ChatMessage `json:"messages"`
}

func (s *Store) CreateChatSession(ctx context.Context, ws, user uuid.UUID, title string) (*ChatSession, error) {
	if title == "" {
		title = "Percakapan baru"
	}
	var out ChatSession
	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			INSERT INTO conversations (id, workspace_id, user_id, title)
			VALUES ($1,$2,$3,$4)
			RETURNING id::text, title, created_at, updated_at`,
			NewV7(), ws.String(), user.String(), title).
			Scan(&out.ID, &out.Title, &out.CreatedAt, &out.UpdatedAt)
	})
	if err != nil {
		return nil, fmt.Errorf("create chat session: %w", err)
	}
	return &out, nil
}

func (s *Store) ListChatSessions(ctx context.Context, ws uuid.UUID, limit, offset int) ([]ChatSession, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	const q = `
	SELECT c.id::text, c.title,
	       (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id) AS message_count,
	       c.created_at, c.updated_at
	FROM conversations c
	WHERE c.workspace_id = $1 AND c.deleted_at IS NULL
	ORDER BY c.updated_at DESC, c.id DESC
	LIMIT $2 OFFSET $3`
	rows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, q, ws.String(), limit, offset)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	out := []ChatSession{}
	for rows.Next() {
		var c ChatSession
		if err := rows.Scan(&c.ID, &c.Title, &c.MessageCount, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan chat session: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) GetChatSession(ctx context.Context, ws uuid.UUID, sessionID string) (*ChatSession, error) {
	const q = `
	SELECT c.id::text, c.title,
	       (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id) AS message_count,
	       c.created_at, c.updated_at
	FROM conversations c
	WHERE c.id = $1 AND c.workspace_id = $2 AND c.deleted_at IS NULL`
	var c ChatSession
	row, cleanup, err := s.QueryRowWorkspace(ctx, ws, uuid.Nil, q, sessionID, ws.String())
	if err != nil {
		return nil, err
	}
	defer cleanup()
	if err := row.Scan(&c.ID, &c.Title, &c.MessageCount, &c.CreatedAt, &c.UpdatedAt); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get chat session: %w", err)
	}
	return &c, nil
}

// ListChatMessages mengembalikan pesan terbaru lebih dulu + sitasinya.
func (s *Store) ListChatMessages(ctx context.Context, ws uuid.UUID, sessionID string, limit, offset int) ([]ChatMessage, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	out := []ChatMessage{}
	err := s.WithWorkspace(ctx, ws, uuid.Nil, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT id::text, role, content, status, model, tokens_in, tokens_out,
			       cost_usd::float8, latency_ms, refused, replay, created_at
			FROM messages
			WHERE workspace_id = $1 AND conversation_id = $2
			ORDER BY created_at DESC, id DESC
			LIMIT $3 OFFSET $4`, ws.String(), sessionID, limit, offset)
		if err != nil {
			return fmt.Errorf("list messages: %w", err)
		}
		ids := []uuid.UUID{}
		for rows.Next() {
			var m ChatMessage
			if err := rows.Scan(&m.ID, &m.Role, &m.Content, &m.Status, &m.Model, &m.TokensIn,
				&m.TokensOut, &m.CostUSD, &m.LatencyMS, &m.Refused, &m.Replay, &m.CreatedAt); err != nil {
				rows.Close()
				return err
			}
			m.Citations = []ChatCitation{}
			out = append(out, m)
			if id, err := uuid.Parse(m.ID); err == nil {
				ids = append(ids, id)
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		if len(ids) == 0 {
			return nil
		}
		citeRows, err := tx.Query(ctx, `
			SELECT c.message_id::text, c.ordinal, c.document_id::text, coalesce(d.title, ''),
			       c.chunk_id::text, c.page, c.heading_path, c.score::float8, c.snippet
			FROM message_citations c
			LEFT JOIN documents d ON d.id = c.document_id
			WHERE c.workspace_id = $1 AND c.message_id = ANY($2::uuid[])
			ORDER BY c.message_id, c.ordinal`, ws.String(), ids)
		if err != nil {
			return fmt.Errorf("list citations: %w", err)
		}
		defer citeRows.Close()
		byMessage := map[string][]ChatCitation{}
		for citeRows.Next() {
			var msgID string
			var c ChatCitation
			if err := citeRows.Scan(&msgID, &c.Ordinal, &c.DocumentID, &c.DocumentTitle,
				&c.ChunkID, &c.Page, &c.HeadingPath, &c.Score, &c.Snippet); err != nil {
				return err
			}
			byMessage[msgID] = append(byMessage[msgID], c)
		}
		if err := citeRows.Err(); err != nil {
			return err
		}
		for i := range out {
			if cs, ok := byMessage[out[i].ID]; ok {
				out[i].Citations = cs
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (s *Store) AppendChatMessage(ctx context.Context, ws, user uuid.UUID, sessionID, role, content, status string, model *string) (*ChatMessage, error) {
	var m ChatMessage
	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `
			INSERT INTO messages (id, workspace_id, conversation_id, role, content, status, model)
			VALUES ($1,$2,$3,$4,$5,$6,$7)
			RETURNING id::text, role, content, status, model, tokens_in, tokens_out,
			          cost_usd::float8, latency_ms, refused, replay, created_at`,
			NewV7(), ws.String(), sessionID, role, content, status, model).
			Scan(&m.ID, &m.Role, &m.Content, &m.Status, &m.Model, &m.TokensIn, &m.TokensOut,
				&m.CostUSD, &m.LatencyMS, &m.Refused, &m.Replay, &m.CreatedAt); err != nil {
			return fmt.Errorf("insert message: %w", err)
		}
		m.Citations = []ChatCitation{}
		_, err := tx.Exec(ctx, `UPDATE conversations SET updated_at = now() WHERE id = $1 AND workspace_id = $2`,
			sessionID, ws.String())
		return err
	})
	if err != nil {
		return nil, err
	}
	return &m, nil
}

type AssistantResult struct {
	Content   string
	Status    string
	Model     *string
	Provider  *string
	TokensIn  int
	TokensOut int
	CostUSD   float64
	LatencyMS int
	Refused   bool
	Replay    bool
	Citations []ChatCitation
}

func (s *Store) FinishAssistantMessage(ctx context.Context, ws uuid.UUID, messageID string, res AssistantResult) error {
	if res.Status == "" {
		res.Status = "done"
	}
	return s.WithWorkspace(ctx, ws, uuid.Nil, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			UPDATE messages
			SET content = $1, status = $2, model = $3, provider = $4,
			    tokens_in = $5, tokens_out = $6, cost_usd = $7, latency_ms = $8,
			    refused = $9, replay = $10
			WHERE id = $11 AND workspace_id = $12`,
			res.Content, res.Status, res.Model, res.Provider, res.TokensIn, res.TokensOut,
			res.CostUSD, res.LatencyMS, res.Refused, res.Replay, messageID, ws.String())
		if err != nil {
			return fmt.Errorf("update assistant message: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		if _, err := tx.Exec(ctx, `DELETE FROM message_citations WHERE message_id = $1 AND workspace_id = $2`,
			messageID, ws.String()); err != nil {
			return err
		}
		for i, c := range res.Citations {
			ordinal := c.Ordinal
			if ordinal == 0 {
				ordinal = i + 1
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO message_citations (id, workspace_id, message_id, chunk_id, document_id,
				                               ordinal, score, page, heading_path, snippet)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
				NewV7(), ws.String(), messageID, c.ChunkID, c.DocumentID, ordinal,
				c.Score, c.Page, c.HeadingPath, c.Snippet); err != nil {
				return fmt.Errorf("insert citation: %w", err)
			}
		}
		return nil
	})
}
