// Package problem mengimplementasikan error RFC 9457 (problem+json) dengan
// trace_id, dipakai seluruh handler (PRD §11.1).
package problem

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

const ContentType = "application/problem+json"

type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// Error adalah representasi problem+json.
type Error struct {
	Type              string       `json:"type"`
	Title             string       `json:"title"`
	Status            int          `json:"status"`
	Detail            string       `json:"detail,omitempty"`
	Instance          string       `json:"instance,omitempty"`
	TraceID           string       `json:"trace_id"`
	RetryAfterSeconds int          `json:"retry_after_seconds,omitempty"`
	Errors            []FieldError `json:"errors,omitempty"`
}

func (e *Error) Error() string { return e.Title + ": " + e.Detail }

func (e *Error) Write(w http.ResponseWriter) {
	if e.Type == "" {
		e.Type = "about:blank"
	}
	w.Header().Set("Content-Type", ContentType)
	if e.RetryAfterSeconds > 0 {
		w.Header().Set("Retry-After", itoa(e.RetryAfterSeconds))
	}
	w.WriteHeader(e.Status)
	if err := json.NewEncoder(w).Encode(e); err != nil {
		slog.Error("gagal menulis problem+json", "error", err)
	}
}

func New(status int, title, detail, traceID string) *Error {
	return &Error{Type: "about:blank", Title: title, Status: status, Detail: detail, TraceID: traceID}
}

func BadRequest(detail, traceID string) *Error {
	return New(http.StatusBadRequest, "Permintaan tidak valid", detail, traceID)
}

func Unauthorized(detail, traceID string) *Error {
	return New(http.StatusUnauthorized, "Belum terautentikasi", detail, traceID)
}

func Forbidden(detail, traceID string) *Error {
	return New(http.StatusForbidden, "Tidak punya izin", detail, traceID)
}

// NotFound sengaja dipakai untuk resource milik workspace lain agar tidak
// membocorkan keberadaannya (TC-AUTH-05).
func NotFound(detail, traceID string) *Error {
	return New(http.StatusNotFound, "Tidak ditemukan", detail, traceID)
}

func Conflict(detail, traceID string) *Error {
	return New(http.StatusConflict, "Konflik status", detail, traceID)
}

func UnsupportedMedia(detail, traceID string) *Error {
	return New(http.StatusUnsupportedMediaType, "Tipe berkas tidak didukung", detail, traceID)
}

func TooManyRequests(detail, traceID string, retryAfter int) *Error {
	e := New(http.StatusTooManyRequests, "Terlalu banyak permintaan", detail, traceID)
	e.RetryAfterSeconds = retryAfter
	return e
}

func ServiceUnavailable(detail, traceID string) *Error {
	return New(http.StatusServiceUnavailable, "Layanan tidak tersedia", detail, traceID)
}

func Validation(traceID string, errs ...FieldError) *Error {
	e := New(http.StatusUnprocessableEntity, "Validasi gagal", "Periksa kembali field yang ditandai.", traceID)
	e.Errors = errs
	return e
}

func Internal(traceID string) *Error {
	return New(http.StatusInternalServerError, "Kesalahan internal", "Terjadi kesalahan di server. Sertakan trace_id saat melapor.", traceID)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}
