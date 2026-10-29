package httpx

import (
	"net/http"
	"strconv"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/problem"
)

// pageParams membaca ?limit= serta ?offset= / ?cursor= (cursor = offset
// numerik sederhana). Cocok untuk demo; produksi bisa diganti cursor keyset
// tanpa mengubah handler.
func pageParams(r *http.Request, def, max int) (limit, offset int, perr *problem.Error) {
	traceID := TraceID(r.Context())
	limit, offset = def, 0
	if raw := r.URL.Query().Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > max {
			return 0, 0, problem.Validation(traceID, problem.FieldError{
				Field: "limit", Message: "harus bilangan 1-" + strconv.Itoa(max),
			})
		}
		limit = n
	}
	if raw := r.URL.Query().Get("offset"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 {
			return 0, 0, problem.Validation(traceID, problem.FieldError{
				Field: "offset", Message: "harus bilangan bulat >= 0",
			})
		}
		offset = n
	}
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 {
			return 0, 0, problem.Validation(traceID, problem.FieldError{
				Field: "cursor", Message: "cursor tidak valid",
			})
		}
		offset = n
	}
	return limit, offset, nil
}

func nextCursor(offset, returned, limit int) *string {
	if returned < limit {
		return nil
	}
	s := strconv.Itoa(offset + returned)
	return &s
}

type pageResponse[T any] struct {
	Items      []T     `json:"items"`
	NextCursor *string `json:"next_cursor"`
}
