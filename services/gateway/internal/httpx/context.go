package httpx

import (
	"context"

	"github.com/google/uuid"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/rbac"
)

type ctxKey int

const (
	ctxKeyTraceID ctxKey = iota
	ctxKeyUser
	ctxKeyWorkspace
)

// Identity adalah subjek terautentikasi pada request.
type Identity struct {
	UserID      uuid.UUID
	WorkspaceID uuid.UUID
	Role        rbac.Role
	IsDemo      bool
	Email       string
}

func WithTraceID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, ctxKeyTraceID, id)
}

// TraceID mengembalikan trace-id request (selalu ada setelah middleware TraceID).
func TraceID(ctx context.Context) string {
	if v, ok := ctx.Value(ctxKeyTraceID).(string); ok {
		return v
	}
	return ""
}

func withIdentity(ctx context.Context, id Identity) context.Context {
	return context.WithValue(ctx, ctxKeyUser, id)
}

// IdentityFrom mengembalikan identitas atau false bila belum terautentikasi.
func IdentityFrom(ctx context.Context) (Identity, bool) {
	id, ok := ctx.Value(ctxKeyUser).(Identity)
	return id, ok
}
