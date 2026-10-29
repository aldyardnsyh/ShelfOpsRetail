package upload

import (
	"bytes"
	"errors"
	"io"
	"strings"
	"testing"
)

func pdfHead() []byte { return append([]byte("%PDF-1.7\n"), bytes.Repeat([]byte("A"), 600)...) }

// TC-KB-02: file .exe diberi ekstensi .pdf harus ditolak.
func TestExeRenamedAsPDFIsRejected(t *testing.T) {
	rule, err := FindRule(KindDocument, "laporan.pdf", "application/pdf")
	if err != nil {
		t.Fatalf("rule: %v", err)
	}
	exe := append([]byte{'M', 'Z', 0x90, 0x00}, bytes.Repeat([]byte{0x00}, 600)...)
	err = Validate(rule, exe, int64(len(exe)))
	if !errors.Is(err, ErrMagicMismatch) {
		t.Fatalf("harus ditolak magic bytes, dapat: %v", err)
	}
}

func TestPDFAccepted(t *testing.T) {
	rule, _ := FindRule(KindDocument, "sop.pdf", "application/pdf")
	head := pdfHead()
	if err := Validate(rule, head, int64(len(head))); err != nil {
		t.Fatalf("PDF valid harus lolos: %v", err)
	}
}

func TestEncryptedPDFRejected(t *testing.T) {
	rule, _ := FindRule(KindDocument, "sop.pdf", "application/pdf")
	head := append([]byte("%PDF-1.7\n/Encrypt 5 0 R\n"), bytes.Repeat([]byte("A"), 600)...)
	if err := Validate(rule, head, int64(len(head))); !errors.Is(err, ErrSuspiciousContent) {
		t.Fatalf("PDF terenkripsi harus ditolak, dapat: %v", err)
	}
}

func TestDocxRequiresZipMagic(t *testing.T) {
	rule, err := FindRule(KindDocument, "sop.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	if err != nil {
		t.Fatalf("rule: %v", err)
	}
	if err := Validate(rule, []byte("%PDF-1.7 nope"), 100); !errors.Is(err, ErrMagicMismatch) {
		t.Fatalf("docx palsu harus ditolak, dapat: %v", err)
	}
	zip := append([]byte{'P', 'K', 0x03, 0x04}, bytes.Repeat([]byte{0x01}, 200)...)
	if err := Validate(rule, zip, int64(len(zip))); err != nil {
		t.Fatalf("docx valid harus lolos: %v", err)
	}
}

func TestImageMagic(t *testing.T) {
	jpg, _ := FindRule(KindImage, "rak.jpg", "image/jpeg")
	png, _ := FindRule(KindImage, "rak.png", "image/png")
	webp, _ := FindRule(KindImage, "rak.webp", "image/webp")

	if err := Validate(jpg, []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10}, 1024); err != nil {
		t.Fatalf("JPEG valid harus lolos: %v", err)
	}
	if err := Validate(png, []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0x00}, 1024); err != nil {
		t.Fatalf("PNG valid harus lolos: %v", err)
	}
	validWebp := append([]byte("RIFF\x00\x00\x00\x00WEBP"), bytes.Repeat([]byte{0}, 4)...)
	if err := Validate(webp, validWebp, 1024); err != nil {
		t.Fatalf("WEBP valid harus lolos: %v", err)
	}
	// JPEG palsu (header PDF) harus ditolak meski mime diklaim image/jpeg
	if err := Validate(jpg, pdfHead(), 1024); !errors.Is(err, ErrMagicMismatch) {
		t.Fatalf("JPEG palsu harus ditolak, dapat: %v", err)
	}
	if err := Validate(webp, append([]byte("RIFF\x00\x00\x00\x00WAVE"), bytes.Repeat([]byte{0}, 4)...), 1024); !errors.Is(err, ErrMagicMismatch) {
		t.Fatalf("WAV dengan ekstensi .webp harus ditolak, dapat: %v", err)
	}
}

func TestSizeLimits(t *testing.T) {
	rule, _ := FindRule(KindDocument, "sop.pdf", "application/pdf")
	if err := Validate(rule, pdfHead(), 21<<20); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("dokumen >20MB harus ditolak, dapat: %v", err)
	}
	img, _ := FindRule(KindImage, "rak.jpg", "image/jpeg")
	if err := Validate(img, []byte{0xFF, 0xD8, 0xFF}, 11<<20); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("gambar >10MB harus ditolak, dapat: %v", err)
	}
	if err := Validate(rule, pdfHead(), 0); !errors.Is(err, ErrMagicMismatch) {
		t.Fatalf("berkas kosong harus ditolak, dapat: %v", err)
	}
}

func TestExtensionAndMimeMismatch(t *testing.T) {
	if _, err := FindRule(KindDocument, "script.sh", "text/x-sh"); err == nil {
		t.Fatal("ekstensi .sh harus ditolak")
	}
	if _, err := FindRule(KindDocument, "noext", "application/pdf"); err == nil {
		t.Fatal("berkas tanpa ekstensi harus ditolak")
	}
	if _, err := FindRule(KindDocument, "sop.pdf", "image/png"); err == nil {
		t.Fatal("mime tidak cocok ekstensi harus ditolak")
	}
}

func TestTextRejectsBinary(t *testing.T) {
	rule, _ := FindRule(KindDocument, "catatan.txt", "text/plain")
	bin := append([]byte("halo"), 0x00, 0x01, 0x02)
	if err := Validate(rule, bin, int64(len(bin))); !errors.Is(err, ErrMagicMismatch) {
		t.Fatalf("txt biner harus ditolak, dapat: %v", err)
	}
	txt := []byte(strings.Repeat("baris teks biasa\n", 20))
	if err := Validate(rule, txt, int64(len(txt))); err != nil {
		t.Fatalf("txt valid harus lolos: %v", err)
	}
}

// ReadHead harus mengembalikan reader yang bisa membaca ulang SELURUH isi
// (head + sisa), sehingga handler bisa memvalidasi magic bytes lalu menyimpan
// berkas utuh tanpa buffering penuh.
func TestReadHeadReplaysWholeStream(t *testing.T) {
	original := []byte("0123456789abcdef")
	head, replay, err := ReadHead(bytes.NewReader(original), 8)
	if err != nil {
		t.Fatalf("read head: %v", err)
	}
	if string(head) != "01234567" {
		t.Fatalf("head salah: %q", head)
	}
	got, _ := io.ReadAll(replay)
	if string(got) != string(original) {
		t.Fatalf("reader hasil harus memutar ulang seluruh isi, dapat %q", got)
	}
}

func TestReadHeadHandlesShortFiles(t *testing.T) {
	head, replay, err := ReadHead(bytes.NewReader([]byte("ab")), 8)
	if err != nil {
		t.Fatalf("berkas pendek tidak boleh error: %v", err)
	}
	if string(head) != "ab" {
		t.Fatalf("head salah: %q", head)
	}
	got, _ := io.ReadAll(replay)
	if string(got) != "ab" {
		t.Fatalf("isi harus utuh, dapat %q", got)
	}
}
