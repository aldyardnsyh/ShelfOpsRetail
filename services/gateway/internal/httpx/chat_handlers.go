package httpx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	shelfopsv1 "github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/gen/shelfops/v1"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/problem"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/store"
)

type chatSessionCreateRequest struct {
	Title string `json:"title"`
}

type chatMessageRequest struct {
	Content string            `json:"content"`
	Model   string            `json:"model"`
	Filters map[string]string `json:"filters"`
}

type chatMessageResponse struct {
	UserMessage      store.ChatMessage `json:"user_message"`
	AssistantMessage store.ChatMessage `json:"assistant_message"`
	Degradation      string            `json:"degradation,omitempty"`
}

func (s *Server) handleCreateChatSession(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	var req chatSessionCreateRequest
	if r.ContentLength != 0 {
		if perr := decodeJSON(w, r, &req, traceID); perr != nil {
			perr.Write(w)
			return
		}
	}
	req.Title = strings.TrimSpace(req.Title)
	if len([]rune(req.Title)) > 120 {
		problem.Validation(traceID, problem.FieldError{Field: "title", Message: "maksimal 120 karakter"}).Write(w)
		return
	}
	session, err := s.Store.CreateChatSession(r.Context(), id.WorkspaceID, id.UserID, req.Title)
	if err != nil {
		s.Log.Error("create chat session", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusCreated, session)
}

func (s *Server) handleListChatSessions(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	limit, offset, perr := pageParams(r, 20, 100)
	if perr != nil {
		perr.Write(w)
		return
	}
	sessions, err := s.Store.ListChatSessions(r.Context(), id.WorkspaceID, limit, offset)
	if err != nil {
		s.Log.Error("list chat sessions", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, pageResponse[store.ChatSession]{
		Items:      sessions,
		NextCursor: nextCursor(offset, len(sessions), limit),
	})
}

func (s *Server) handleListChatMessages(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	sessionID := chiURLParam(r, "sessionId")
	if _, err := uuid.Parse(sessionID); err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "sessionId", Message: "harus UUID valid"}).Write(w)
		return
	}
	if _, err := s.Store.GetChatSession(r.Context(), id.WorkspaceID, sessionID); err != nil {
		if isNotFound(err) {
			problem.NotFound("Sesi chat tidak ditemukan.", traceID).Write(w)
			return
		}
		problem.Internal(traceID).Write(w)
		return
	}
	limit, offset, perr := pageParams(r, 50, 200)
	if perr != nil {
		perr.Write(w)
		return
	}
	messages, err := s.Store.ListChatMessages(r.Context(), id.WorkspaceID, sessionID, limit, offset)
	if err != nil {
		s.Log.Error("list chat messages", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, pageResponse[store.ChatMessage]{
		Items:      messages,
		NextCursor: nextCursor(offset, len(messages), limit),
	})
}

func (s *Server) handlePostChatMessage(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	sessionID := chiURLParam(r, "sessionId")
	if _, err := uuid.Parse(sessionID); err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "sessionId", Message: "harus UUID valid"}).Write(w)
		return
	}
	if _, err := s.Store.GetChatSession(r.Context(), id.WorkspaceID, sessionID); err != nil {
		if isNotFound(err) {
			problem.NotFound("Sesi chat tidak ditemukan.", traceID).Write(w)
			return
		}
		problem.Internal(traceID).Write(w)
		return
	}
	var req chatMessageRequest
	if perr := decodeJSON(w, r, &req, traceID); perr != nil {
		perr.Write(w)
		return
	}
	req.Content = strings.TrimSpace(req.Content)
	if req.Content == "" || len([]rune(req.Content)) > 4000 {
		problem.Validation(traceID, problem.FieldError{Field: "content", Message: "wajib 1-4000 karakter"}).Write(w)
		return
	}

	// Riwayat diambil sebelum pesan baru disisipkan.
	history, err := s.Store.ListChatMessages(r.Context(), id.WorkspaceID, sessionID, 20, 0)
	if err != nil {
		s.Log.Error("load chat history", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	turns := make([]*shelfopsv1.HistoryTurn, 0, len(history))
	for i := len(history) - 1; i >= 0; i-- {
		m := history[i]
		if m.Content == "" || (m.Role != "user" && m.Role != "assistant") {
			continue
		}
		turns = append(turns, &shelfopsv1.HistoryTurn{Role: m.Role, Content: m.Content})
	}

	userMsg, err := s.Store.AppendChatMessage(r.Context(), id.WorkspaceID, id.UserID, sessionID, "user", req.Content, "done", nil)
	if err != nil {
		s.Log.Error("append user message", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	assistantMsg, err := s.Store.AppendChatMessage(r.Context(), id.WorkspaceID, id.UserID, sessionID, "assistant", "", "pending", nil)
	if err != nil {
		s.Log.Error("append assistant placeholder", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}

	out := chatMessageResponse{UserMessage: *userMsg, AssistantMessage: *assistantMsg}
	s.chatHub.setStatus(sessionID, chatStatusPending)
	if s.RAGClient == nil {
		out.Degradation = "ai_rag_unavailable"
		s.markChatUnavailable(sessionID, assistantMsg.ID, traceID, "ai-rag belum dikonfigurasi")
		writeJSON(w, http.StatusAccepted, out)
		return
	}

	reqID := uuid.Must(uuid.NewV7()).String()
	greq := &shelfopsv1.ChatRequest{
		RequestId:      reqID,
		WorkspaceId:    id.WorkspaceID.String(),
		ConversationId: sessionID,
		UserId:         id.UserID.String(),
		Message:        req.Content,
		History:        turns,
		ModelHint:      req.Model,
		Filters:        req.Filters,
		AllowTools:     true,
		MaxSteps:       5,
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	startCh := make(chan ragStart, 1)
	go func() {
		stream, err := s.RAGClient.Chat(ctx, greq)
		startCh <- ragStart{stream: stream, err: err}
	}()
	select {
	case res := <-startCh:
		if res.err != nil {
			cancel()
			out.Degradation = "ai_rag_unavailable"
			s.Log.Warn("ai-rag chat gagal", "trace_id", traceID, "error", res.err)
			s.markChatUnavailable(sessionID, assistantMsg.ID, traceID, "ai-rag tidak dapat dijangkau")
		} else {
			go s.consumeChatStream(ctx, cancel, id.WorkspaceID, sessionID, assistantMsg.ID, res.stream)
		}
	case <-time.After(2 * time.Second):
		// Sambungan masih dinegosiasikan; lanjutkan di background dan biarkan
		// SSE mengirim error bila akhirnya gagal.
		go func() {
			res := <-startCh
			if res.err != nil {
				cancel()
				s.markChatUnavailable(sessionID, assistantMsg.ID, traceID, "ai-rag tidak dapat dijangkau")
				return
			}
			s.consumeChatStream(ctx, cancel, id.WorkspaceID, sessionID, assistantMsg.ID, res.stream)
		}()
	}
	writeJSON(w, http.StatusAccepted, out)
}

func (s *Server) markChatUnavailable(sessionID, messageID, traceID, detail string) {
	s.chatHub.setStatus(sessionID, chatStatusUnavailable)
	s.chatHub.publish(sessionID, chatEvent{
		Type:      "error",
		MessageID: messageID,
		Error: &chatStreamError{
			Title:   "Layanan AI tidak tersedia",
			Detail:  detail,
			Status:  http.StatusServiceUnavailable,
			TraceID: traceID,
		},
	})
}

func (s *Server) handleChatStream(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	sessionID := chiURLParam(r, "sessionId")
	if _, err := uuid.Parse(sessionID); err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "sessionId", Message: "harus UUID valid"}).Write(w)
		return
	}
	if _, err := s.Store.GetChatSession(r.Context(), id.WorkspaceID, sessionID); err != nil {
		if isNotFound(err) {
			problem.NotFound("Sesi chat tidak ditemukan.", traceID).Write(w)
			return
		}
		problem.Internal(traceID).Write(w)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		problem.Internal(traceID).Write(w)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	if s.RAGClient == nil {
		_ = writeSSE(w, flusher, chatEvent{Type: "error", Error: &chatStreamError{
			Title: "Layanan AI tidak tersedia", Detail: "ai-rag belum dikonfigurasi",
			Status: http.StatusServiceUnavailable, TraceID: traceID,
		}})
		return
	}

	snapshot, ch, unsubscribe := s.chatHub.subscribe(sessionID)
	defer unsubscribe()
	for _, ev := range snapshot {
		if err := writeSSE(w, flusher, ev); err != nil {
			return
		}
	}
	status := s.chatHub.status(sessionID)
	switch status {
	case chatStatusUnavailable:
		hasError := false
		for _, ev := range snapshot {
			if ev.Type == "error" {
				hasError = true
				break
			}
		}
		if !hasError {
			_ = writeSSE(w, flusher, chatEvent{Type: "error", Error: &chatStreamError{
				Title: "Layanan AI tidak tersedia", Detail: "ai-rag tidak dapat dijangkau",
				Status: http.StatusServiceUnavailable, TraceID: traceID,
			}})
		}
		return
	case chatStatusDone:
		return
	}

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case ev := <-ch:
			if err := writeSSE(w, flusher, ev); err != nil {
				return
			}
			// Tutup stream setelah error atau selesai; klien tidak perlu
			// menebak kapan giliran berakhir.
			if ev.Type == "error" || ev.Type == "done" {
				return
			}
		case <-ticker.C:
			if _, err := io.WriteString(w, ": keep-alive\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func writeSSE(w http.ResponseWriter, f http.Flusher, ev chatEvent) error {
	payload, err := json.Marshal(ev)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Type, payload); err != nil {
		return err
	}
	f.Flush()
	return nil
}

type ragStart struct {
	stream shelfopsv1.RagService_ChatClient
	err    error
}

func (s *Server) consumeChatStream(ctx context.Context, cancel context.CancelFunc, ws uuid.UUID, sessionID, messageID string, stream shelfopsv1.RagService_ChatClient) {
	defer cancel()
	var text strings.Builder
	citations := []store.ChatCitation{}
	var usage chatUsage
	hadError := false
	start := time.Now()

	for {
		resp, err := stream.Recv()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			hadError = true
			s.chatHub.publish(sessionID, chatEvent{
				Type:      "error",
				MessageID: messageID,
				Error: &chatStreamError{
					Title: "Stream AI terputus", Detail: err.Error(),
					Status: http.StatusBadGateway,
				},
			})
			break
		}
		switch resp.GetType() {
		case shelfopsv1.ChatResponse_TYPE_TOKEN:
			text.WriteString(resp.GetText())
			s.chatHub.publish(sessionID, chatEvent{Type: "token", MessageID: messageID, Text: resp.GetText()})
		case shelfopsv1.ChatResponse_TYPE_CITATION:
			c := toStoreCitation(resp.GetCitation())
			if c != nil {
				citations = append(citations, *c)
				s.chatHub.publish(sessionID, chatEvent{Type: "citation", MessageID: messageID, Citation: c})
			}
		case shelfopsv1.ChatResponse_TYPE_TOOL_START, shelfopsv1.ChatResponse_TYPE_TOOL_END,
			shelfopsv1.ChatResponse_TYPE_CONFIRM_REQUIRED:
			evType := "tool_start"
			if resp.GetType() == shelfopsv1.ChatResponse_TYPE_TOOL_END {
				evType = "tool_end"
			} else if resp.GetType() == shelfopsv1.ChatResponse_TYPE_CONFIRM_REQUIRED {
				evType = "confirm_required"
			}
			s.chatHub.publish(sessionID, chatEvent{Type: evType, MessageID: messageID, ToolCall: toChatToolCall(resp.GetToolCall())})
		case shelfopsv1.ChatResponse_TYPE_STEP:
			s.chatHub.publish(sessionID, chatEvent{Type: "step", MessageID: messageID, Step: int(resp.GetStep()), Text: resp.GetText()})
		case shelfopsv1.ChatResponse_TYPE_DONE:
			usage = chatUsage{
				TokensIn: int(resp.GetTokensIn()), TokensOut: int(resp.GetTokensOut()),
				CostUSD: resp.GetCostUsd(), LatencyMS: int(resp.GetLatencyMs()),
				Provider: resp.GetProvider(), Model: resp.GetModel(),
			}
		case shelfopsv1.ChatResponse_TYPE_ERROR:
			hadError = true
			s.chatHub.publish(sessionID, chatEvent{Type: "error", MessageID: messageID, Error: &chatStreamError{
				Title: "Kesalahan AI", Detail: resp.GetError(), Status: http.StatusBadGateway,
			}})
		}
	}

	if text.Len() == 0 && !hadError {
		// Jangan menandai jawaban kosong sebagai selesai: placeholder tetap
		// pending dan klien menerima event error yang jujur.
		s.chatHub.setStatus(sessionID, chatStatusPending)
		s.chatHub.publish(sessionID, chatEvent{
			Type:      "error",
			MessageID: messageID,
			Error: &chatStreamError{
				Title: "Jawaban AI kosong", Detail: "ai-rag tidak mengembalikan token jawaban",
				Status: http.StatusBadGateway,
			},
		})
		return
	}

	status := "done"
	if hadError {
		status = "error"
	}
	if usage.LatencyMS == 0 {
		usage.LatencyMS = int(time.Since(start).Milliseconds())
	}
	finishCtx, finishCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer finishCancel()
	if err := s.Store.FinishAssistantMessage(finishCtx, ws, messageID, store.AssistantResult{
		Content: text.String(), Status: status, TokensIn: usage.TokensIn, TokensOut: usage.TokensOut,
		CostUSD: usage.CostUSD, LatencyMS: usage.LatencyMS, Citations: citations,
	}); err != nil {
		s.Log.Error("simpan jawaban assistant", "error", err, "message_id", messageID)
	}
	s.chatHub.setStatus(sessionID, status)
	if status == "done" {
		s.chatHub.publish(sessionID, chatEvent{Type: "done", MessageID: messageID, Usage: &usage})
	}
}

func toStoreCitation(c *shelfopsv1.Citation) *store.ChatCitation {
	if c == nil {
		return nil
	}
	out := &store.ChatCitation{
		Ordinal:       int(c.GetOrdinal()),
		DocumentTitle: c.GetDocumentTitle(),
		HeadingPath:   c.GetHeadingPath(),
		Score:         float64(c.GetScore()),
		Snippet:       c.GetSnippet(),
	}
	if id, err := uuid.Parse(c.GetDocumentId()); err == nil {
		s := id.String()
		out.DocumentID = &s
	}
	if id, err := uuid.Parse(c.GetChunkId()); err == nil {
		s := id.String()
		out.ChunkID = &s
	}
	if c.GetPage() > 0 {
		p := int(c.GetPage())
		out.Page = &p
	}
	return out
}

func toChatToolCall(t *shelfopsv1.ToolCallRef) *chatToolCall {
	if t == nil {
		return nil
	}
	return &chatToolCall{
		ID: t.GetId(), Name: t.GetName(), Status: t.GetStatus(),
		ResultSummary: t.GetResultSummary(), DurationMS: int(t.GetDurationMs()),
		RequiresConfirmation: t.GetRequiresConfirmation(),
	}
}

func nowRFC3339() string { return time.Now().UTC().Format(time.RFC3339) }

// handleConfirmToolCall menjawab dengan jujur bahwa kontrak ai-rag belum
// memiliki RPC konfirmasi. UI menampilkan pesan ini apa adanya; tidak ada aksi
// tulis yang dieksekusi diam-diam.
func (s *Server) handleConfirmToolCall(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	problem.New(http.StatusNotImplemented,
		"Konfirmasi tool belum tersedia",
		"Layanan ai-rag belum mengekspos RPC konfirmasi tool. Jalankan ulang permintaan setelah fitur ini dirilis.",
		traceID,
	).Write(w)
}
