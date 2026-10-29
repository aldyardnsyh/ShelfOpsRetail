package httpx

import (
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/problem"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/ratelimit"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/rbac"
)

// TraceID menetapkan trace-id dari header X-Request-Id (bila valid) atau
// membuat UUIDv7 baru, lalu memasukkannya ke context dan header respons
// (TC-OBS-01: trace-id sama di web, gateway, ai-*, log).
func TraceIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := sanitizeRequestID(r.Header.Get("X-Request-Id"))
		if id == "" {
			id = uuid.Must(uuid.NewV7()).String()
		}
		w.Header().Set("X-Request-Id", id)
		next.ServeHTTP(w, r.WithContext(WithTraceID(r.Context(), id)))
	})
}

func sanitizeRequestID(v string) string {
	v = strings.TrimSpace(v)
	if len(v) == 0 || len(v) > 64 {
		return ""
	}
	for _, c := range v {
		if !(c == '-' || c == '_' || c == '.' || (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
			return ""
		}
	}
	return v
}

type statusWriter struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (sw *statusWriter) WriteHeader(code int) {
	sw.status = code
	sw.ResponseWriter.WriteHeader(code)
}

func (sw *statusWriter) Write(b []byte) (int, error) {
	if sw.status == 0 {
		sw.status = http.StatusOK
	}
	n, err := sw.ResponseWriter.Write(b)
	sw.bytes += n
	return n, err
}

func (sw *statusWriter) Flush() {
	if f, ok := sw.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Logger menulis log JSON terstruktur dengan trace-id (NFR observability).
func Logger(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			sw := &statusWriter{ResponseWriter: w}
			next.ServeHTTP(sw, r)
			lvl := slog.LevelInfo
			if sw.status >= 500 {
				lvl = slog.LevelError
			} else if sw.status >= 400 {
				lvl = slog.LevelWarn
			}
			attrs := []any{
				"http.method", r.Method,
				"http.path", r.URL.Path,
				"http.status", sw.status,
				"duration_ms", time.Since(start).Milliseconds(),
				"trace_id", TraceID(r.Context()),
				"client_ip", ClientIP(r),
			}
			if id, ok := IdentityFrom(r.Context()); ok {
				attrs = append(attrs, "user_id", id.UserID.String(), "workspace_id", id.WorkspaceID.String(), "role", string(id.Role))
			}
			log.Log(r.Context(), lvl, "request", attrs...)
		})
	}
}

// Recoverer mengubah panic menjadi problem+json 500, bukan halaman HTML.
func Recoverer(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					log.Error("panic", "trace_id", TraceID(r.Context()), "error", rec, "stack", string(debug.Stack()))
					problem.Internal(TraceID(r.Context())).Write(w)
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// SecurityHeaders mengikuti tabel PRD §17 (transport & hardening).
func SecurityHeaders(production bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("X-Frame-Options", "DENY")
			h.Set("Referrer-Policy", "no-referrer")
			h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
			h.Set("Cross-Origin-Resource-Policy", "same-site")
			h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
			if production {
				h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
			}
			next.ServeHTTP(w, r)
		})
	}
}

// CORS ketat: hanya origin web yang dikonfigurasi (PRD §16.2).
func CORS(allowed []string) func(http.Handler) http.Handler {
	allow := map[string]bool{}
	for _, a := range allowed {
		allow[strings.TrimRight(strings.TrimSpace(a), "/")] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := strings.TrimRight(r.Header.Get("Origin"), "/")
			if origin != "" && allow[origin] {
				h := w.Header()
				h.Set("Access-Control-Allow-Origin", origin)
				h.Set("Access-Control-Allow-Credentials", "true")
				h.Set("Vary", "Origin")
				h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
				h.Set("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key, X-Request-Id, X-Upload-Token, X-Admin-Token")
				h.Set("Access-Control-Expose-Headers", "X-Request-Id, Retry-After")
				h.Set("Access-Control-Max-Age", "600")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ClientIP mengambil IP asli di belakang Caddy (X-Forwarded-For).
func ClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i > 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	if xr := r.Header.Get("X-Real-Ip"); xr != "" {
		return strings.TrimSpace(xr)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// RateLimitByIP membatasi permintaan per IP (login/demo/upload).
func RateLimitByIP(l *ratelimit.Limiter, message string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := ClientIP(r)
			if ok, retry := l.Allow(key); !ok {
				problem.TooManyRequests(message, TraceID(r.Context()), retry).Write(w)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RateLimitByUser membatasi per identitas (kuota AI per sesi demo, BR-08).
func RateLimitByUser(l *ratelimit.Limiter, message string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id, ok := IdentityFrom(r.Context())
			if !ok {
				problem.Unauthorized("Sesi tidak ditemukan.", TraceID(r.Context())).Write(w)
				return
			}
			if ok, retry := l.Allow(id.UserID.String()); !ok {
				problem.TooManyRequests(message, TraceID(r.Context()), retry).Write(w)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequirePermission menolak request bila role tidak punya izin (PRD §13.1).
func RequirePermission(perm rbac.Permission) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id, ok := IdentityFrom(r.Context())
			if !ok {
				problem.Unauthorized("Sesi tidak ditemukan.", TraceID(r.Context())).Write(w)
				return
			}
			if !rbac.Can(id.Role, perm) {
				problem.Forbidden("Role "+string(id.Role)+" tidak boleh mengakses aksi ini.", TraceID(r.Context())).Write(w)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
