-- 000004_seed_sample_data — data fiktif untuk demo & dashboard (PRD §15.3).
-- Deterministik: setseed() dipakai agar angka sama setiap kali seed dijalankan.
-- Semua nama toko/brand fiktif. Tidak ada data perusahaan mana pun.

-- ---------------------------------------------------------------------------
-- Workspace demo + user seed
-- ---------------------------------------------------------------------------
INSERT INTO workspaces (id, name, is_demo, locale)
VALUES ('00000000-0000-7000-8000-000000000001', 'Demo ShelfOps', true, 'id')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, email, name, password_hash, locale, is_demo)
VALUES
  ('00000000-0000-7000-8000-000000000101', 'seed@shelfops.local', 'Seed Bot', NULL, 'id', false),
  ('00000000-0000-7000-8000-000000000102', 'demo@shelfops.local', 'Pengunjung Demo', NULL, 'id', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO memberships (id, user_id, workspace_id, role)
VALUES
  ('00000000-0000-7000-8000-000000000201', '00000000-0000-7000-8000-000000000101', '00000000-0000-7000-8000-000000000001', 'admin'),
  ('00000000-0000-7000-8000-000000000202', '00000000-0000-7000-8000-000000000102', '00000000-0000-7000-8000-000000000001', 'analyst')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Planogram (target share + bobot skor; BR-10 toleransi harga per planogram)
-- ---------------------------------------------------------------------------
INSERT INTO planograms (id, workspace_id, name, config)
VALUES
  ('00000000-0000-7000-8000-000000000301', '00000000-0000-7000-8000-000000000001', 'Planogram Minuman Q4',
   '{"weights":{"availability":0.5,"share_adherence":0.3,"price_accuracy":0.2},
     "targets":[{"category":"Air Mineral","share":0.35,"facings":12,"price_idr":3500},
                {"category":"Teh Kemasan","share":0.25,"facings":9,"price_idr":5000},
                {"category":"Susu UHT","share":0.2,"facings":7,"price_idr":7200},
                {"category":"Kopi Sachet","share":0.2,"facings":7,"price_idr":2500}],
     "price_tolerance_idr":0}')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 20 toko fiktif
-- ---------------------------------------------------------------------------
INSERT INTO stores (workspace_id, code, name, region, channel)
SELECT
  '00000000-0000-7000-8000-000000000001',
  'ST-' || lpad(i::text, 3, '0'),
  (ARRAY['Minimarket Maju Jaya','Toko Sejahtera','Swalayan Mitra','Pasar Segar','Gerai Nusa'])[1 + (i % 5)]
    || ' ' || (ARRAY['Bekasi','Cikarang','Bogor','Depok','Tangerang','Bandung','Surabaya','Semarang','Yogyakarta','Malang'])[1 + (i % 10)],
  (ARRAY['Jawa Barat','Jawa Barat','Jawa Barat','Jawa Barat','Banten','Jawa Barat','Jawa Timur','Jawa Tengah','DI Yogyakarta','Jawa Timur'])[1 + (i % 10)],
  (ARRAY['minimarket','traditional','supermarket','traditional','supermarket'])[1 + (i % 5)]
FROM generate_series(1, 20) AS i
ON CONFLICT (workspace_id, code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 90 hari audit
-- ---------------------------------------------------------------------------
SELECT setseed(0.42);

INSERT INTO audit_sessions (workspace_id, store_id, planogram_id, status, audit_date, created_by, started_at, finished_at, created_at)
SELECT
  '00000000-0000-7000-8000-000000000001',
  st.id,
  '00000000-0000-7000-8000-000000000301',
  CASE WHEN d = current_date THEN 'review' ELSE 'final' END,
  d,
  '00000000-0000-7000-8000-000000000101',
  d + interval '8 hours',
  d + interval '8 hours 6 minutes',
  d + interval '8 hours'
FROM stores st
JOIN generate_series(current_date - interval '89 days', current_date, interval '1 day') AS d
  ON ((extract(doy from d)::int + ascii(right(st.code,1))) % 3) = 0
WHERE st.workspace_id = '00000000-0000-7000-8000-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM audit_sessions s2
    WHERE s2.store_id = st.id AND s2.audit_date = d::date
  );

-- metrik per sesi: dihitung dari rumus §9.3 dengan noise deterministik
INSERT INTO audit_metrics (session_id, workspace_id, facing_total, oos_count, price_read, price_mismatch, compliance_score, breakdown)
SELECT
  x.id,
  x.workspace_id,
  x.facing_total,
  x.oos_row1 + x.oos_row2,
  x.price_read,
  x.price_mismatch,
  round(100 * (0.5 * x.availability + 0.3 * x.share_adherence + 0.2 * x.price_accuracy))::int,
  jsonb_build_object(
    'availability', round(x.availability::numeric, 4),
    'share_adherence', round(x.share_adherence::numeric, 4),
    'price_accuracy', round(x.price_accuracy::numeric, 4),
    'rows', jsonb_build_array(
      jsonb_build_object('row_index', 1, 'facing', 12, 'missing', x.oos_row1),
      jsonb_build_object('row_index', 2, 'facing', 9, 'missing', x.oos_row2),
      jsonb_build_object('row_index', 3, 'facing', 7, 'missing', 0),
      jsonb_build_object('row_index', 4, 'facing', 7, 'missing', 0)
    )
  )
FROM (
  SELECT
    s.id,
    s.workspace_id,
    (35 + (random() * 6)::int) AS facing_total,
    floor(random() * 4)::int AS oos_row1,
    floor(random() * 2)::int AS oos_row2,
    (18 + floor(random() * 6)::int) AS price_read,
    floor(random() * 3)::int AS price_mismatch,
    LEAST(1, GREATEST(0.6, 1 - (floor(random() * 4)::float / 20))) AS availability,
    LEAST(1, GREATEST(0.5, 0.95 - random() * 0.35)) AS share_adherence,
    LEAST(1, GREATEST(0.6, 1 - (floor(random() * 3)::float / 12))) AS price_accuracy
  FROM audit_sessions s
  WHERE s.workspace_id = '00000000-0000-7000-8000-000000000001'
    AND NOT EXISTS (SELECT 1 FROM audit_metrics m WHERE m.session_id = s.id)
) x;

-- sesi skor = skor metrik
UPDATE audit_sessions s
SET score = m.compliance_score
FROM audit_metrics m
WHERE m.session_id = s.id AND s.score IS NULL;

-- ---------------------------------------------------------------------------
-- Alert dari sesi OOS tinggi (BR-07: missing ≥ 2 pada satu baris)
-- ---------------------------------------------------------------------------
INSERT INTO alerts (workspace_id, store_id, session_id, type, severity, status, detail, created_at)
SELECT
  m.workspace_id,
  s.store_id,
  s.id,
  CASE WHEN (m.breakdown->'rows'->0->>'missing')::int >= 2 THEN 'oos' ELSE 'price_mismatch' END,
  CASE WHEN (m.breakdown->'rows'->0->>'missing')::int >= 3 THEN 'high' ELSE 'medium' END,
  CASE WHEN s.audit_date >= current_date - 7 THEN 'open'
       WHEN s.audit_date >= current_date - 30 THEN 'acknowledged'
       ELSE 'resolved' END,
  CASE WHEN (m.breakdown->'rows'->0->>'missing')::int >= 2
       THEN 'Baris 1 kehilangan ' || (m.breakdown->'rows'->0->>'missing') || ' facing'
       ELSE m.price_mismatch || ' label harga tidak sesuai referensi' END,
  s.created_at
FROM audit_metrics m
JOIN audit_sessions s ON s.id = m.session_id
WHERE m.workspace_id = '00000000-0000-7000-8000-000000000001'
  AND ((m.breakdown->'rows'->0->>'missing')::int >= 2 OR m.price_mismatch >= 2)
  AND NOT EXISTS (SELECT 1 FROM alerts a WHERE a.session_id = s.id);

-- ---------------------------------------------------------------------------
-- Benchmark hasil prakomputasi (committed=true) — nilai diisi dari run nyata.
-- Sengaja dibiarkan kosong: tabel benchmark_runs hanya diisi oleh
-- `benchmarks/run_bench.py` yang menyimpan hasil nyata (PRD: jangan mengarang angka).
-- ---------------------------------------------------------------------------
