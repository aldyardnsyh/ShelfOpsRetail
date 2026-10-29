-- 000009_ops_seed — data sample untuk domain operasional + data lab.
-- Deterministik (setseed 0.42), idempotent, semua di workspace demo seed
-- (00000000-0000-7000-8000-000000000001).

SELECT setseed(0.42);

-- ---------------------------------------------------------------------------
-- Katalog produk (15 SKU fiktif minimarket)
-- ---------------------------------------------------------------------------
INSERT INTO products (id, workspace_id, sku, name, category, sub_category, unit, price_idr, cost_idr, reorder_point, active)
SELECT
  md5('sku-' || i)::uuid,
  '00000000-0000-7000-8000-000000000001',
  'SKU-' || lpad(i::text, 4, '0'),
  (ARRAY['Air Mineral 600ml','Teh Kemasan 250ml','Susu UHT 1L','Kopi Sachet 10s','Minuman Soda 330ml',
         'Keripik Kentang 100g','Wafer Cokelat 80g','Mie Instan Goreng','Roti Sobek 250g','Susu Cokelat 250ml',
         'Jus Mangga 1L','Air Mineral 1500ml','Snack Jagung 60g','Sarden Kaleng 155g','Gula Pasir 1kg'])
    [1 + ((i - 1) % 15)],
  (ARRAY['Minuman','Minuman','Minuman','Minuman','Minuman','Snack','Snack','Makanan','Makanan','Minuman',
         'Minuman','Minuman','Snack','Makanan','Bahan Dapur'])[1 + ((i - 1) % 15)],
  (ARRAY['Air','Teh','Susu','Kopi','Berkarbonasi','Keripik','Wafer','Mie','Roti','Susu',
         'Jus','Air','Camilan','Kaleng','Pokok'])[1 + ((i - 1) % 15)],
  'pcs',
  3500 + (i * 750) % 20000,
  3000 + (i * 600) % 15000,
  8 + (i * 5) % 25,
  true
FROM generate_series(1, 15) AS i
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Lokasi toko: 2 per toko (40 baris)
-- ---------------------------------------------------------------------------
INSERT INTO inventory_locations (id, workspace_id, store_id, name, kind)
SELECT
  md5('loc-' || st.id::text || '-' || k)::uuid,
  st.workspace_id,
  st.id,
  CASE k WHEN 'a' THEN 'Rak Dinding 1 (shelf)' ELSE 'Rak Dinding 2 (backroom)' END,
  CASE k WHEN 'a' THEN 'shelf' ELSE 'backroom' END
FROM stores st
CROSS JOIN (VALUES ('a'), ('b')) AS sv(k)
WHERE st.workspace_id = '00000000-0000-7000-8000-000000000001'
  AND st.deleted_at IS NULL
ON CONFLICT (store_id, name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Saldo stok: setiap lokasi × 4 produk (± 160 baris)
-- ---------------------------------------------------------------------------
INSERT INTO inventory_balances (workspace_id, store_id, location_id, product_id, on_hand, reserved, reorder_point, last_movement_at)
SELECT
  l.workspace_id, l.store_id, l.id, p.id,
  CASE WHEN abs(hashtext(l.id::text || p.sku)) % 100 < 8 THEN 0
       WHEN abs(hashtext(l.id::text || p.sku)) % 100 < 23 THEN 1 + (abs(hashtext(p.sku)) % 6)
       ELSE 10 + (abs(hashtext(l.id::text || p.sku)) % 40) END,
  abs(hashtext(l.id::text || p.sku || 'r')) % 3,
  p.reorder_point,
  now() - make_interval(hours => abs(hashtext(l.id::text || p.sku || 'h')) % 48)
FROM inventory_locations l
JOIN products p
  ON p.id = md5('sku-' || ((abs(hashtext(l.id::text)) % 4) + 1)::text)::uuid
WHERE l.workspace_id = '00000000-0000-7000-8000-000000000001'
ON CONFLICT (location_id, product_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Mutasi stok 2 hari terakhir (120 baris teratas dari saldo)
-- ---------------------------------------------------------------------------
INSERT INTO inventory_movements (workspace_id, store_id, product_id, kind, qty, unit_cost_idr, reason, ref, unit, created_at)
SELECT
  b.workspace_id, b.store_id, b.product_id,
  (ARRAY['out','in','out'])[1 + (abs(hashtext(b.id::text)) % 3)],
  1 + (abs(hashtext(b.id::text)) % 24),
  p.cost_idr,
  (ARRAY['Penjualan kasir','Penerimaan PO','Koreksi opname','Transfer gudang'])[1 + (abs(hashtext(b.id::text || b.store_id::text)) % 4)],
  'REF-' || lpad((abs(hashtext(b.id::text)) % 9000 + 1000)::text, 4, '0'),
  p.unit,
  now() - make_interval(hours => abs(hashtext(b.id::text)) % 48)
FROM inventory_balances b
JOIN products p ON p.id = b.product_id
WHERE b.workspace_id = '00000000-0000-7000-8000-000000000001'
ORDER BY b.id
LIMIT 120
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Buku harga: satu buku aktif per toko (20), item harga per produk (300)
-- ---------------------------------------------------------------------------
INSERT INTO price_books (id, workspace_id, store_id, channel, valid_from, status)
SELECT
  md5('pb-' || st.id::text)::uuid,
  st.workspace_id, st.id, st.channel,
  current_date - 30,
  'active'
FROM stores st
WHERE st.workspace_id = '00000000-0000-7000-8000-000000000001'
  AND st.deleted_at IS NULL
ON CONFLICT (store_id) DO NOTHING;

INSERT INTO price_book_items (workspace_id, book_id, product_id, price_idr, cost_idr)
SELECT
  pb.workspace_id, pb.id, p.id,
  p.price_idr + ((abs(hashtext(pb.id::text || p.sku)) % 3) - 1) * 200,
  p.cost_idr
FROM price_books pb
JOIN products p ON true
WHERE pb.workspace_id = '00000000-0000-7000-8000-000000000001'
ON CONFLICT (book_id, product_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Supplier (5), PO (12), garis PO, pengiriman (8)
-- ---------------------------------------------------------------------------
INSERT INTO suppliers (id, workspace_id, name, category, lead_time_days, on_time_pct, active)
SELECT
  md5('sup-' || i)::uuid,
  '00000000-0000-7000-8000-000000000001',
  (ARRAY['PT Distribusi Sinar','PT Pasokan Sehati','CV Moleng Utama','PT Logistik Nusantara','PT Pangan Abadi'])
    [1 + ((i - 1) % 5)],
  (ARRAY['Minuman','Makanan','Bahan Dapur','Logistik','Snack'])[1 + ((i - 1) % 5)],
  2 + (i % 4),
  91.0 - (i * 2.0),
  true
FROM generate_series(1, 5) AS i
ON CONFLICT (id) DO NOTHING;

INSERT INTO purchase_orders (id, workspace_id, store_id, supplier_id, po_code, status, order_date, expected_date, received_pct, total_idr)
SELECT
  md5('po-' || rn)::uuid,
  workspace_id, store_id,
  supplier_id,
  'PO-' || to_char(current_date - rn::int, 'MMDD') || '-' || lpad(rn::text, 3, '0'),
  (ARRAY['draft','sent','confirmed','receiving','received','cancelled'])[1 + (rn::int % 6)],
  current_date - rn::int,
  current_date - rn::int + 3,
  (ARRAY[0,0,0,40,100,0])[1 + (rn::int % 6)],
  (1 + (abs(hashtext(store_id::text)) % 9)) * 1250000::bigint
FROM (
  SELECT row_number() OVER (ORDER BY st.id) AS rn,
         st.id AS store_id, st.workspace_id,
         (SELECT s.id FROM suppliers s WHERE s.workspace_id = st.workspace_id
           ORDER BY s.id LIMIT 1 OFFSET (abs(hashtext(st.id::text)) % 5)) AS supplier_id
  FROM stores st
  WHERE st.workspace_id = '00000000-0000-7000-8000-000000000001'
    AND st.deleted_at IS NULL
  ORDER BY st.id
  LIMIT 12
) po_src
ON CONFLICT (workspace_id, po_code) DO NOTHING;

INSERT INTO po_lines (workspace_id, po_id, product_id, qty_order, qty_received, unit_cost_idr)
SELECT
  po.workspace_id, po.id, p.id,
  2 + (abs(hashtext(po.id::text || p.sku)) % 20),
  CASE WHEN po.status = 'receiving' THEN 1 + (abs(hashtext(po.id::text || p.sku)) % 8) ELSE 0 END,
  p.cost_idr
FROM purchase_orders po
JOIN products p
  ON p.id = md5('sku-' || ((abs(hashtext(po.id::text)) % 4) + 1)::text)::uuid
WHERE po.workspace_id = '00000000-0000-7000-8000-000000000001'
ON CONFLICT DO NOTHING;

INSERT INTO shipments (id, workspace_id, po_id, supplier_name, origin, destination, carrier, tracking_no,
                       eta, status, progress_pct, timeline, last_update, items_summary, temp_ok)
SELECT
  md5('shp-' || rn)::uuid,
  po_src.workspace_id, po_src.id::uuid AS po_id,
  po_src.sname,
  (ARRAY['Depok','Bekasi','Bogor','Cikarang'])[1 + (rn % 4)],
  po_src.store_name,
  (ARRAY['Kavela','CP-Cargo','Logilo'])[1 + (rn % 3)],
  'TRK' || lpad((100000 + (abs(hashtext(po_src.id::text)) % 899999))::text, 6, '0'),
  now() + make_interval(hours => (18 + (rn::int * 7) % 96)::int),
  (ARRAY['booked','picked_up','in_transit','at_hub','out_for_delivery','delivered','delayed'])[1 + (rn % 7)],
  (ARRAY[10,25,50,65,80,95,100])[1 + (rn % 7)],
  jsonb_build_array(
    jsonb_build_object('time', '2026-10-25 09:30', 'label', 'PO dikonfirmasi supplier', 'done', true),
    jsonb_build_object('time', '2026-10-25 14:05', 'label', 'Barang diangkut dari gudang', 'done', true),
    jsonb_build_object('time', '2026-10-26 08:10', 'label', 'Dalam perjalanan',
      'done', (ARRAY['booked','picked_up','in_transit','at_hub','out_for_delivery','delivered','delayed'])[1 + (rn % 7)] IN ('in_transit','at_hub','out_for_delivery','delivered')),
    jsonb_build_object('time', '2026-10-26 17:00', 'label', 'Tiba di toko',
      'done', (ARRAY['booked','picked_up','in_transit','at_hub','out_for_delivery','delivered','delayed'])[1 + (rn % 7)] = 'delivered')
  ),
  now() - make_interval(hours => (rn::int % 5)),
  '12 SKU · 148 unit',
  true
FROM (
  SELECT row_number() OVER (ORDER BY po.id) AS rn,
         po.id, po.workspace_id, po.store_id,
         s.name AS sname, st.name AS store_name
  FROM purchase_orders po
  JOIN suppliers s ON s.id = po.supplier_id
  JOIN stores st ON st.id = po.store_id
  WHERE po.workspace_id = '00000000-0000-7000-8000-000000000001'
  ORDER BY po.id
  LIMIT 8
) po_src
ON CONFLICT (tracking_no) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Monitor: zona (4) & kamera (4) per toko, kunjungan hari ini (maks 800)
-- ---------------------------------------------------------------------------
INSERT INTO zones (id, workspace_id, store_id, name, share, dwell_seconds)
SELECT
  md5('zn-' || st.id::text || '-' || k)::uuid,
  st.workspace_id, st.id,
  CASE k WHEN 'a' THEN 'Entrance' WHEN 'b' THEN 'Rak Dapur' WHEN 'c' THEN 'Chiller' ELSE 'Kasir' END,
  CASE k WHEN 'a' THEN 0.42 WHEN 'b' THEN 0.22 WHEN 'c' THEN 0.21 ELSE 0.15 END,
  CASE k WHEN 'a' THEN 115 WHEN 'b' THEN 210 WHEN 'c' THEN 148 ELSE 90 END
FROM stores st
CROSS JOIN (VALUES ('a'),('b'),('c'),('d')) z(k)
WHERE st.workspace_id = '00000000-0000-7000-8000-000000000001'
  AND st.deleted_at IS NULL
ON CONFLICT (store_id, name) DO NOTHING;

INSERT INTO cameras (workspace_id, store_id, zone_id, name, status, fps)
SELECT
  z.workspace_id, z.store_id, z.id,
  'CAM-' || CASE z.name WHEN 'Entrance' THEN '01' WHEN 'Rak Dapur' THEN '02' WHEN 'Chiller' THEN '03' ELSE '04' END,
  CASE WHEN abs(hashtext(z.id::text)) % 100 < 85 THEN 'online'
       WHEN abs(hashtext(z.id::text)) % 100 < 93 THEN 'degraded'
       ELSE 'offline' END,
  25
FROM zones z
WHERE z.workspace_id = '00000000-0000-7000-8000-000000000001'
ON CONFLICT DO NOTHING;

INSERT INTO visitor_events (workspace_id, store_id, zone_id, entered_at, dwell_seconds, status)
SELECT
  z.workspace_id, z.store_id, z.id,
  date_trunc('hour', now() - make_interval(hours => h))
    + make_interval(secs => abs(hashtext(z.id::text || h::text || g::text)) % 3600),
  8 + (abs(hashtext(z.id::text || h::text || g::text || 'd')) % 300),
  'out'
FROM stores st
JOIN zones z ON z.store_id = st.id
CROSS JOIN GENERATE_SERIES(1, 2) g
CROSS JOIN GENERATE_SERIES(0, 11) h
WHERE z.workspace_id = '00000000-0000-7000-8000-000000000001'
  AND abs(hashtext(z.id::text || h::text || g::text)) % 100 < 55
LIMIT 800
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Integrasi (6), sync runs (48→8 per integrasi? — 6x8 v baris; ambil 8x integrasi)
-- ---------------------------------------------------------------------------
INSERT INTO integrations (id, workspace_id, name, kind, status, store_scope, last_sync, records, latency_ms, note)
SELECT
  md5('int-' || i)::uuid,
  '00000000-0000-7000-8000-000000000001',
  (ARRAY['POS Budaya','Supplier Sehati','Marketplace A','Logistik Nusa','Kompressor CV','POS Mitra'])[i],
  (ARRAY['pos','supplier','ecommerce','logistics','cv'])[1 + (i % 5)],
  (ARRAY['connected','connected','connected','error'])[1 + (i % 4)],
  CASE WHEN i % 2 = 0 THEN 'all' ELSE 'Jawa Barat' END,
  CASE WHEN (i % 4) = 3 THEN NULL ELSE now() - make_interval(hours => (i % 6)) END,
  120 + (i * 340),
  180 + (i * 33),
  CASE WHEN (i % 4) = 3 THEN 'Autentikasi supplier kedaluwarsa' ELSE '' END
FROM generate_series(1, 6) i
ON CONFLICT (id) DO NOTHING;

INSERT INTO integration_sync_runs (workspace_id, integration_id, kind, started_at, duration_s, status, records, message)
SELECT
  '00000000-0000-7000-8000-000000000001',
  i.id,
  (ARRAY['pull','push','webhook'])[1 + (g % 3)],
  now() - make_interval(hours => g * 2),
  8 + (g * 7) % 90,
  CASE WHEN (g % 8) = 4 THEN 'failed' ELSE 'success' END,
  40 + (g * 130) % 800,
  CASE WHEN (g % 8) = 4 THEN 'Timeout koneksi' ELSE '' END
FROM integrations i
CROSS JOIN GENERATE_SERIES(1, 8) g
WHERE i.workspace_id = '00000000-0000-7000-8000-000000000001'
ON CONFLICT DO NOTHING;

INSERT INTO api_keys (workspace_id, name, prefix, masked, scope, status, last_used_at, created_at)
SELECT
  '00000000-0000-7000-8000-000000000001',
  (ARRAY['API Gateway POS','Integration Sehati','Webhook Manual'])[i],
  (ARRAY['sk_pos_','sk_sup_','sk_web_'])[i],
  'sk_****-****' || lpad(i::text, 3, '0'),
  (ARRAY['pos:read','supplier:sync','webhook:write'])[i],
  'active',
  now() - make_interval(hours => i * 7),
  now() - make_interval(days => i * 9)
FROM generate_series(1, 3) i
ON CONFLICT DO NOTHING;

INSERT INTO webhook_events (workspace_id, event, endpoint, status, attempts, at)
SELECT
  '00000000-0000-7000-8000-000000000001',
  (ARRAY['stock.updated','price.changed','po.received'])[1 + (i % 3)],
  'https://ops.internal/webhooks/' || (ARRAY['stock-updated','price-changed','po-received'])[1 + (i % 3)],
  CASE WHEN (i % 3) = 0 THEN 'retrying' ELSE 'ok' END,
  CASE WHEN (i % 3) = 0 THEN 3 ELSE 1 END,
  now() - make_interval(hours => i * 2)
FROM generate_series(1, 6) i
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Laporan (8) + jadwal (3)
-- ---------------------------------------------------------------------------
INSERT INTO reports (workspace_id, title, kind, period_from, period_to, scope, stores_count, status, generated_at, format, metrics)
SELECT
  '00000000-0000-7000-8000-000000000001',
  (ARRAY['Mingguan','Bulanan','Insiden','Kustom'])[1 + (i % 4)] || ' · ' || to_char(current_date - (i * 3), 'DD/Mon'),
  (ARRAY['weekly','monthly','incident','custom'])[1 + (i % 4)],
  current_date - (i * 3 + 6),
  current_date - (i * 3),
  CASE WHEN i % 3 = 0 THEN 'Jawa Barat' ELSE 'all' END,
  4 + (i % 16),
  CASE WHEN i = 8 THEN 'processing' WHEN i = 7 THEN 'scheduled' ELSE 'ready' END,
  CASE WHEN i >= 7 THEN NULL ELSE now() - make_interval(hours => i * 9) END,
  (ARRAY['pdf','csv','xlsx'])[1 + (i % 3)],
  jsonb_build_object('availability_pct', 92.5 - (i * 0.4), 'oos_rate_pct', 4.2 + (i * 0.3), 'visitors', 1240 + (i * 77))
FROM generate_series(1, 8) i
ON CONFLICT DO NOTHING;

INSERT INTO report_schedules (workspace_id, name, cadence, scope, format, recipients, active)
VALUES
  ('00000000-0000-7000-8000-000000000001','Laporan Mingguan Regional','weekly','all','pdf',ARRAY['rina@shelfops.local','ops@shelfops.local'],true),
  ('00000000-0000-7000-8000-000000000001','Laporan Bulanan Regional','monthly','Jawa Barat','xlsx',ARRAY['budi@shelfops.local'],true),
  ('00000000-0000-7000-8000-000000000001','Laporan Insiden Mingguan','weekly','Jawa Timur','csv',ARRAY['sari@shelfops.local'],false)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Papan tugas (18 task, kaitkan dengan alert pertama toko bila ada)
-- ---------------------------------------------------------------------------
INSERT INTO tasks (workspace_id, store_id, title, detail, due_at, status, priority, assignee, checklist, created_at, source)
SELECT
  ws.id, st.id,
  (ARRAY['Restock rak minuman dingin','Pindahkan Stok dari Backroom','Perbaiki Label Harga',
         'Foto Ulang Rak','Cek Toleransi Harga','Ganti Poster Promosi'])[1 + (i % 6)],
  'Ditugaskan otomatis dari alert — cek rak, foto ulang, sinkronkan metric.',
  CASE WHEN i % 6 = 0 THEN now() - make_interval(hours => 6)
       ELSE now() + make_interval(hours => 12 + (i * 6)) END,
  CASE WHEN i % 4 = 2 THEN 'done'
       WHEN i % 4 = 1 THEN 'in_progress'
       WHEN i % 6 = 0 THEN 'overdue'
       ELSE 'open' END,
  (ARRAY['high','normal','normal','low','normal','normal'])[1 + (i % 6)],
  (ARRAY['Budi','Rina','Sari'])[1 + (i % 3)],
  CASE WHEN i % 4 = 3 THEN '[]'::jsonb ELSE jsonb_build_array(
    jsonb_build_object('text', 'Cek rak sekarang', 'done', i % 4 = 2),
    jsonb_build_object('text', 'Restock dari gudang bila kosong', 'done', false),
    jsonb_build_object('text', 'Foto ulang ke app', 'done', false)
  ) END,
  now() - make_interval(hours => i * 3),
  'agent'
FROM workspaces ws
CROSS JOIN generate_series(1, 18) i
CROSS JOIN LATERAL (
  SELECT id, name FROM stores
  WHERE workspace_id = ws.id AND deleted_at IS NULL
  ORDER BY id LIMIT 1 OFFSET (i % 20)
) st
WHERE ws.id = '00000000-0000-7000-8000-000000000001'
ON CONFLICT DO NOTHING;
