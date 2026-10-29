package httpx

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/config"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/objectstore"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/rbac"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/store"
)

const (
	testWorkspaceID = "00000000-0000-7000-8000-000000000001"
	testUserID      = "00000000-0000-7000-8000-000000000101"
)

type testEnv struct {
	srv  *Server
	ws   uuid.UUID
	user uuid.UUID
	auth string
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = os.Getenv("DATABASE_URL")
	}
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL/DATABASE_URL tidak diset; lewati test integrasi")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	st, err := store.New(ctx, dsn, 2)
	if err != nil {
		t.Skipf("database dev tidak tersedia: %v", err)
	}
	t.Cleanup(st.Close)

	cfg := &config.Config{
		AppEnv:           "test",
		WebBaseURL:       "http://localhost:3000",
		JWTSecret:        "test-only-jwt-secret-0123456789abcdef",
		SessionSecret:    "test-only-session-secret-0123456789",
		AccessTTL:        time.Hour,
		LoginRatePerMin:  1000,
		RateLimitPerMin:  100000,
		DemoAIReqPerHour: 100000,
		QueueMaxDepth:    10,
	}
	srv := NewServer(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)), st)
	ws := uuid.MustParse(testWorkspaceID)
	user := uuid.MustParse(testUserID)
	access, _, err := srv.Tokens.SignAccess(user.String(), ws.String(), rbac.RoleAdmin, false)
	if err != nil {
		t.Fatalf("sign access: %v", err)
	}
	return &testEnv{srv: srv, ws: ws, user: user, auth: access}
}

func (e *testEnv) do(t *testing.T, method, path string, body io.Reader, contentType string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, body)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	req.AddCookie(&http.Cookie{Name: cookieAccess, Value: e.auth})
	rec := httptest.NewRecorder()
	e.srv.Router().ServeHTTP(rec, req)
	return rec
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var out T
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode respons (%d): %v; body=%s", rec.Code, err, rec.Body.String())
	}
	return out
}

func TestStoresListAndDetail(t *testing.T) {
	env := newTestEnv(t)
	rec := env.do(t, http.MethodGet, "/api/v1/stores", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("list stores: status %d body=%s", rec.Code, rec.Body.String())
	}
	stores := decode[[]store.StoreRow](t, rec)
	if len(stores) == 0 {
		t.Fatal("seed toko harus tersedia")
	}

	rec = env.do(t, http.MethodGet, "/api/v1/stores/"+stores[0].ID, nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("detail store: status %d body=%s", rec.Code, rec.Body.String())
	}
	detail := decode[store.StoreDetail](t, rec)
	if detail.Store.ID != stores[0].ID {
		t.Fatalf("detail toko salah: %+v", detail.Store)
	}
}

func TestSessionsListAndDetail(t *testing.T) {
	env := newTestEnv(t)
	rec := env.do(t, http.MethodGet, "/api/v1/sessions?limit=5", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("list sessions: status %d body=%s", rec.Code, rec.Body.String())
	}
	page := decode[pageResponse[store.SessionRow]](t, rec)
	if len(page.Items) == 0 {
		t.Fatal("seed sesi audit harus tersedia")
	}

	rec = env.do(t, http.MethodGet, "/api/v1/sessions/"+page.Items[0].ID, nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("detail sesi: status %d body=%s", rec.Code, rec.Body.String())
	}
	detail := decode[store.SessionDetail](t, rec)
	if detail.Session.ID != page.Items[0].ID {
		t.Fatalf("detail sesi salah: %+v", detail.Session)
	}
}

func TestInsightsTrendAndRanking(t *testing.T) {
	env := newTestEnv(t)
	rec := env.do(t, http.MethodGet, "/api/v1/insights/trend?days=7", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("trend: status %d body=%s", rec.Code, rec.Body.String())
	}
	points := decode[[]store.TrendPoint](t, rec)
	if len(points) != 7 {
		t.Fatalf("jumlah titik trend = %d, mau 7", len(points))
	}

	rec = env.do(t, http.MethodGet, "/api/v1/insights/ranking?limit=5", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("ranking: status %d body=%s", rec.Code, rec.Body.String())
	}
	ranks := decode[[]store.StoreRank](t, rec)
	if len(ranks) == 0 {
		t.Fatal("ranking tidak boleh kosong untuk data seed")
	}
}

func TestAlertsListAndPatch(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()
	stores, err := env.srv.Store.ListStores(ctx, env.ws, env.user, "", "")
	if err != nil || len(stores) == 0 {
		t.Fatalf("butuh toko seed: %v", err)
	}
	alertID := store.NewV7()
	insertErr := env.srv.Store.WithWorkspace(ctx, env.ws, env.user, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			INSERT INTO alerts (id, workspace_id, store_id, type, severity, status, detail)
			VALUES ($1,$2,$3,'oos','low','open','uji handler')`,
			alertID, env.ws.String(), stores[0].ID)
		return err
	})
	if insertErr != nil {
		t.Fatalf("insert alert uji: %v", insertErr)
	}
	t.Cleanup(func() {
		_ = env.srv.Store.WithWorkspace(context.Background(), env.ws, env.user, func(tx pgx.Tx) error {
			_, _ = tx.Exec(context.Background(), `DELETE FROM audit_logs WHERE entity = 'alerts' AND entity_id = $1`, alertID)
			_, err := tx.Exec(context.Background(), `DELETE FROM alerts WHERE id = $1`, alertID)
			return err
		})
	})

	rec := env.do(t, http.MethodGet, "/api/v1/alerts?status=open&type=oos&limit=5", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("list alerts: status %d body=%s", rec.Code, rec.Body.String())
	}
	alerts := decode[[]store.Alert](t, rec)
	found := false
	for _, a := range alerts {
		if a.ID == alertID.String() {
			found = true
		}
	}
	if !found {
		t.Fatalf("alert uji tidak muncul di daftar: %+v", alerts)
	}

	rec = env.do(t, http.MethodPatch, "/api/v1/alerts/"+alertID.String(),
		strings.NewReader(`{"action":"ack","note":"diterima"}`), "application/json")
	if rec.Code != http.StatusOK {
		t.Fatalf("patch alert: status %d body=%s", rec.Code, rec.Body.String())
	}
	updated := decode[store.Alert](t, rec)
	if updated.Status != "acknowledged" {
		t.Fatalf("status alert = %q, mau acknowledged", updated.Status)
	}

	logs, err := env.srv.Store.ListAuditLogs(ctx, env.ws, "alert.acknowledge", 10, 0)
	if err != nil {
		t.Fatalf("baca audit: %v", err)
	}
	if len(logs) == 0 || logs[0].EntityID == nil || *logs[0].EntityID != alertID.String() {
		t.Fatalf("audit alert.acknowledge tidak tercatat: %+v", logs)
	}
}

func TestAuditList(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()
	if err := env.srv.Store.LogAudit(ctx, env.ws, env.user, "test.gateway", "tests", nil,
		map[string]any{"ok": true}); err != nil {
		t.Fatalf("tulis audit uji: %v", err)
	}
	t.Cleanup(func() {
		_ = env.srv.Store.WithWorkspace(context.Background(), env.ws, env.user, func(tx pgx.Tx) error {
			_, err := tx.Exec(context.Background(), `DELETE FROM audit_logs WHERE workspace_id = $1 AND action = 'test.gateway'`, env.ws.String())
			return err
		})
	})

	rec := env.do(t, http.MethodGet, "/api/v1/audit?limit=5&action=test", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("list audit: status %d body=%s", rec.Code, rec.Body.String())
	}
	page := decode[pageResponse[store.AuditLogRow]](t, rec)
	if len(page.Items) == 0 || page.Items[0].Action != "test.gateway" {
		t.Fatalf("audit uji tidak muncul: %+v", page.Items)
	}
}

func TestDocumentUploadFlow(t *testing.T) {
	env := newTestEnv(t)
	root := t.TempDir()
	objects, err := objectstore.NewLocalFS(root)
	if err != nil {
		t.Fatalf("object store: %v", err)
	}
	env.srv.Objects = objects

	const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lYQ5VwAAAABJRU5ErkJggg=="
	pngBytes, err := base64.StdEncoding.DecodeString(pngBase64)
	if err != nil {
		t.Fatalf("decode PNG uji: %v", err)
	}
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	part, err := mw.CreateFormFile("file", "sop-uji.png")
	if err != nil {
		t.Fatalf("multipart: %v", err)
	}
	if _, err := part.Write(pngBytes); err != nil {
		t.Fatalf("tulis multipart: %v", err)
	}
	_ = mw.WriteField("title", "SOP Uji")
	_ = mw.WriteField("language", "id")
	if err := mw.Close(); err != nil {
		t.Fatalf("tutup multipart: %v", err)
	}

	rec := env.do(t, http.MethodPost, "/api/v1/documents/upload", &body, mw.FormDataContentType())
	if rec.Code != http.StatusCreated {
		t.Fatalf("upload dokumen: status %d body=%s", rec.Code, rec.Body.String())
	}
	uploaded := decode[documentUploadResponse](t, rec)
	if uploaded.Status != "uploaded" {
		t.Fatalf("status dokumen = %q, mau uploaded", uploaded.Status)
	}
	if uploaded.Degradation != "queue_unavailable" {
		t.Fatalf("degradasi = %q, mau queue_unavailable (queue tidak disuntik di test)", uploaded.Degradation)
	}
	t.Cleanup(func() {
		_ = env.srv.Store.WithWorkspace(context.Background(), env.ws, env.user, func(tx pgx.Tx) error {
			_, err := tx.Exec(context.Background(), `DELETE FROM documents WHERE id = $1`, uploaded.ID)
			return err
		})
	})

	rec = env.do(t, http.MethodGet, "/api/v1/documents/"+uploaded.ID, nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("get dokumen: status %d body=%s", rec.Code, rec.Body.String())
	}
	doc := decode[store.DocumentRow](t, rec)
	if doc.ChunkCount != 0 {
		t.Fatalf("chunk_count = %d, mau 0", doc.ChunkCount)
	}

	rec = env.do(t, http.MethodGet, "/api/v1/documents?status=uploaded&limit=10", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("list dokumen: status %d body=%s", rec.Code, rec.Body.String())
	}
	list := decode[pageResponse[store.DocumentRow]](t, rec)
	found := false
	for _, d := range list.Items {
		if d.ID == uploaded.ID {
			found = true
		}
	}
	if !found {
		t.Fatalf("dokumen uji tidak muncul di list: %+v", list.Items)
	}

	rec = env.do(t, http.MethodDelete, "/api/v1/documents/"+uploaded.ID, nil, "")
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete dokumen: status %d body=%s", rec.Code, rec.Body.String())
	}
	rec = env.do(t, http.MethodGet, "/api/v1/documents/"+uploaded.ID, nil, "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("get dokumen terhapus: status %d, mau 404", rec.Code)
	}
}

func TestChatCreateAndMessageDegraded(t *testing.T) {
	env := newTestEnv(t)
	rec := env.do(t, http.MethodPost, "/api/v1/chat/sessions",
		strings.NewReader(`{"title":"Uji chat"}`), "application/json")
	if rec.Code != http.StatusCreated {
		t.Fatalf("buat sesi chat: status %d body=%s", rec.Code, rec.Body.String())
	}
	session := decode[store.ChatSession](t, rec)
	t.Cleanup(func() {
		_ = env.srv.Store.WithWorkspace(context.Background(), env.ws, env.user, func(tx pgx.Tx) error {
			_, err := tx.Exec(context.Background(), `DELETE FROM conversations WHERE id = $1`, session.ID)
			return err
		})
	})

	rec = env.do(t, http.MethodPost, "/api/v1/chat/sessions/"+session.ID+"/messages",
		strings.NewReader(`{"content":"Halo, apa SOP facing?"}`), "application/json")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("kirim pesan: status %d body=%s", rec.Code, rec.Body.String())
	}
	msg := decode[chatMessageResponse](t, rec)
	if msg.Degradation != "ai_rag_unavailable" {
		t.Fatalf("degradasi = %q, mau ai_rag_unavailable", msg.Degradation)
	}
	if msg.AssistantMessage.Status != "pending" {
		t.Fatalf("status assistant = %q, mau pending", msg.AssistantMessage.Status)
	}

	rec = env.do(t, http.MethodGet, "/api/v1/chat/sessions/"+session.ID+"/messages", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("list pesan: status %d body=%s", rec.Code, rec.Body.String())
	}
	page := decode[pageResponse[store.ChatMessage]](t, rec)
	if len(page.Items) != 2 {
		t.Fatalf("jumlah pesan = %d, mau 2: %+v", len(page.Items), page.Items)
	}

	rec = env.do(t, http.MethodGet, "/api/v1/chat/sessions/"+session.ID+"/stream", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("stream chat: status %d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "event: error") {
		t.Fatalf("stream harus mengirim event error saat ai-rag down: %s", rec.Body.String())
	}
}

func TestEvalsAndToolsReadOnly(t *testing.T) {
	env := newTestEnv(t)
	rec := env.do(t, http.MethodGet, "/api/v1/evals", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("list evals: status %d body=%s", rec.Code, rec.Body.String())
	}
	rec = env.do(t, http.MethodGet, "/api/v1/tools", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("list tools: status %d body=%s", rec.Code, rec.Body.String())
	}
	tools := decode[[]toolDefinition](t, rec)
	if len(tools) != 5 {
		t.Fatalf("jumlah tool = %d, mau 5", len(tools))
	}
	for _, tool := range tools {
		if tool.Name == "" || tool.Description == "" || tool.Permission == "" {
			t.Fatalf("tool tidak lengkap: %+v", tool)
		}
	}
}
