-- 000014_demo_history_completion
--
-- Melengkapi data demo agar tidak ada halaman yang menampilkan nol karena
-- seed hanya mengisi beberapa hari:
--   1) visitor_events untuk 13 hari sebelumnya (laporan 14 hari jadi terisi).
--   2) checklist tugas yang masih kosong.
--
-- Deterministik dan idempoten.

SELECT setseed(0.42);

-- 1) Riwayat kunjungan per toko, 13 hari ke belakang.
WITH days AS (
  SELECT generate_series(1, 13) AS day_offset
),
targets AS (
  SELECT st.id AS store_id, st.workspace_id,
         (SELECT array_agg(z.id ORDER BY z.name) FROM zones z WHERE z.store_id = st.id) AS zone_ids
  FROM stores st
  WHERE st.workspace_id = '00000000-0000-7000-8000-000000000001'::uuid
    AND st.deleted_at IS NULL
),
plan AS (
  SELECT t.store_id, t.workspace_id, t.zone_ids, d.day_offset,
         120 + ((d.day_offset * 37 + abs(hashtext(t.store_id::text)) % 200) % 220) AS visits
  FROM targets t
  CROSS JOIN days d
  WHERE t.zone_ids IS NOT NULL
)
INSERT INTO visitor_events (id, workspace_id, store_id, zone_id, entered_at, dwell_seconds, status)
SELECT
  md5('ve-hist-' || p.store_id::text || '-' || p.day_offset || '-' || g)::uuid,
  p.workspace_id,
  p.store_id,
  p.zone_ids[1 + ((p.day_offset * 11 + g * 3) % array_length(p.zone_ids, 1))],
  date_trunc('day', now())
    - make_interval(days => p.day_offset)
    + make_interval(hours => 8 + (g % 13), mins => (g * 7) % 60),
  60 + ((p.day_offset * 17 + g * 11) % 420),
  CASE WHEN g % 4 = 0 THEN 'in' ELSE 'out' END
FROM plan p
CROSS JOIN LATERAL generate_series(1, p.visits) AS g
ON CONFLICT (id) DO NOTHING;

-- 2) Checklist untuk tugas yang belum punya langkah.
UPDATE tasks
SET checklist = jsonb_build_array(
      jsonb_build_object('text', 'Cek kondisi rak dan catat temuan', 'done', false),
      jsonb_build_object('text', 'Tindak lanjuti sesuai SOP toko', 'done', false),
      jsonb_build_object('text', 'Unggah bukti foto setelah selesai', 'done', false)
    ),
    updated_at = now()
WHERE workspace_id = '00000000-0000-7000-8000-000000000001'::uuid
  AND (checklist IS NULL OR checklist = '[]'::jsonb);