package auth

import (
	"strings"
	"testing"
	"time"
)

func TestHashAndVerify(t *testing.T) {
	h := DefaultHasher()
	hash, err := h.Hash("rahasia-kuat-123")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if !strings.HasPrefix(hash, "argon2id$v=19$m=65536,t=3,p=2$") {
		t.Fatalf("format hash tidak sesuai: %s", hash)
	}
	ok, err := h.Verify("rahasia-kuat-123", hash)
	if err != nil || !ok {
		t.Fatalf("password benar harus lolos: ok=%v err=%v", ok, err)
	}
	ok, err = h.Verify("salah-password", hash)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if ok {
		t.Fatal("password salah tidak boleh lolos")
	}
}

func TestHashRejectsShortPassword(t *testing.T) {
	if _, err := DefaultHasher().Hash("pendek"); err == nil {
		t.Fatal("password < 8 karakter harus ditolak")
	}
}

func TestHashUniqueSalt(t *testing.T) {
	h := DefaultHasher()
	a, _ := h.Hash("rahasia-kuat-123")
	b, _ := h.Hash("rahasia-kuat-123")
	if a == b {
		t.Fatal("dua hash dari password sama tidak boleh identik (salt harus acak)")
	}
}

func TestVerifyRejectsMalformed(t *testing.T) {
	h := DefaultHasher()
	for _, bad := range []string{"", "plaintext", "bcrypt$xx", "argon2id$v=19$m=1,t=1,p=1"} {
		if _, err := h.Verify("apa-saja", bad); err == nil {
			t.Errorf("format %q harus error", bad)
		}
	}
}

func TestNeedsRehash(t *testing.T) {
	h := DefaultHasher()
	hash, _ := h.Hash("rahasia-kuat-123")
	if h.NeedsRehash(hash) {
		t.Fatal("hash dengan parameter terkini tidak perlu rehash")
	}
	weak := strings.Replace(hash, "m=65536,t=3,p=2", "m=8192,t=1,p=1", 1)
	if !h.NeedsRehash(weak) {
		t.Fatal("hash dengan parameter lemah harus perlu rehash")
	}
}

func TestAccessTokenRoundTrip(t *testing.T) {
	iss := NewTokenIssuer("test-secret-0123456789", 15*time.Minute)
	raw, exp, err := iss.SignAccess("user-1", "ws-1", "analyst", false)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	if time.Until(exp) < 14*time.Minute {
		t.Fatalf("TTL tidak sesuai: %v", time.Until(exp))
	}
	claims, err := iss.ParseAccess(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if claims.Subject != "user-1" || claims.WorkspaceID != "ws-1" || claims.Role != "analyst" {
		t.Fatalf("claims tidak sesuai: %+v", claims)
	}
}

func TestAccessTokenRejectsWrongSecret(t *testing.T) {
	iss := NewTokenIssuer("secret-a-0123456789", time.Minute)
	other := NewTokenIssuer("secret-b-0123456789", time.Minute)
	raw, _, _ := iss.SignAccess("u", "w", "viewer", false)
	if _, err := other.ParseAccess(raw); err == nil {
		t.Fatal("token dengan secret berbeda harus ditolak")
	}
}

func TestAccessTokenExpired(t *testing.T) {
	iss := NewTokenIssuer("secret-a-0123456789", -time.Minute)
	raw, _, _ := iss.SignAccess("u", "w", "viewer", false)
	if _, err := iss.ParseAccess(raw); err == nil {
		t.Fatal("token kedaluwarsa harus ditolak")
	}
}

func TestAccessTokenRejectsAlgNone(t *testing.T) {
	// token dengan alg=none tidak boleh diterima (validasi algoritma eksplisit)
	none := "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhdHRhY2tlciIsIndzIjoid3MifQ."
	iss := NewTokenIssuer("secret-a-0123456789", time.Minute)
	if _, err := iss.ParseAccess(none); err == nil {
		t.Fatal("alg=none harus ditolak")
	}
}

func TestRefreshTokenHashStable(t *testing.T) {
	rt, err := NewRefreshToken("pepper-0123456789", time.Hour)
	if err != nil {
		t.Fatalf("new refresh: %v", err)
	}
	if rt.Hash != HashRefreshToken("pepper-0123456789", rt.Plain) {
		t.Fatal("hash harus deterministik untuk token yang sama")
	}
	if rt.Hash == rt.Plain {
		t.Fatal("hash tidak boleh sama dengan token asli")
	}
	other, _ := NewRefreshToken("pepper-0123456789", time.Hour)
	if other.Hash == rt.Hash {
		t.Fatal("token berbeda harus menghasilkan hash berbeda")
	}
}

func TestDemoEmailFormat(t *testing.T) {
	e := NewDemoEmail()
	if !strings.HasPrefix(e, "demo-") || !strings.HasSuffix(e, "@demo.local") {
		t.Fatalf("format email demo salah: %s", e)
	}
	if e == NewDemoEmail() {
		t.Fatal("email demo harus unik per pengunjung")
	}
}
