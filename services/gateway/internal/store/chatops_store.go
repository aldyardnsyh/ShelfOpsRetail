package store

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ---------------------------------------------------------------------------
// Conversations Copilot: daftar + detail (composite endpoint).
// ---------------------------------------------------------------------------

// ListConversations mengembalikan percakapan terbaru + jumlah pesan.
func (s *Store) ListConversations(ctx context.Context, ws uuid.UUID, limit, offset int) ([]ChatSession, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	const q = `
	SELECT c.id::text, c.title, (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id),
	       c.created_at, c.updated_at
	FROM conversations c
	WHERE c.workspace_id = $1 AND c.deleted_at IS NULL
	ORDER BY c.updated_at DESC
	LIMIT $2 OFFSET $3`
	rows, cleanup, err := s.ListWorkspace(ctx, ws, uuid.Nil, q, ws, limit, offset)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	out := []ChatSession{}
	for rows.Next() {
		var c ChatSession
		if err := rows.Scan(&c.ID, &c.Title, &c.MessageCount, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// GetConversationDetail mengembalikan percakapan + seluruh pesan dalam urutan
// kronologis lengkap dengan sitasi & tool call.
func (s *Store) GetConversationDetail(ctx context.Context, ws uuid.UUID, conversationID string) (*ChatSessionDetail, error) {
	headRow, c1, err := s.QueryRowWorkspace(ctx, ws, uuid.Nil, `
		SELECT c.id::text, c.title, (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id),
		       c.created_at, c.updated_at
		FROM conversations c
		WHERE c.id = $1 AND c.workspace_id = $2 AND c.deleted_at IS NULL`, conversationID, ws)
	if err != nil {
		return nil, err
	}
	defer c1()
	h := &ChatSessionDetail{}
	if err := headRow.Scan(&h.ID, &h.Title, &h.MessageCount, &h.CreatedAt, &h.UpdatedAt); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get conversation: %w", err)
	}

	msgRows, c2, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
		SELECT id::text, role, content, status, model, provider, tokens_in, tokens_out,
		       cost_usd::float8, latency_ms, refused, replay, created_at
		FROM messages
		WHERE workspace_id = $1 AND conversation_id = $2
		ORDER BY created_at ASC, id ASC`, ws, conversationID)
	if err != nil {
		return nil, err
	}
	defer c2()
	msgIDs := []uuid.UUID{}
	for msgRows.Next() {
		var m ChatMessage
		var provider *string
		if err := msgRows.Scan(&m.ID, &m.Role, &m.Content, &m.Status, &m.Model, &provider,
			&m.TokensIn, &m.TokensOut, &m.CostUSD, &m.LatencyMS, &m.Refused, &m.Replay, &m.CreatedAt); err != nil {
			return nil, err
		}
		m.Citations = []ChatCitation{}
		m.ToolCalls = []ChatToolCall{}
		h.Messages = append(h.Messages, m)
		if id, err := uuid.Parse(m.ID); err == nil {
			msgIDs = append(msgIDs, id)
		}
	}
	if err := msgRows.Err(); err != nil {
		return nil, err
	}

	if len(msgIDs) > 0 {
		citRows, c3, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
			SELECT ct.message_id::text, ct.ordinal, ct.document_id::text, coalesce(d.title, ''),
			       ct.chunk_id::text, ct.page, ct.heading_path, ct.score::float8, ct.snippet
			FROM message_citations ct
			LEFT JOIN documents d ON d.id = ct.document_id
			WHERE ct.workspace_id = $1 AND ct.message_id = ANY($2::uuid[])
			ORDER BY ct.message_id, ct.ordinal`, ws, msgIDs)
		if err != nil {
			return nil, err
		}
		defer c3()
		byMessage := map[string][]ChatCitation{}
		for citRows.Next() {
			var msgID string
			var c ChatCitation
			if err := citRows.Scan(&msgID, &c.Ordinal, &c.DocumentID, &c.DocumentTitle,
				&c.ChunkID, &c.Page, &c.HeadingPath, &c.Score, &c.Snippet); err != nil {
				return nil, err
			}
			byMessage[msgID] = append(byMessage[msgID], c)
		}
		if err := citRows.Err(); err != nil {
			return nil, err
		}

		tcRows, c4, err := s.ListWorkspace(ctx, ws, uuid.Nil, `
			SELECT tc.message_id::text, tc.id::text, tc.name, tc.args, tc.result_summary, tc.status,
			       tc.requires_confirmation, tc.duration_ms, tc.created_at
			FROM tool_calls tc
			WHERE tc.workspace_id = $1 AND tc.message_id = ANY($2::uuid[])
			ORDER BY tc.created_at`, ws, msgIDs)
		if err != nil {
			return nil, err
		}
		defer c4()
		callsByMessage := map[string][]ChatToolCall{}
		for tcRows.Next() {
			var msgID string
			var tc ChatToolCall
			if err := tcRows.Scan(&msgID, &tc.ID, &tc.Name, &tc.Args, &tc.ResultSummary, &tc.Status,
				&tc.RequiresConfirmation, &tc.DurationMS, &tc.CreatedAt); err != nil {
				return nil, err
			}
			callsByMessage[msgID] = append(callsByMessage[msgID], tc)
		}
		if err := tcRows.Err(); err != nil {
			return nil, err
		}

		for i := range h.Messages {
			if cs, ok := byMessage[h.Messages[i].ID]; ok {
				h.Messages[i].Citations = cs
			}
			if tcs, ok := callsByMessage[h.Messages[i].ID]; ok {
				h.Messages[i].ToolCalls = tcs
			}
		}
	}
	return h, nil
}
