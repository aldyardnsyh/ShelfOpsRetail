package httpx

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/jobs"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/problem"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/store"
	"github.com/aldyardnsyh/ShelfOpsRetail/services/gateway/internal/upload"
)

const maxUploadBody = 21 << 20 // 20 MB dokumen + overhead multipart

type documentUploadResponse struct {
	store.DocumentRow
	JobID       *string `json:"job_id"`
	Degradation string  `json:"degradation,omitempty"`
}

// documentDetailResponse menambahkan riwayat versi + status embedding pada
// detail dokumen. Field tambahan bersifat aditif terhadap skema Document.
type documentDetailResponse struct {
	store.DocumentRow
	Versions        []store.DocumentVersionRow `json:"versions"`
	EmbeddingStatus string                     `json:"embedding_status"`
}

func (s *Server) handleListDocuments(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	limit, offset, perr := pageParams(r, 20, 100)
	if perr != nil {
		perr.Write(w)
		return
	}
	status := r.URL.Query().Get("status")
	switch status {
	case "", "uploaded", "queued", "parsing", "chunking", "embedding", "ready", "failed":
	default:
		problem.Validation(traceID, problem.FieldError{Field: "status", Message: "status tidak dikenal"}).Write(w)
		return
	}
	docs, err := s.Store.ListDocuments(r.Context(), id.WorkspaceID, status, limit, offset)
	if err != nil {
		s.Log.Error("list documents", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, pageResponse[store.DocumentRow]{
		Items:      docs,
		NextCursor: nextCursor(offset, len(docs), limit),
	})
}

func (s *Server) handleGetDocument(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	docID := chiURLParam(r, "documentId")
	if _, err := uuid.Parse(docID); err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "documentId", Message: "harus UUID valid"}).Write(w)
		return
	}
	doc, err := s.Store.GetDocument(r.Context(), id.WorkspaceID, docID)
	if err != nil {
		if isNotFound(err) {
			problem.NotFound("Dokumen tidak ditemukan.", traceID).Write(w)
			return
		}
		s.Log.Error("get document", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	versions, err := s.Store.DocumentVersions(r.Context(), id.WorkspaceID, docID)
	if err != nil {
		s.Log.Error("list document versions", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	status, err := s.Store.DocumentEmbeddingStatus(r.Context(), id.WorkspaceID, docID)
	if err != nil {
		s.Log.Error("document embedding status", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, documentDetailResponse{
		DocumentRow:     *doc,
		Versions:        versions,
		EmbeddingStatus: status,
	})
}

// handleGetDocumentIndex mengembalikan chunk terindeks (versi aktif) untuk
// inspektur chunk di halaman knowledge detail. Bentuk respons mengikuti
// skema Chunk pada api/openapi.yaml.
func (s *Server) handleGetDocumentIndex(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	docID := chiURLParam(r, "documentId")
	if _, err := uuid.Parse(docID); err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "documentId", Message: "harus UUID valid"}).Write(w)
		return
	}
	limit, offset, perr := pageParams(r, 100, 500)
	if perr != nil {
		perr.Write(w)
		return
	}
	chunks, err := s.Store.DocumentChunks(r.Context(), id.WorkspaceID, docID, r.URL.Query().Get("q"), limit, offset)
	if err != nil {
		s.Log.Error("list document chunks", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	writeJSON(w, http.StatusOK, chunks)
}

func (s *Server) handleUploadDocument(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	if s.Objects == nil {
		problem.ServiceUnavailable("Object store belum dikonfigurasi.", traceID).Write(w)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBody)
	if err := r.ParseMultipartForm(4 << 20); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			problem.New(http.StatusRequestEntityTooLarge, "Berkas terlalu besar", "Maksimal 20 MB.", traceID).Write(w)
			return
		}
		problem.BadRequest("Form multipart tidak valid.", traceID).Write(w)
		return
	}
	if r.MultipartForm != nil {
		defer func() { _ = r.MultipartForm.RemoveAll() }()
	}
	file, fh, err := r.FormFile("file")
	if err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "file", Message: "berkas wajib diunggah"}).Write(w)
		return
	}
	defer file.Close()

	declaredMIME := fh.Header.Get("Content-Type")
	ruleMIME := declaredMIME
	if strings.EqualFold(strings.TrimSpace(strings.Split(declaredMIME, ";")[0]), "application/octet-stream") {
		// Klien multipart generik sering mengirim octet-stream; magick bytes
		// tetap diverifikasi di upload.Validate.
		ruleMIME = ""
	}
	rule, err := upload.FindRule(upload.KindDocument, fh.Filename, ruleMIME)
	if err != nil {
		// Dokumen hasil pindai (gambar) tetap boleh masuk KB.
		rule, err = upload.FindRule(upload.KindImage, fh.Filename, ruleMIME)
	}
	if err != nil {
		problem.UnsupportedMedia("Tipe berkas tidak didukung. Gunakan PDF, DOCX, MD, TXT, JPG, PNG, atau WEBP.", traceID).Write(w)
		return
	}
	head, replay, err := upload.ReadHead(file, 4096)
	if err != nil {
		problem.BadRequest("Berkas tidak dapat dibaca.", traceID).Write(w)
		return
	}
	if err := upload.Validate(rule, head, fh.Size); err != nil {
		switch {
		case errors.Is(err, upload.ErrTooLarge):
			problem.New(http.StatusRequestEntityTooLarge, "Berkas terlalu besar", "Maksimal 20 MB.", traceID).Write(w)
		case errors.Is(err, upload.ErrUnsupportedType):
			problem.UnsupportedMedia("Tipe berkas tidak didukung.", traceID).Write(w)
		default:
			problem.Validation(traceID, problem.FieldError{Field: "file", Message: err.Error()}).Write(w)
		}
		return
	}

	language := strings.TrimSpace(r.FormValue("language"))
	if language == "" {
		language = "id"
	}
	if language != "id" && language != "en" {
		problem.Validation(traceID, problem.FieldError{Field: "language", Message: "harus id atau en"}).Write(w)
		return
	}
	title := strings.TrimSpace(r.FormValue("title"))
	if title == "" {
		base := filepath.Base(fh.Filename)
		title = strings.TrimSuffix(base, filepath.Ext(base))
	}
	if len(title) > 200 {
		problem.Validation(traceID, problem.FieldError{Field: "title", Message: "maksimal 200 karakter"}).Write(w)
		return
	}

	objectKey := fmt.Sprintf("documents/%s/%s%s", id.WorkspaceID, uuid.Must(uuid.NewV7()), strings.ToLower(rule.Extension))
	hasher := sha256.New()
	mime := declaredMIME
	if ruleMIME == "" || mime == "" {
		mime = rule.Mimes[0]
	}
	if err := s.Objects.Put(r.Context(), objectKey, io.TeeReader(replay, hasher), fh.Size, mime); err != nil {
		s.Log.Error("simpan objek dokumen", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	doc, err := s.Store.CreateUploadedDocument(r.Context(), id.WorkspaceID, id.UserID, store.NewDocument{
		Title:     title,
		MIME:      strings.TrimSpace(strings.Split(mime, ";")[0]),
		Language:  language,
		SourceURI: objectKey,
		SizeBytes: fh.Size,
		Checksum:  fmt.Sprintf("%x", hasher.Sum(nil)),
	})
	if err != nil {
		_ = s.Objects.Delete(r.Context(), objectKey)
		s.Log.Error("simpan metadata dokumen", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}

	out := documentUploadResponse{DocumentRow: *doc}
	if s.Queue != nil {
		jobID, err := s.Queue.Enqueue(r.Context(), jobs.KBIngestArgs{
			WorkspaceID: id.WorkspaceID.String(),
			DocumentID:  doc.ID,
		}, "ingest", 3, true)
		if err != nil {
			s.Log.Warn("enqueue kb_ingest", "trace_id", traceID, "error", err)
			out.Degradation = "queue_unavailable"
		} else {
			job := strconv.FormatInt(jobID, 10)
			out.JobID = &job
		}
	} else {
		out.Degradation = "queue_unavailable"
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) handleDeleteDocument(w http.ResponseWriter, r *http.Request) {
	traceID := TraceID(r.Context())
	id, _ := IdentityFrom(r.Context())
	docID := chiURLParam(r, "documentId")
	if _, err := uuid.Parse(docID); err != nil {
		problem.Validation(traceID, problem.FieldError{Field: "documentId", Message: "harus UUID valid"}).Write(w)
		return
	}
	if err := s.Store.SoftDeleteDocument(r.Context(), id.WorkspaceID, id.UserID, docID); err != nil {
		if isNotFound(err) {
			problem.NotFound("Dokumen tidak ditemukan.", traceID).Write(w)
			return
		}
		s.Log.Error("delete document", "trace_id", traceID, "error", err)
		problem.Internal(traceID).Write(w)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
