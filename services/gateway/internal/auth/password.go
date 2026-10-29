// Package auth: hashing password (argon2id), access token JWT, refresh token
// opaque dengan rotasi (PRD §17).
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

var (
	ErrInvalidHashFormat = errors.New("format hash tidak dikenal")
	ErrIncompatibleAlgo  = errors.New("algoritma hash tidak cocok")
)

// Params mengikuti rekomendasi OWASP untuk argon2id (min 19 MiB, t=2).
// Di sini 64 MiB / t=3 / p=2: VPS 2 GB hanya melayani login sesekali.
type Params struct {
	Memory      uint32
	Iterations  uint32
	Parallelism uint8
	SaltLength  uint32
	KeyLength   uint32
}

func DefaultParams() Params {
	return Params{Memory: 64 * 1024, Iterations: 3, Parallelism: 2, SaltLength: 16, KeyLength: 32}
}

type Hasher struct{ p Params }

func NewHasher(p Params) Hasher { return Hasher{p: p} }

func DefaultHasher() Hasher { return NewHasher(DefaultParams()) }

// Hash menghasilkan string format PHC: argon2id$v=19$m=...,t=...,p=...$salt$hash
func (h Hasher) Hash(password string) (string, error) {
	if len(password) < 8 {
		return "", fmt.Errorf("password minimal 8 karakter")
	}
	salt := make([]byte, h.p.SaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("gagal membuat salt: %w", err)
	}
	key := argon2.IDKey([]byte(password), salt, h.p.Iterations, h.p.Memory, h.p.Parallelism, h.p.KeyLength)
	return fmt.Sprintf("argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, h.p.Memory, h.p.Iterations, h.p.Parallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	), nil
}

// Verify membandingkan password dengan hash tersimpan (constant time).
func (h Hasher) Verify(password, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 5 {
		return false, ErrInvalidHashFormat
	}
	if parts[0] != "argon2id" {
		return false, ErrIncompatibleAlgo
	}
	var version int
	if _, err := fmt.Sscanf(parts[1], "v=%d", &version); err != nil {
		return false, ErrInvalidHashFormat
	}
	if version != argon2.Version {
		return false, ErrIncompatibleAlgo
	}
	var p Params
	if _, err := fmt.Sscanf(parts[2], "m=%d,t=%d,p=%d", &p.Memory, &p.Iterations, &p.Parallelism); err != nil {
		return false, ErrInvalidHashFormat
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[3])
	if err != nil {
		return false, ErrInvalidHashFormat
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, ErrInvalidHashFormat
	}
	p.SaltLength = uint32(len(salt))
	p.KeyLength = uint32(len(want))
	got := argon2.IDKey([]byte(password), salt, p.Iterations, p.Memory, p.Parallelism, p.KeyLength)
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

// NeedsRehash dipakai saat parameter dinaikkan (kontrol biaya login di VPS).
func (h Hasher) NeedsRehash(encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 5 {
		return true
	}
	var memory, iterations uint32
	var parallelism uint8
	if _, err := fmt.Sscanf(parts[2], "m=%d,t=%d,p=%d", &memory, &iterations, &parallelism); err != nil {
		return true
	}
	return memory < h.p.Memory || iterations < h.p.Iterations
}
