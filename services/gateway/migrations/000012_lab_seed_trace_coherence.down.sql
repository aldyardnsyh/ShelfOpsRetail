-- 000012_lab_seed_trace_coherence (down)
--
-- Mengembalikan data demo ke bentuk 000010: request_id per pesan, percakapan
-- tanpa pemilik. Span trace dihapus karena tidak lagi konsisten dengan pesan
-- (000010 tidak dapat dijalankan ulang pada baris yang sudah ada).

DELETE FROM llm_traces
WHERE workspace_id = '00000000-0000-7000-8000-000000000001'::uuid;

WITH ranked AS (
  SELECT
    m.id,
    row_number() OVER (
      PARTITION BY m.conversation_id
      ORDER BY m.created_at, m.id
    )::int AS seq
  FROM messages m
  WHERE m.workspace_id = '00000000-0000-7000-8000-000000000001'::uuid
)
UPDATE messages m
SET request_id = 'req-' || substr(m.conversation_id::text, 1, 8) || '-' || r.seq
FROM ranked r
WHERE m.id = r.id;

UPDATE conversations c
SET user_id = NULL
WHERE c.workspace_id = '00000000-0000-7000-8000-000000000001'::uuid
  AND c.user_id = '00000000-0000-7000-8000-000000000101'::uuid;
