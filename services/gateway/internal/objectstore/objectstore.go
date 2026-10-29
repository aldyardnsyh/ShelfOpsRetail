// Package objectstore: abstraksi penyimpanan berkas (PRD §14.2).
// Profil hemat memakai LocalFS; S3/R2 ditambahkan lewat antarmuka yang sama.
package objectstore

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

var (
	ErrNotFound    = errors.New("objek tidak ditemukan")
	ErrInvalidKey  = errors.New("kunci objek tidak valid")
	ErrUnsupported = errors.New("driver object store tidak didukung")
)

// ObjectStore adalah antarmuka minimal yang dipakai gateway & worker.
type ObjectStore interface {
	// Put menyimpan objek. size -1 berarti tidak diketahui.
	Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) error
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
	// LocalPath mengembalikan path filesystem bila driver mendukungnya
	// (dipakai ai-rag/ai-vision container yang share volume /data).
	LocalPath(key string) (string, bool)
	Driver() string
}

// LocalFS menyimpan berkas di disk, di luar webroot (PRD §17).
type LocalFS struct {
	root string
}

func NewLocalFS(root string) (*LocalFS, error) {
	if root == "" {
		return nil, fmt.Errorf("root object store kosong")
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve root: %w", err)
	}
	if err := os.MkdirAll(abs, 0o750); err != nil {
		return nil, fmt.Errorf("buat direktori root: %w", err)
	}
	return &LocalFS{root: abs}, nil
}

func (l *LocalFS) Driver() string { return "local" }

func (l *LocalFS) Put(_ context.Context, key string, r io.Reader, _ int64, _ string) error {
	full, err := l.resolve(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o750); err != nil {
		return fmt.Errorf("buat direktori objek: %w", err)
	}
	tmp := full + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o640)
	if err != nil {
		return fmt.Errorf("buka file sementara: %w", err)
	}
	if _, err := io.Copy(f, r); err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		return fmt.Errorf("tulis objek: %w", err)
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("tutup objek: %w", err)
	}
	// Rename atomik agar pembaca tidak melihat berkas separuh jadi.
	if err := os.Rename(tmp, full); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("finalisasi objek: %w", err)
	}
	return nil
}

func (l *LocalFS) Get(_ context.Context, key string) (io.ReadCloser, error) {
	full, err := l.resolve(key)
	if err != nil {
		return nil, err
	}
	f, err := os.Open(full)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return f, nil
}

func (l *LocalFS) Delete(_ context.Context, key string) error {
	full, err := l.resolve(key)
	if err != nil {
		return err
	}
	if err := os.Remove(full); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return nil
}

func (l *LocalFS) LocalPath(key string) (string, bool) {
	full, err := l.resolve(key)
	if err != nil {
		return "", false
	}
	return full, true
}

// resolve menjaga agar kunci tidak bisa keluar dari root (path traversal).
func (l *LocalFS) resolve(key string) (string, error) {
	if key == "" {
		return "", ErrInvalidKey
	}
	clean := filepath.Clean("/" + strings.ReplaceAll(key, "\\", "/"))
	clean = strings.TrimPrefix(clean, "/")
	if clean == "" || strings.Contains(clean, "..") {
		return "", fmt.Errorf("%w: %s", ErrInvalidKey, key)
	}
	full := filepath.Join(l.root, filepath.FromSlash(clean))
	rel, err := filepath.Rel(l.root, full)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", fmt.Errorf("%w: %s", ErrInvalidKey, key)
	}
	return full, nil
}
