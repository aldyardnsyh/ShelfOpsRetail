-- 000010_lab_seed — data lab: dokumen KB, conversations/messages/citations,
-- llm_traces, eval (dataset/kasus/run/results), benchmark_runs, audit_images,
-- detections, price_tags.
-- Deterministik & idempotent (PK md5; semua seed do nothing pada rerun).

SELECT setseed(0.42);

-- ---------------------------------------------------------------------------
-- Dokumen KB (8)
-- ---------------------------------------------------------------------------
INSERT INTO documents (id, workspace_id, title, mime, language, status, size_bytes, chunk_count, last_indexed_at)
SELECT
  md5('doc-' || i)::uuid,
  ws.wid,
  (ARRAY['SOP Pengecekan Rak Harian','Pedoman Restock Minuman Dingin','Daftar Harga Referensi Q4',
          'Prosedur Label Harga Baru','Playbook Selisih Harga','Panduan Kolom PO',
          'Checklist Inspeksi Mingguan','Panduan Copilot ShelfOps'])[i],
  'text/plain',
  'id',
  'ready',
  (12000 + (i * 977))::bigint,
  3 + (i % 4),
  now() - make_interval(days => i::int)
FROM (SELECT '00000000-0000-7000-8000-000000000001'::uuid AS wid) ws
CROSS JOIN GENERATE_SERIES(1, 8) i
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Conversations Copilot (4) + 4 pesan per percakapan
-- ---------------------------------------------------------------------------
INSERT INTO conversations (id, workspace_id, user_id, title, created_at, updated_at)
SELECT
  md5('conv-' || i)::uuid,
  ws.wid,
  NULL,
  (ARRAY['Rak toko Bekasi hari ini','Ringkasan kompliance mingguan',
         'Status label harga terakhir','Topik insiden paling sering'])[i],
  now() - make_interval(days => ((4 - i) * 2)::int),
  now() - make_interval(hours => ((i * 4) + 2)::int)
FROM (SELECT '00000000-0000-7000-8000-000000000001'::uuid AS wid) ws
CROSS JOIN GENERATE_SERIES(1, 4) i
ON CONFLICT (id) DO NOTHING;

INSERT INTO messages (id, workspace_id, conversation_id, role, content, model, provider,
                      tokens_in, tokens_out, latency_ms, refused, replay, request_id, created_at)
SELECT
  md5('msg-' || cid::text || '-' || s)::uuid,
  cwid, cid,
  CASE WHEN s % 2 = 1 THEN 'user' ELSE 'assistant' END,
  CASE WHEN s % 2 = 1 THEN user_q ELSE
    CASE s % 4 WHEN 0 THEN 'Rak toko Bekasi hari ini: compliance 87,5% (good). Oos terbesar di air glass 1,5L — 6 dari 12 facing kosong. Alert oos saat ini 3 item, semuanya prioritas sedang. Detail lengkap: sitasi SOP dan trend 14 hari di grafik kanan.'
               WHEN 2 THEN 'Ringkasan kompliance mingguan: rata-rata 88,2% naik 1,4 pt dari minggu lalu. 3 toko di bawah 85% (S-003, S-011, S-017). Top penyebab: ketidakhadiran Update-to-app di rak chiller dan label harga belum diganti.'
               ELSE '' END END,
  CASE WHEN s % 2 = 1 THEN NULL ELSE 'glm-5-flash' END,
  CASE WHEN s % 2 = 1 THEN NULL ELSE 'zhipu' END,
  CASE WHEN s % 2 = 1 THEN 24 ELSE 350 END,
  CASE WHEN s % 2 = 1 THEN 0 ELSE 280 END,
  CASE WHEN s % 2 = 1 THEN 0 ELSE 426 END,
  false,
  s % 8 = 6,
  'req-' || substr(cid::text, 1, 8) || '-' || s,
  c.created_at + make_interval(secs => (s * 30)::int)
FROM (
  SELECT c.id AS cid, c.workspace_id AS cwid, c.title, c.created_at,
         CASE c.title WHEN 'Rak toko Bekasi hari ini' THEN 'Bagaimana kondisi rak toko Bekasi hari ini?'
                      WHEN 'Ringkasan kompliance mingguan' THEN 'Berikan ringkasan kompliance mingguan semua toko'
                      WHEN 'Status label harga terakhir' THEN 'Berapa mismatch label harga minggu ini?'
                      ELSE 'Insiden apa yang paling sering minggu ini?' END AS user_q
  FROM conversations c
  WHERE c.workspace_id = '00000000-0000-7000-8000-000000000001'
    AND c.deleted_at IS NULL
) c
CROSS JOIN GENERATE_SERIES(1, 4) s
ON CONFLICT (id) DO NOTHING;

-- Sitasi untuk 2 pesan assistant pertama per percakapan
INSERT INTO message_citations (id, workspace_id, message_id, chunk_id, document_id, ordinal, score, page, heading_path, snippet)
SELECT
  md5('cit-' || m.id::text || '-' || n)::uuid,
  m.workspace_id, m.id,
  NULL,
  md5('doc-' || n)::uuid,
  n,
  0.88 - (n * 0.03),
  (1 + (n % 3))::int,
  'SOP · Bab ' || n,
  CASE n WHEN 1 THEN 'Wajib cek rak dinding setiap pagi sebelum shift 2.'
         WHEN 2 THEN 'Restock chiller maksimal 30 menit setelah alert OOS.'
         ELSE 'Label harga harus diganti hari yang sama dengan perubahan buku harga.' END
FROM (
  SELECT m.id, m.workspace_id, row_number() OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) AS msg_rank
  FROM messages m
  WHERE m.workspace_id = '00000000-0000-7000-8000-000000000001' AND m.role = 'assistant'
) ranked
JOIN messages m ON m.id = ranked.id
CROSS JOIN GENERATE_SERIES(1, 3) n
WHERE ranked.msg_rank <= 2
ON CONFLICT (id) DO NOTHING;

-- Tool call contoh untuk pesan assistant pertama per percakapan
INSERT INTO tool_calls (id, workspace_id, message_id, conversation_id, name, args, result_summary,
                        status, requires_confirmation, duration_ms, created_at)
SELECT
  md5('tool-' || aid::text)::uuid,
  awid, aid, acid,
  'insights.kpis',
  '{"period":"7d"}'::jsonb,
  'compliance 88.2% (+1.4), oos 3 open',
  'done',
  false,
  212,
  now() - make_interval(hours => 30)
FROM (
  SELECT m.id AS aid, m.workspace_id AS awid, m.conversation_id AS acid
  FROM (
    SELECT m.id, m.workspace_id, m.conversation_id,
           row_number() OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) AS r
    FROM messages m
    WHERE m.workspace_id = '00000000-0000-7000-8000-000000000001' AND m.role = 'assistant'
  ) m
  WHERE m.r = 1
) first_a
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- llm_traces: 4 trace x 4 span per request (dari message request_id)
-- ---------------------------------------------------------------------------
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
  SELECT DISTINCT m.request_id AS req, m.workspace_id AS ws_id, min(m.created_at) OVER (PARTITION BY m.request_id) AS started_at
  FROM messages m
  WHERE m.request_id IS NOT NULL
) t
CROSS JOIN (SELECT ARRAY['rewrite','llm','tool','assistant']::text[] AS stages) sv
CROSS JOIN GENERATE_SERIES(1, 4) AS stage_no
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Eval: 4 dataset + 10 kasus per dataset + 2 run + hasil
-- ---------------------------------------------------------------------------
INSERT INTO eval_datasets (id, workspace_id, name, description, created_at)
SELECT
  md5('ed-' || i)::uuid,
  ws.wid,
  (ARRAY['SOP Knowledge','Retransaktur customer','Kuisioner EOF kedua','Kuisioner Shelf Test'])[i],
  'Benchmark dataset internal aktif ' || i,
  now() - make_interval(days => i)
FROM (SELECT '00000000-0000-7000-8000-000000000001'::uuid AS wid) ws
CROSS JOIN GENERATE_SERIES(1, 4) i
ON CONFLICT (id) DO NOTHING;

INSERT INTO eval_cases (id, workspace_id, dataset_id, question, expected_answer, expected_sources, tags, answerable, language)
SELECT
  md5('ec-' || ds_id::text || '-' || j)::uuid,
  ws_id, ds_id,
  (ARRAY['Kapan wajib cek rak?','Siapa penanggung jawab restock chiller?','Berapa toleransi margin simpanan?',
         'Apa SOP label harga baru?','Bagaimana cara buat PO?','Berapa facing standar air glass?','Kapan inspeksi mingguan?',
         'Simpanan laminasi di rak mana?','Kapan alert dianggap OOS?','Apa fungsi kompresor CV?'])[j],
  'Di SOP Bab 1: setiap shift 2 (pagi) wajib cek rak dinding.',
  '[]'::jsonb,
  ARRAY['sop'],
  j % 10 <> 7,
  'id'
FROM (
  SELECT ed.id AS ds_id, ed.workspace_id AS ws_id
  FROM eval_datasets ed
  WHERE ed.workspace_id = '00000000-0000-7000-8000-000000000001'
) ds
CROSS JOIN GENERATE_SERIES(1, 10) j
ON CONFLICT (id) DO NOTHING;

INSERT INTO eval_runs (id, workspace_id, dataset_id, kind, status, config_snapshot, metrics, use_replay, created_at, finished_at)
SELECT
  md5('er-' || ds_id::text || '-' || r)::uuid,
  ws_id, ds_id,
  CASE r WHEN 1 THEN 'rag' ELSE 'agent' END,
  'completed',
  '{"retrieval":"bm25+vector","k":5}'::jsonb,
  jsonb_build_object(
    'faithfulness',       CASE r WHEN 1 THEN 0.91 ELSE 0.88 END,
    'answer_relevance',   CASE r WHEN 1 THEN 0.89 ELSE 0.86 END,
    'context_precision',  CASE r WHEN 1 THEN 0.84 ELSE 0.79 END,
    'context_recall',     CASE r WHEN 1 THEN 0.82 ELSE 0.81 END,
    'refusal_accuracy',   CASE r WHEN 1 THEN 0.95 ELSE 0.94 END,
    'p95_latency_ms',     CASE r WHEN 1 THEN 520 ELSE 640 END),
  true,
  now() - make_interval(days => (3 - r)::int),
  now() - make_interval(days => (3 - r)::int)
FROM (
  SELECT ed.id AS ds_id, ed.workspace_id AS ws_id
  FROM eval_datasets ed
  WHERE ed.workspace_id = '00000000-0000-7000-8000-000000000001'
    AND ed.name = 'SOP Knowledge'
) ds
CROSS JOIN GENERATE_SERIES(1, 2) r
ON CONFLICT (id) DO NOTHING;

INSERT INTO eval_results (id, workspace_id, run_id, case_id, answer, refused, hit_at_5, mrr, context_recall, faithfulness, answer_relevance, latency_ms, cost_usd)
SELECT
  md5('ers-' || er.id::text || '-' || ec.id::text)::uuid,
  er.workspace_id, er.id, ec.id,
  CASE WHEN ec.answerable THEN 'Jawaban simulasi hasil run: ' || substr(ec.id::text, 1, 6) ELSE '' END,
  NOT ec.answerable,
  0.6 + (abs(hashtext(ec.id::text || er.id::text)) % 35)::real / 100,
  0.5 + (abs(hashtext(ec.id::text || er.id::text || 'a')) % 45)::real / 100,
  0.55 + (abs(hashtext(ec.id::text || er.id::text || 'b')) % 30)::real / 100,
  0.70 + (abs(hashtext(ec.id::text || er.id::text || 'c')) % 25)::real / 100,
  0.74 + (abs(hashtext(ec.id::text || er.id::text || 'd')) % 20)::real / 100,
  340 + (abs(hashtext(ec.id::text || er.id::text)) % 200),
  0.0006
FROM eval_runs er
JOIN eval_cases ec ON ec.dataset_id = er.dataset_id
WHERE er.workspace_id = '00000000-0000-7000-8000-000000000001'
ON CONFLICT (run_id, case_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Model registry & benchmark (5 baris)
-- ---------------------------------------------------------------------------
INSERT INTO model_registry (id, name, version, kind, metrics, status, notes)
SELECT
  md5('mr-' || i)::uuid,
  names[1 + (i % 4)],
  '0.' || (3 + i),
  kinds[1 + (i % 4)],
  '{"map50":0.894,"ap50":0.871}'::jsonb,
  CASE WHEN i = 2 THEN 'active' ELSE 'candidate' END,
  ''
FROM generate_series(1, 5) i
CROSS JOIN LATERAL (SELECT (ARRAY['yolov8n-shelf','yolov8n-int8','yolov8n-fp32','yolov8n-fp16'])::text[] names) nv
CROSS JOIN LATERAL (SELECT (ARRAY['detector','detector','llm','prompt'])::text[] kinds) kv
ON CONFLICT (id) DO NOTHING;

INSERT INTO benchmark_runs (id, workspace_id, model_variant, hardware, imgsz, batch, p50_ms, p95_ms, throughput_ips,
                            memory_mb, model_size_mb, map50, count_mape, dataset, notes, committed)
SELECT
  md5('bm-' || i)::uuid,
  '00000000-0000-7000-8000-000000000001',
  (ARRAY['fp32','fp16','int8','int8','cloud_vlm'])[i],
  CASE i WHEN 5 THEN '' ELSE 'jetson-orin-nano' END,
  640,
  1,
  (ARRAY[38.2,22.5,18.7,17.2,120.0])[i],
  (ARRAY[46.8,28.1,23.5,21.9,180.0])[i],
  (ARRAY[26,44,53,58,8])[i],
  (ARRAY[1024,672,488,452,0])[i],
  (ARRAY[51.8,26.4,13.6,13.1,0])[i],
  (ARRAY[0.901,0.896,0.884,0.881,0.912])[i],
  (ARRAY[9.8,10.1,11.4,12.0,7.2])[i],
  'SOP bench v3',
  CASE WHEN i = 4 THEN 'int8 tanpa kalibrasi Label' ELSE '' END,
  i IN (1,3)
FROM generate_series(1, 5) i
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Audit images + detections + price_tags untuk 60 audit terbaru
-- ---------------------------------------------------------------------------
INSERT INTO audit_images (id, workspace_id, session_id, storage_key, mime, size_bytes, width, height, status, low_confidence, created_at, updated_at)
SELECT
  md5('img-' || sess::text || '-' || k::text)::uuid,
  ws_id, sess,
  'audit/' || substr(sess::text, 1, 8) || '/' || CASE k WHEN 1 THEN 'top' ELSE 'front' END || '.jpg',
  'image/jpeg',
  (480000 + (k * 97000))::bigint,
  1280, 720,
  'done',
  false,
  s.created_at + make_interval(secs => (k * 45)::int),
  s.created_at + make_interval(secs => (k * 45)::int)
FROM (
  SELECT s.id AS sess, s.workspace_id AS ws_id, s.created_at
  FROM audit_sessions s
  WHERE s.workspace_id = '00000000-0000-7000-8000-000000000001'
    AND s.deleted_at IS NULL AND s.status IN ('review','final','partial')
  ORDER BY s.created_at DESC
  LIMIT 60
) s
CROSS JOIN GENERATE_SERIES(1, 2) k
ON CONFLICT (id) DO NOTHING;

INSERT INTO detections (id, workspace_id, image_id, x1, y1, x2, y2, confidence, label, label_score, row_index, source)
SELECT
  md5('det-' || img::text || '-' || j::text)::uuid,
  iws, img,
  (j * 80)::real,
  (40 + ((j % 4) * 160))::real,
  (j * 80 + 70)::real,
  (40 + ((j % 4) * 160) + 140)::real,
  0.52 + (abs(hashtext(img::text || j::text)) % 45)::real / 100,
  CASE WHEN (abs(hashtext(img::text || j::text || 'l')) % 10) < 2 THEN NULL
       ELSE 'product-' || (1 + (abs(hashtext(img::text || j::text)) % 15)) END,
  0.86,
  (j % 4)::int,
  'model'
FROM (
  SELECT i.id AS img, i.workspace_id AS iws
  FROM audit_images i
  WHERE i.workspace_id = '00000000-0000-7000-8000-000000000001'
    AND i.status = 'done'
) t
CROSS JOIN GENERATE_SERIES(1, 8) j
ON CONFLICT (id) DO NOTHING;

INSERT INTO price_tags (id, workspace_id, image_id, detection_id, x1, y1, x2, y2, raw_text, price_idr, ocr_confidence,
                        matched_label, reference_price_idr, mismatch, created_at)
SELECT
  md5('pt-' || img::text || '-' || j::text)::uuid,
  iws, img, NULL,
  (j * 80)::real,
  (150 + ((j % 4) * 160))::real,
  (j * 80 + 74)::real,
  (150 + ((j % 4) * 160) + 40)::real,
  'Rp ' || (10000 + (j * 2500)),
  (10000 + (j * 2500))::bigint,
  0.91,
  NULL,
  CASE WHEN (abs(hashtext(img::text || j::text)) % 10) < 3 THEN 2000::bigint ELSE NULL END,
  (abs(hashtext(img::text || j::text)) % 10) < 3,
  now() - make_interval(hours => (abs(hashtext(img::text)) % 96)::int)
FROM (
  SELECT i.id AS img, i.workspace_id AS iws
  FROM audit_images i
  WHERE i.workspace_id = '00000000-0000-7000-8000-000000000001'
    AND i.status = 'done'
) t
CROSS JOIN GENERATE_SERIES(1, 4) j
ON CONFLICT (id) DO NOTHING;
