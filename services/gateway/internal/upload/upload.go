// Package upload: validasi berkas unggahan (PRD §17 "Upload berbahaya").
// Ekstensi saja tidak cukup — magic bytes wajib cocok (TC-KB-02).
package upload

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

var (
	ErrTooLarge          = errors.New("berkas melebihi batas ukuran")
	ErrUnsupportedType   = errors.New("tipe berkas tidak didukung")
	ErrMagicMismatch     = errors.New("isi berkas tidak cocok dengan ekstensi/mime")
	ErrSuspiciousContent = errors.New("isi berkas mengandung pola berbahaya")
)

type Kind string

const (
	KindDocument Kind = "document"
	KindImage    Kind = "image"
)

type Rule struct {
	Kind      Kind
	Extension string   // ".pdf"
	Mimes     []string // mime yang diterima dari klien
	MaxBytes  int64
}

// docRules: FR-KB-01 — PDF/DOCX/MD/TXT ≤ 20 MB.
var docRules = []Rule{
	{Kind: KindDocument, Extension: ".pdf", Mimes: []string{"application/pdf"}, MaxBytes: 20 << 20},
	{Kind: KindDocument, Extension: ".docx", Mimes: []string{"application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip"}, MaxBytes: 20 << 20},
	{Kind: KindDocument, Extension: ".md", Mimes: []string{"text/markdown", "text/plain"}, MaxBytes: 20 << 20},
	{Kind: KindDocument, Extension: ".txt", Mimes: []string{"text/plain"}, MaxBytes: 20 << 20},
}

// imageRules: FR-AUD-02 — JPG/PNG/WEBP ≤ 10 MB.
var imageRules = []Rule{
	{Kind: KindImage, Extension: ".jpg", Mimes: []string{"image/jpeg"}, MaxBytes: 10 << 20},
	{Kind: KindImage, Extension: ".jpeg", Mimes: []string{"image/jpeg"}, MaxBytes: 10 << 20},
	{Kind: KindImage, Extension: ".png", Mimes: []string{"image/png"}, MaxBytes: 10 << 20},
	{Kind: KindImage, Extension: ".webp", Mimes: []string{"image/webp"}, MaxBytes: 10 << 20},
}

func RulesFor(kind Kind) []Rule {
	if kind == KindImage {
		return imageRules
	}
	return docRules
}

// FindRule mencari aturan berdasar ekstensi + mime (case-insensitive).
func FindRule(kind Kind, filename, mime string) (Rule, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == "" {
		return Rule{}, fmt.Errorf("%w: ekstensi hilang", ErrUnsupportedType)
	}
	mime = strings.ToLower(strings.TrimSpace(strings.Split(mime, ";")[0]))
	for _, r := range RulesFor(kind) {
		if r.Extension != ext {
			continue
		}
		if mime == "" {
			return r, nil
		}
		for _, m := range r.Mimes {
			if m == mime {
				return r, nil
			}
		}
		return Rule{}, fmt.Errorf("%w: mime %q tidak cocok dengan %s", ErrUnsupportedType, mime, ext)
	}
	return Rule{}, fmt.Errorf("%w: ekstensi %s tidak diizinkan", ErrUnsupportedType, ext)
}

// Validate memeriksa ukuran, magic bytes, dan pola berbahaya pada header berkas.
// head minimal 512 byte (boleh kurang untuk berkas mungil).
func Validate(rule Rule, head []byte, declaredSize int64) error {
	if declaredSize > rule.MaxBytes {
		return fmt.Errorf("%w: maksimal %d MB", ErrTooLarge, rule.MaxBytes>>20)
	}
	if declaredSize <= 0 {
		return fmt.Errorf("%w: berkas kosong", ErrMagicMismatch)
	}
	if int64(len(head)) > rule.MaxBytes {
		return fmt.Errorf("%w: maksimal %d MB", ErrTooLarge, rule.MaxBytes>>20)
	}
	switch rule.Extension {
	case ".pdf":
		if !bytes.HasPrefix(head, []byte("%PDF-")) {
			return fmt.Errorf("%w: %s bukan PDF", ErrMagicMismatch, rule.Extension)
		}
		if bytes.Contains(head[:min(len(head), 1024)], []byte("/Encrypt")) {
			// Dokumen terenkripsi tidak bisa di-parse (PRD §8.5) — tolak lebih awal.
			return fmt.Errorf("%w: PDF terenkripsi", ErrSuspiciousContent)
		}
	case ".docx":
		if len(head) < 4 || !bytes.Equal(head[:4], []byte{'P', 'K', 0x03, 0x04}) {
			return fmt.Errorf("%w: %s bukan arsip DOCX valid", ErrMagicMismatch, rule.Extension)
		}
	case ".png":
		if !bytes.HasPrefix(head, []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}) {
			return fmt.Errorf("%w: bukan PNG", ErrMagicMismatch)
		}
	case ".jpg", ".jpeg":
		if len(head) < 3 || head[0] != 0xFF || head[1] != 0xD8 || head[2] != 0xFF {
			return fmt.Errorf("%w: bukan JPEG", ErrMagicMismatch)
		}
	case ".webp":
		if len(head) < 12 || !bytes.HasPrefix(head, []byte("RIFF")) || !bytes.Equal(head[8:12], []byte("WEBP")) {
			return fmt.Errorf("%w: bukan WEBP", ErrMagicMismatch)
		}
	case ".md", ".txt":
		probe := head
		if len(probe) > 4096 {
			probe = probe[:4096]
		}
		if bytes.IndexByte(probe, 0x00) >= 0 {
			return fmt.Errorf("%w: teks mengandung byte NUL (kemungkinan biner)", ErrMagicMismatch)
		}
		if !utf8.Valid(probe) && !strings.HasPrefix(strings.ToLower(rule.Extension), ".md") {
			// TXT non-UTF8 ditolak; MD dari editor lawas masih ditoleransi.
			return fmt.Errorf("%w: teks bukan UTF-8", ErrMagicMismatch)
		}
	}
	return nil
}

// ReadHead membaca n byte pertama tanpa menghabiskan reader (dipakai handler).
func ReadHead(r io.Reader, n int) ([]byte, io.Reader, error) {
	buf := make([]byte, n)
	read, err := io.ReadFull(r, buf)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		return nil, nil, err
	}
	head := buf[:read]
	return head, io.MultiReader(bytes.NewReader(head), r), nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
