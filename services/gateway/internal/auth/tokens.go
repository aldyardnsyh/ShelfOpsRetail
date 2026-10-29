package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/rbac"
)

var (
	ErrTokenInvalid = errors.New("token tidak valid")
	ErrTokenExpired = errors.New("token kedaluwarsa")
)

type Claims struct {
	jwt.RegisteredClaims
	WorkspaceID string `json:"ws"`
	Role        string `json:"role"`
	IsDemo      bool   `json:"demo"`
}

type TokenIssuer struct {
	secret    []byte
	accessTTL time.Duration
}

func NewTokenIssuer(secret string, accessTTL time.Duration) *TokenIssuer {
	return &TokenIssuer{secret: []byte(secret), accessTTL: accessTTL}
}

func (t *TokenIssuer) AccessTTL() time.Duration { return t.accessTTL }

// SignAccess membuat JWT HS256 dengan sub=user_id, ws=workspace_id, role.
func (t *TokenIssuer) SignAccess(userID, workspaceID string, role rbac.Role, isDemo bool) (string, time.Time, error) {
	now := time.Now()
	exp := now.Add(t.accessTTL)
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			Issuer:    "shelfops-gateway",
			Audience:  jwt.ClaimStrings{"shelfops-web"},
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now.Add(-30 * time.Second)),
			ExpiresAt: jwt.NewNumericDate(exp),
			ID:        uuid.Must(uuid.NewV7()).String(),
		},
		WorkspaceID: workspaceID,
		Role:        string(role),
		IsDemo:      isDemo,
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(t.secret)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("gagal menandatangani access token: %w", err)
	}
	return signed, exp, nil
}

func (t *TokenIssuer) ParseAccess(raw string) (*Claims, error) {
	tok, err := jwt.ParseWithClaims(raw, &Claims{}, func(token *jwt.Token) (any, error) {
		if token.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("algoritma tidak didukung: %s", token.Method.Alg())
		}
		return t.secret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithIssuer("shelfops-gateway"))
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrTokenExpired
		}
		return nil, fmt.Errorf("%w: %v", ErrTokenInvalid, err)
	}
	claims, ok := tok.Claims.(*Claims)
	if !ok || !tok.Valid {
		return nil, ErrTokenInvalid
	}
	if claims.Subject == "" || claims.WorkspaceID == "" {
		return nil, ErrTokenInvalid
	}
	return claims, nil
}

// RefreshToken adalah token opaque 32 byte; yang disimpan di DB hanya HMAC-nya.
type RefreshToken struct {
	Plain     string
	Hash      string
	ExpiresAt time.Time
}

// Pepper (SessionSecret) membuat hash token tidak berguna bila baris DB bocor
// tanpa akses ke secret aplikasi.
func NewRefreshToken(pepper string, ttl time.Duration) (RefreshToken, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return RefreshToken{}, fmt.Errorf("gagal membuat refresh token: %w", err)
	}
	plain := base64.RawURLEncoding.EncodeToString(buf)
	return RefreshToken{
		Plain:     plain,
		Hash:      HashRefreshToken(pepper, plain),
		ExpiresAt: time.Now().Add(ttl),
	}, nil
}

func HashRefreshToken(pepper, plain string) string {
	mac := hmac.New(sha256.New, []byte(pepper))
	mac.Write([]byte(plain))
	return hex.EncodeToString(mac.Sum(nil))
}

// NewDemoEmail membuat identitas demo per pengunjung (PRD §16.6, D-017).
// Bagian acak (bukan timestamp) dipakai agar unik walau dibuat pada milidetik yang sama.
func NewDemoEmail() string {
	id := uuid.Must(uuid.NewV7()).String()
	rand := strings.ReplaceAll(id[len(id)-13:], "-", "")
	return fmt.Sprintf("demo-%s@demo.local", rand)
}
