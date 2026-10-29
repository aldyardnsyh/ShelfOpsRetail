package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	shelfopsv1 "github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/gen/shelfops/v1"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/auth"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/config"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/objectstore"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/problem"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/queue"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/ratelimit"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/rbac"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/store"
)

const (
	maxJSONBody   = 1 << 20 // 1 MiB untuk request JSON
	cookieAccess  = "shelfops_access"
	cookieRefresh = "shelfops_refresh"
	refreshPath   = "/api/v1/auth"
)

// Server merangkai dependency dan route.
type Server struct {
	Cfg    *config.Config
	Log    *slog.Logger
	Store  *store.Store
	Tokens *auth.TokenIssuer
	Hasher auth.Hasher

	Objects   objectstore.ObjectStore
	Queue     *queue.RiverQueue
	RAGClient shelfopsv1.RagServiceClient
	Vision    shelfopsv1.VisionServiceClient

	loginLimiter *ratelimit.Limiter
	demoLimiter  *ratelimit.Limiter
	apiLimiter   *ratelimit.Limiter
	aiLimiter    *ratelimit.Limiter
	chatLimiter  *ratelimit.Limiter
	chatHub      *chatHub

	now func() time.Time
}

func NewServer(cfg *config.Config, log *slog.Logger, st *store.Store) *Server {
	return &Server{
		Cfg:          cfg,
		Log:          log,
		Store:        st,
		Tokens:       auth.NewTokenIssuer(cfg.JWTSecret, cfg.AccessTTL),
		Hasher:       auth.DefaultHasher(),
		loginLimiter: ratelimit.New(cfg.LoginRatePerMin),
		demoLimiter:  ratelimit.New(6), // 6 sesi demo per menit per IP
		apiLimiter:   ratelimit.New(cfg.RateLimitPerMin),
		aiLimiter:    ratelimit.New(cfg.DemoAIReqPerHour * 60), // per jam → dikonversi internal
		chatLimiter:  ratelimit.New(cfg.DemoAIReqPerHour),
		chatHub:      newChatHub(),
		now:          time.Now,
	}
}

// Router menyusun seluruh route sesuai PRD §11.1.
func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(TraceIDMiddleware)
	r.Use(Recoverer(s.Log))
	r.Use(Logger(s.Log))
	r.Use(SecurityHeaders(s.Cfg.IsProduction()))
	r.Use(CORS(strings.Split(s.Cfg.WebBaseURL, ",")))

	r.Get("/healthz", s.handleHealth)
	r.Get("/readyz", s.handleReady)

	r.Route("/api/v1", func(r chi.Router) {
		r.Group(func(r chi.Router) {
			r.Use(s.authMiddleware(false))

			r.Get("/me", s.handleMe)

			r.Group(func(r chi.Router) {
				r.Use(s.rateLimitAPI())
				r.Get("/workspace", s.handleGetWorkspace)
				r.With(RequirePermission(rbac.PermWorkspaceManage)).Patch("/workspace", s.handleUpdateWorkspace)
				r.Get("/workspace/members", s.handleListMembers)
				r.With(RequirePermission(rbac.PermMemberManage)).Post("/workspace/members", s.handleAddMember)
				r.With(RequirePermission(rbac.PermMemberManage)).Patch("/workspace/members/{id}", s.handleUpdateMemberRole)
				r.With(RequirePermission(rbac.PermMemberManage)).Delete("/workspace/members/{id}", s.handleRemoveMember)

				r.With(RequirePermission(rbac.PermDashboardRead)).Get("/stores", s.handleListStores)
				r.With(RequirePermission(rbac.PermDashboardRead)).Get("/stores/{storeId}", s.handleGetStore)
				r.With(RequirePermission(rbac.PermWorkspaceManage)).Post("/stores", s.handleCreateStore)
				r.Get("/planograms", s.handleListPlanograms)
				r.With(RequirePermission(rbac.PermWorkspaceManage)).Post("/planograms", s.handleCreatePlanogram)

				r.Get("/insights/kpis", s.handleKpis)
				r.Get("/insights/trend", s.handleTrend)
				r.Get("/insights/ranking", s.handleRanking)
				r.Get("/alerts", s.handleListAlerts)
				r.With(RequirePermission(rbac.PermAlertUpdate)).Patch("/alerts/{alertId}", s.handleUpdateAlert)

				r.With(RequirePermission(rbac.PermAuditRead)).Get("/audit", s.handleListAuditLogs)
				r.With(RequirePermission(rbac.PermAuditRead)).Get("/audits", s.handleListAudits)
				r.With(RequirePermission(rbac.PermAuditRead)).Get("/audits/{auditId}", s.handleGetAuditDetail)
				r.With(RequirePermission(rbac.PermAuditWrite)).Post("/audits", s.handleCreateAudit)
				r.With(RequirePermission(rbac.PermAuditWrite)).Post("/audits/{auditId}/images", s.handleUploadAuditImage)
				r.With(RequirePermission(rbac.PermAuditWrite), RateLimitByUser(s.aiLimiter, "Kuota analisis tercapai. Coba lagi nanti.")).
					Post("/audits/{auditId}/start", s.handleStartAudit)
				r.With(RequirePermission(rbac.PermAuditWrite)).Post("/audits/{auditId}/finalize", s.handleFinalizeAudit)
				r.With(RequirePermission(rbac.PermDashboardRead)).Get("/sessions", s.handleListSessions)
				r.With(RequirePermission(rbac.PermDashboardRead)).Get("/sessions/{sessionId}", s.handleGetSession)

				r.With(RequirePermission(rbac.PermDocumentRead)).Get("/documents", s.handleListDocuments)
				r.With(RequirePermission(rbac.PermDocumentRead)).Get("/documents/{documentId}", s.handleGetDocument)
				r.With(RequirePermission(rbac.PermDocumentRead)).Get("/documents/{documentId}/chunks", s.handleGetDocumentIndex)
				r.With(RequirePermission(rbac.PermDocumentWrite)).Post("/documents/upload", s.handleUploadDocument)
				r.With(RequirePermission(rbac.PermDocumentWrite)).Delete("/documents/{documentId}", s.handleDeleteDocument)

				r.With(RequirePermission(rbac.PermChatUse)).Get("/chat/sessions", s.handleListChatSessions)
				r.With(RequirePermission(rbac.PermChatUse)).Post("/chat/sessions", s.handleCreateChatSession)
				r.With(RequirePermission(rbac.PermChatUse)).Get("/chat/sessions/{sessionId}/messages", s.handleListChatMessages)
				r.With(RequirePermission(rbac.PermChatUse), RateLimitByUser(s.chatLimiter, "Kuota chat tercapai. Coba lagi sebentar lagi.")).
					Post("/chat/sessions/{sessionId}/messages", s.handlePostChatMessage)
				r.With(RequirePermission(rbac.PermChatUse)).Get("/chat/sessions/{sessionId}/stream", s.handleChatStream)
				// Belum didukung ai-rag: jawab 501 eksplisit, bukan 404 yang
				// membuat UI tampak rusak tanpa alasan.
				r.With(RequirePermission(rbac.PermChatUse)).Post("/tool-calls/{toolCallId}/confirm", s.handleConfirmToolCall)

				r.With(RequirePermission(rbac.PermChatUse)).Get("/conversations", s.handleListConversations)
				r.With(RequirePermission(rbac.PermChatUse)).Get("/conversations/{conversationId}", s.handleGetConversation)

				r.With(RequirePermission(rbac.PermTraceRead)).Get("/traces", s.handleListTraces)
				r.With(RequirePermission(rbac.PermTraceRead)).Get("/traces/{requestId}", s.handleGetTrace)

				r.With(RequirePermission(rbac.PermEvalRead)).Get("/evals", s.handleListEvals)
				r.With(RequirePermission(rbac.PermEvalRead)).Get("/evals/overview", s.handleEvalsOverview)
				r.With(RequirePermission(rbac.PermEvalRead)).Get("/benchmarks", s.handleBenchmarks)
				r.Get("/tools", s.handleListTools)

				// Domain operasional (M3/M5/M7 read-only)
				r.With(RequirePermission(rbac.PermDashboardRead)).Get("/inventory", s.handleInventoryOverview)
				r.With(RequirePermission(rbac.PermDashboardRead)).Get("/pricing", s.handlePricingOverview)
				r.With(RequirePermission(rbac.PermDashboardRead)).Get("/tasks", s.handleTasks)
				r.With(RequirePermission(rbac.PermTaskWrite)).Patch("/tasks/{taskId}", s.handleUpdateTask)
				r.With(RequirePermission(rbac.PermDashboardRead)).Get("/purchasing", s.handlePurchasingOverview)
				r.With(RequirePermission(rbac.PermPurchaseWrite)).Post("/purchase-orders", s.handleCreatePurchaseOrder)
				r.With(RequirePermission(rbac.PermPurchaseWrite)).Post("/grns", s.handleCreateGoodsReceipt)
				r.With(RequirePermission(rbac.PermDashboardRead)).Get("/tracking", s.handleShipments)
				r.With(RequirePermission(rbac.PermDashboardRead)).Get("/monitor", s.handleMonitorOverview)
				r.With(RequirePermission(rbac.PermDashboardRead)).Get("/reports", s.handleReportsOverview)
				r.With(RequirePermission(rbac.PermDashboardRead)).Get("/integrations", s.handleIntegrationsOverview)

				r.With(RequirePermission(rbac.PermWorkspaceManage)).Get("/system/quota", s.handleQuota)
			})
		})

		// Endpoint pra-autentikasi (rate limit ketat per IP).
		r.Group(func(r chi.Router) {
			r.With(RateLimitByIP(s.loginLimiter, "Terlalu banyak percobaan. Coba lagi sebentar lagi.")).Post("/auth/login", s.handleLogin)
			r.With(RateLimitByIP(s.demoLimiter, "Terlalu banyak sesi demo dari jaringan ini.")).Post("/auth/demo", s.handleDemo)
			r.With(RateLimitByIP(s.loginLimiter, "Terlalu banyak percobaan refresh.")).Post("/auth/refresh", s.handleRefresh)
			r.Post("/auth/logout", s.handleLogout)
			r.Get("/auth/google/start", s.handleGoogleStart)
		})
	})
	return r
}

// ---------------------------------------------------------------------------
// Helper respons
// ---------------------------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("gagal encode respons", "error", err)
	}
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any, traceID string) *problem.Error {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBody)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			return problem.New(http.StatusRequestEntityTooLarge, "Body terlalu besar", "Batas body JSON 1 MiB.", traceID)
		}
		if errors.Is(err, io.EOF) {
			return problem.BadRequest("Body JSON kosong.", traceID)
		}
		return problem.BadRequest("Body JSON tidak valid: "+err.Error(), traceID)
	}
	return nil
}

func (s *Server) rateLimitAPI() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id, _ := IdentityFrom(r.Context())
			key := "api:" + id.UserID.String()
			if ok, retry := s.apiLimiter.Allow(key); !ok {
				problem.TooManyRequests("Batas permintaan tercapai.", TraceID(r.Context()), retry).Write(w)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ---------------------------------------------------------------------------
// Cookie & middleware auth
// ---------------------------------------------------------------------------

func (s *Server) setAuthCookies(w http.ResponseWriter, access string, accessExp time.Time, refresh string, refreshExp time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieAccess,
		Value:    access,
		Path:     "/",
		Domain:   s.Cfg.CookieDomain,
		Expires:  accessExp,
		MaxAge:   int(time.Until(accessExp).Seconds()),
		HttpOnly: true,
		Secure:   s.Cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     cookieRefresh,
		Value:    refresh,
		Path:     refreshPath,
		Domain:   s.Cfg.CookieDomain,
		Expires:  refreshExp,
		MaxAge:   int(time.Until(refreshExp).Seconds()),
		HttpOnly: true,
		Secure:   s.Cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Server) clearAuthCookies(w http.ResponseWriter) {
	for _, c := range []struct{ name, path string }{{cookieAccess, "/"}, {cookieRefresh, refreshPath}} {
		http.SetCookie(w, &http.Cookie{
			Name: c.name, Value: "", Path: c.path, Domain: s.Cfg.CookieDomain,
			MaxAge: -1, Expires: time.Unix(0, 0), HttpOnly: true, Secure: s.Cfg.CookieSecure, SameSite: http.SameSiteLaxMode,
		})
	}
}

// authMiddleware memvalidasi access token. Parameter relaxExpiry dipakai
// endpoint yang ingin memberi 401 spesifik untuk klien memicu refresh.
func (s *Server) authMiddleware(_ bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			traceID := TraceID(r.Context())
			raw := ""
			if c, err := r.Cookie(cookieAccess); err == nil {
				raw = c.Value
			} else if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
				raw = strings.TrimPrefix(h, "Bearer ")
			}
			if raw == "" {
				problem.Unauthorized("Sesi tidak ditemukan. Silakan masuk.", traceID).Write(w)
				return
			}
			claims, err := s.Tokens.ParseAccess(raw)
			if err != nil {
				if errors.Is(err, auth.ErrTokenExpired) {
					problem.Unauthorized("Sesi kedaluwarsa. Refresh token diperlukan.", traceID).Write(w)
					return
				}
				problem.Unauthorized("Token tidak valid.", traceID).Write(w)
				return
			}
			userID, err1 := uuid.Parse(claims.Subject)
			wsID, err2 := uuid.Parse(claims.WorkspaceID)
			if err1 != nil || err2 != nil {
				problem.Unauthorized("Token tidak valid.", traceID).Write(w)
				return
			}
			role, err := rbac.ParseRole(claims.Role)
			if err != nil {
				problem.Unauthorized("Role pada token tidak dikenal.", traceID).Write(w)
				return
			}
			ctx := withIdentity(r.Context(), Identity{
				UserID: userID, WorkspaceID: wsID, Role: role, IsDemo: claims.IsDemo,
			})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
