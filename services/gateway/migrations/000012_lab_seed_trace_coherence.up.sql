-- 000012_lab_seed_trace_coherence
--
-- 000010 menulis satu request_id per pesan, sehingga satu trace hanya berisi
-- satu pesan (pertanyaan dan jawaban terpisah) dan kolom query/user pada
-- GET /api/v1/traces kosong. Migrasi ini menyatukan satu giliran percakapan
-- (user + assistant) ke request_id yang sama, memberi percakapan pemilik,
-- lalu membangun ulang span trace agar konsisten dengan pesan.
--
-- Idempotent: aman dijalankan berulang.

-- 1) Percakapan demo punya pemilik (seed admin), supaya join user terisi.
UPDATE conversations c
SET user_id = '00000000-0000-7000-8000-000000000101'::uuid
WHERE c.workspace_id = '00000000-0000-7000-8000-000000000001'::uuid
  AND c.user_id IS NULL;

-- 2) Satu request_id per giliran: pesan ke-1 dan ke-2 = turn 1, ke-3 dan ke-4 = turn 2.
WITH ranked AS (
  SELECT
    m.id,
    m.conversation_id,
    (
      (
        row_number() OVER (
          PARTITION BY m.conversation_id
          ORDER BY m.created_at, m.id
        ) + 1
      ) / 2
    )::int AS turn
  FROM messages m
  WHERE m.workspace_id = '00000000-0000-7000-8000-000000000001'::uuid
)
UPDATE messages m
SET request_id = 'req-' || substr(r.conversation_id::text, 1, 8) || '-' || r.turn
FROM ranked r
WHERE m.id = r.id
  AND m.request_id IS DISTINCT FROM
    ('req-' || substr(r.conversation_id::text, 1, 8) || '-' || r.turn);

-- 3) Bangun ulang span trace untuk workspace demo dari request_id baru.
DELETE FROM llm_traces
WHERE workspace_id = '00000000-0000-7000-8000-000000000001'::uuid;

INSERT INTO llm_traces (id, workspace_id, request_id, stage, span_id, parent_span, latency_ms,
                        tokens_in, tokens_out, cost_usd, model, provider, status, meta, started_at)
SELECT
  md5('trc-' || req || '-' || (10 + stage_no))::uuid,
  ws_id, req,
  sv.stages[stage_no],
  'span-' || substr(req, 5, 6) || '-' || stage_no,
  CASE WHEN stage_no > 1 THEN 'span-' || substr(req, 5, 6) || '-' || (stage_no - 1) ELSE NULL END,
  CASE stage_no WHEN 1 THEN 28 WHEN 2 THEN 212 WHEN 3 THEN 96 ELSE 165 END,
  CASE stage_no WHEN 1 THEN 24 WHEN 2 THEN 350 WHEN 3 THEN 80 ELSE 60 END,
  CASE stage_no WHEN 1 THEN 4 WHEN 2 THEN 280 WHEN 3 THEN 0 ELSE 12 END,
  0.000031,
  CASE stage_no WHEN 2 THEN 'glm-5-flash' ELSE NULL END,
  CASE stage_no WHEN 2 THEN 'zhipu' ELSE NULL END,
  'ok',
  jsonb_build_object('note', CASE stage_no WHEN 1 THEN 'rewrite query'
                             WHEN 2 THEN 'qra LLM call'
                             WHEN 3 THEN 'tool invoke'
                             ELSE 'Assistant shaping' END),
  started_at + (CASE stage_no WHEN 1 THEN 0 WHEN 2 THEN 28 WHEN 3 THEN 240 ELSE 336 END) * interval '1 millisecond'
FROM (
  SELECT DISTINCT
    m.request_id AS req,
    m.workspace_id AS ws_id,
    min(m.created_at) OVER (PARTITION BY m.request_id) AS started_at
  FROM messages m
  WHERE m.workspace_id = '00000000-0000-7000-8000-000000000001'::uuid
    AND m.request_id IS NOT NULL
) t
CROSS JOIN (SELECT ARRAY['rewrite','llm','tool','assistant']::text[] AS stages) sv
CROSS JOIN GENERATE_SERIES(1, 4) AS stage_no;
