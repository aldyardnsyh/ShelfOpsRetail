// Package ratelimit: token bucket in-memory (PRD §16.3 — tanpa Redis).
package ratelimit

import (
	"sync"
	"time"
)

type bucket struct {
	tokens float64
	last   time.Time
}

// Limiter membatasi permintaan per kunci (IP, user, atau sesi).
type Limiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	rate    float64 // token per detik
	burst   float64
	lastGC  time.Time
}

// New membuat limiter dengan `perMinute` permintaan per menit dan burst = perMinute.
func New(perMinute int) *Limiter {
	if perMinute <= 0 {
		perMinute = 60
	}
	return &Limiter{
		buckets: make(map[string]*bucket),
		rate:    float64(perMinute) / 60.0,
		burst:   float64(perMinute),
		lastGC:  time.Now(),
	}
}

// Allow mengembalikan true bila permintaan boleh lanjut, dan retryAfter detik
// bila tidak.
func (l *Limiter) Allow(key string) (bool, int) {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	l.gcLocked(now)

	b, ok := l.buckets[key]
	if !ok {
		l.buckets[key] = &bucket{tokens: l.burst - 1, last: now}
		return true, 0
	}
	elapsed := now.Sub(b.last).Seconds()
	b.tokens = minFloat(l.burst, b.tokens+elapsed*l.rate)
	b.last = now
	if b.tokens < 1 {
		wait := (1 - b.tokens) / l.rate
		return false, int(wait + 1)
	}
	b.tokens--
	return true, 0
}

// Count mengembalikan jumlah kunci aktif (dipakai metrik internal).
func (l *Limiter) Count() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.buckets)
}

func (l *Limiter) gcLocked(now time.Time) {
	if now.Sub(l.lastGC) < 5*time.Minute {
		return
	}
	l.lastGC = now
	for k, b := range l.buckets {
		if now.Sub(b.last) > 15*time.Minute {
			delete(l.buckets, k)
		}
	}
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
