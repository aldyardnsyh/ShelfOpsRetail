package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ErrInvalidState menandakan resource ada dan boleh dibaca, tetapi statusnya
// tidak mengizinkan operasi yang diminta. Handler memetakannya ke HTTP 409.
var ErrInvalidState = errors.New("status resource tidak mengizinkan operasi ini")

// FinalizeAuditResult adalah ringkasan setelah audit difinalisasi.
type FinalizeAuditResult struct {
	SessionID     string `json:"session_id"`
	Status        string `json:"status"`
	Score         *int   `json:"score"`
	AlertsCreated int    `json:"alerts_created"`
	TasksCreated  int    `json:"tasks_created"`
}

// FinalizeAudit menutup sesi audit menjadi "final" dan menurunkan alert + satu
// task tindak lanjut dari temuan OOS / price mismatch.
//
// Aturan:
//   - hanya sesi berstatus 'review' atau 'partial' yang bisa difinalisasi;
//     selain itu (termasuk 'final') mengembalikan ErrInvalidState sehingga
//     pemanggilan ulang bersifat idempoten dan tidak membuat alert ganda;
//   - metrics wajib sudah dihitung (dari POST /audits/{id}/start), jika tidak
//     ada baris audit_metrics hasilnya ErrNotFound;
//   - alert 'oos' (severity high) hanya dibuat bila oos_count > 0, alert
//     'price_mismatch' (severity medium) hanya bila price_mismatch > 0;
//   - satu task source='agent' dibuat hanya bila ada alert, tertaut ke alert
//     pertama dengan severity tertinggi.
func (s *Store) FinalizeAudit(
	ctx context.Context, ws, user uuid.UUID, sessionID string,
) (*FinalizeAuditResult, error) {
	var out FinalizeAuditResult

	err := s.WithWorkspace(ctx, ws, user, func(tx pgx.Tx) error {
		// 1. Kunci baris sesi agar dua finalize paralel tidak sama-sama lolos
		//    pemeriksaan status lalu membuat alert ganda.
		var (
			currentStatus string
			storeID       string
		)
		if err := tx.QueryRow(ctx, `
			SELECT status, store_id::text FROM audit_sessions
			WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
			FOR UPDATE`, sessionID, ws).Scan(&currentStatus, &storeID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
		if currentStatus != "review" && currentStatus != "partial" {
			return fmt.Errorf("%w: sesi berstatus %q, hanya status review/partial yang bisa difinalisasi",
				ErrInvalidState, currentStatus)
		}

		// 2. Metrics wajib ada: angka temuan dipakai untuk isi alert dan task.
		var (
			facingTotal   int
			oosCount      int
			priceMismatch int
			priceRead     int
			score         *int
		)
		if err := tx.QueryRow(ctx, `
			SELECT facing_total, oos_count, price_mismatch, price_read, compliance_score
			FROM audit_metrics
			WHERE session_id = $1 AND workspace_id = $2`, sessionID, ws).
			Scan(&facingTotal, &oosCount, &priceMismatch, &priceRead, &score); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrNotFound
			}
			return fmt.Errorf("ambil metrics audit: %w", err)
		}

		// 3. Tutup sesi. Filter status diulang sebagai pengaman terakhir.
		tag, err := tx.Exec(ctx, `
			UPDATE audit_sessions
			SET status = 'final', score = coalesce(score, $3), finished_at = now(), updated_at = now()
			WHERE id = $1 AND workspace_id = $2 AND status IN ('review','partial')`,
			sessionID, ws, score)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return fmt.Errorf("%w: sesi berubah status saat finalisasi", ErrInvalidState)
		}

		scoreText := "belum tersedia"
		if score != nil {
			scoreText = fmt.Sprintf("%d%%", *score)
		}

		// 4. Alert OOS (hanya bila ada temuan).
		alertsCreated := 0
		var (
			firstAlertID   string
			firstAlertType string
			severity       string
		)
		if oosCount > 0 {
			detail := fmt.Sprintf(
				"Audit rak menemukan %d rak kosong (OOS) dari %d facing. Skor kepatuhan %s; perlu pengecekan ketersediaan di rak.",
				oosCount, facingTotal, scoreText)
			if err := tx.QueryRow(ctx, `
				INSERT INTO alerts (workspace_id, store_id, session_id, type, severity, status, detail)
				VALUES ($1, $2, $3, 'oos', 'high', 'open', $4)
				RETURNING id::text`,
				ws, storeID, sessionID, detail).Scan(&firstAlertID); err != nil {
				return fmt.Errorf("buat alert oos: %w", err)
			}
			firstAlertType = "oos"
			severity = "high"
			alertsCreated++
		}

		// 5. Alert price mismatch (hanya bila ada temuan).
		if priceMismatch > 0 {
			detail := fmt.Sprintf(
				"Audit harga membaca %d label harga; %d di antaranya tidak sesuai harga referensi. Perlu koreksi label rak.",
				priceRead, priceMismatch)
			var alertID string
			if err := tx.QueryRow(ctx, `
				INSERT INTO alerts (workspace_id, store_id, session_id, type, severity, status, detail)
				VALUES ($1, $2, $3, 'price_mismatch', 'medium', 'open', $4)
				RETURNING id::text`,
				ws, storeID, sessionID, detail).Scan(&alertID); err != nil {
				return fmt.Errorf("buat alert price mismatch: %w", err)
			}
			if alertsCreated == 0 {
				firstAlertID = alertID
				firstAlertType = "price_mismatch"
				severity = "medium"
			}
			alertsCreated++
		}

		// 6. Satu task tindak lanjut, tertaut ke alert pertama.
		tasksCreated := 0
		if alertsCreated > 0 {
			priority := "normal"
			if severity == "high" {
				priority = "high"
			}
			var createdBy any
			if user != uuid.Nil {
				createdBy = user
			}
			detail := fmt.Sprintf(
				"Audit sesi %s selesai (skor %s) dengan %d rak kosong dan %d harga tidak sesuai. Tindak lanjuti alert terkait.",
				sessionID, scoreText, oosCount, priceMismatch)
			if _, err := tx.Exec(ctx, `
				INSERT INTO tasks (workspace_id, store_id, title, detail, alert_id, alert_type,
				                   severity, priority, status, source, created_by)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', 'agent', $9)`,
				ws, storeID, "Tindak lanjut temuan audit rak", detail,
				firstAlertID, firstAlertType, severity, priority, createdBy); err != nil {
				return fmt.Errorf("buat task tindak lanjut: %w", err)
			}
			tasksCreated = 1
		}

		// 7. Jejak audit (jsonb) untuk aksi finalisasi.
		logDetail, err := json.Marshal(map[string]any{
			"status":         "final",
			"score":          score,
			"alerts_created": alertsCreated,
			"tasks_created":  tasksCreated,
			"oos_count":      oosCount,
			"price_mismatch": priceMismatch,
			"facing_total":   facingTotal,
			"price_read":     priceRead,
		})
		if err != nil {
			return err
		}
		var actorID any
		if user != uuid.Nil {
			actorID = user
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO audit_logs (workspace_id, actor_id, action, entity, entity_id, detail)
			VALUES ($1, $2, 'audit.finalize', 'audit_sessions', $3, $4)`,
			ws, actorID, sessionID, logDetail); err != nil {
			return fmt.Errorf("tulis audit log finalisasi: %w", err)
		}

		out = FinalizeAuditResult{
			SessionID:     sessionID,
			Status:        "final",
			Score:         score,
			AlertsCreated: alertsCreated,
			TasksCreated:  tasksCreated,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}
