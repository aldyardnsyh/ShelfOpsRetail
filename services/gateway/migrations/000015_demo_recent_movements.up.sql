-- 000015_demo_recent_movements
--
-- Kartu "mutasi 48 jam" pada inventori selalu nol karena seluruh mutasi seed
-- berumur lebih dari 48 jam. Migrasi ini menambahkan mutasi masuk/keluar dalam
-- 48 jam terakhir untuk setiap toko demo yang punya saldo.
--
-- Deterministik dan idempoten (id md5, ON CONFLICT DO NOTHING).

SELECT setseed(0.42);

WITH balances AS (
  SELECT b.workspace_id, b.store_id, b.product_id, p.cost_idr,
         row_number() OVER (PARTITION BY b.store_id ORDER BY p.sku) AS rn
  FROM inventory_balances b
  JOIN products p ON p.id = b.product_id
  WHERE b.workspace_id = '00000000-0000-7000-8000-000000000001'::uuid
),
picked AS (
  SELECT * FROM balances WHERE rn <= 4
),
plan(hours_ago, kind, qty, reason) AS (
  VALUES (44, 'in', 24, 'Penerimaan PO'),
         (37, 'out', 6, 'Penjualan harian'),
         (30, 'in', 12, 'Retur gudang'),
         (26, 'out', 3, 'Rusak saat display'),
         (19, 'adjust', 2, 'Koreksi stock opname'),
         (13, 'out', 5, 'Penjualan harian'),
         (7, 'in', 18, 'Penerimaan PO'),
         (3, 'out', 4, 'Penjualan harian'),
         (1, 'in', 9, 'Restock rak')
)
INSERT INTO inventory_movements (id, workspace_id, store_id, product_id, kind, qty, unit_cost_idr, reason, ref, unit, created_at)
SELECT
  md5('mv-recent-' || p.store_id::text || '-' || p.product_id::text || '-' || pl.hours_ago)::uuid,
  p.workspace_id, p.store_id, p.product_id, pl.kind, pl.qty, p.cost_idr, pl.reason,
  'DEMO-' || to_char(now() - make_interval(hours => pl.hours_ago), 'MMDDHH24'),
  'pcs',
  now() - make_interval(hours => pl.hours_ago)
FROM picked p
CROSS JOIN plan pl
ON CONFLICT (id) DO NOTHING;