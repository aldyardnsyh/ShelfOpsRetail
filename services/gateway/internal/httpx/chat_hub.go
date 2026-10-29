package httpx

import (
	"sync"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/store"
)

type chatStreamError struct {
	Title   string `json:"title"`
	Detail  string `json:"detail"`
	Status  int    `json:"status"`
	TraceID string `json:"trace_id"`
}

type chatToolCall struct {
	ID                   string `json:"id"`
	Name                 string `json:"name"`
	Status               string `json:"status"`
	ResultSummary        string `json:"result_summary,omitempty"`
	DurationMS           int    `json:"duration_ms"`
	RequiresConfirmation bool   `json:"requires_confirmation"`
}

type chatUsage struct {
	TokensIn  int     `json:"tokens_in"`
	TokensOut int     `json:"tokens_out"`
	CostUSD   float64 `json:"cost_usd"`
	LatencyMS int     `json:"latency_ms"`
	Provider  string  `json:"provider,omitempty"`
	Model     string  `json:"model,omitempty"`
}

type chatEvent struct {
	Type      string              `json:"type"`
	MessageID string              `json:"message_id,omitempty"`
	Text      string              `json:"text,omitempty"`
	Citation  *store.ChatCitation `json:"citation,omitempty"`
	ToolCall  *chatToolCall       `json:"tool_call,omitempty"`
	Step      int                 `json:"step,omitempty"`
	Usage     *chatUsage          `json:"usage,omitempty"`
	Error     *chatStreamError    `json:"error,omitempty"`
	At        string              `json:"at,omitempty"`
}

const (
	chatStatusUnknown     = "unknown"
	chatStatusPending     = "pending"
	chatStatusDone        = "done"
	chatStatusUnavailable = "unavailable"
)

type chatChannel struct {
	events []chatEvent
	subs   map[chan chatEvent]struct{}
	status string
}

// chatHub menyimpan buffer event in-memory per sesi agar klien yang terlambat
// connect tetap menerima event awal. Bukan pengganti durable queue: pesan
// final selalu tersimpan di Postgres.
type chatHub struct {
	mu       sync.Mutex
	channels map[string]*chatChannel
}

func newChatHub() *chatHub {
	return &chatHub{channels: map[string]*chatChannel{}}
}

func (h *chatHub) channel(sessionID string) *chatChannel {
	c, ok := h.channels[sessionID]
	if !ok {
		c = &chatChannel{subs: map[chan chatEvent]struct{}{}, status: chatStatusUnknown}
		h.channels[sessionID] = c
	}
	return c
}

func (h *chatHub) setStatus(sessionID, status string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.channel(sessionID).status = status
}

func (h *chatHub) status(sessionID string) string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.channel(sessionID).status
}

func (h *chatHub) publish(sessionID string, ev chatEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()
	c := h.channel(sessionID)
	if ev.At == "" {
		ev.At = nowRFC3339()
	}
	c.events = append(c.events, ev)
	if len(c.events) > 2000 {
		c.events = c.events[len(c.events)-2000:]
	}
	for sub := range c.subs {
		select {
		case sub <- ev:
		default:
			// klien lambat: event tetap ada di buffer untuk reconnect
		}
	}
}

func (h *chatHub) subscribe(sessionID string) ([]chatEvent, <-chan chatEvent, func()) {
	h.mu.Lock()
	defer h.mu.Unlock()
	c := h.channel(sessionID)
	snapshot := append([]chatEvent(nil), c.events...)
	ch := make(chan chatEvent, 64)
	c.subs[ch] = struct{}{}
	return snapshot, ch, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		delete(c.subs, ch)
	}
}
