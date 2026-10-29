-- 000013_demo_visitor_recent
--
-- Data seed 000009 menaruh visitor_events di masa lalu, sehingga grafik
-- "pengunjung per jam" (12 jam terakhir) dan footfall zona hari ini selalu nol.
-- Migrasi ini menambahkan kunjungan contoh yang tersebar di 12 jam terakhir
-- untuk setiap toko demo yang belum punya data hari ini.
--
-- Deterministik dan idempoten: id = md5, dan blok INSERT dilewati bila toko
-- sudah memiliki event dalam 12 jam terakhir.

SELECT setseed(0.42);

WITH plan(hours_ago, visits) AS (
  VALUES (11, 6), (10, 4), (9, 3), (8, 2), (7, 5), (6, 9),
         (5, 14), (4, 18), (3, 22), (2, 16), (1, 11), (0, 7)
),
targets AS (
  SELECT st.id AS store_id, st.workspace_id,
         (SELECT array_agg(z.id ORDER BY z.name)
            FROM zones z WHERE z.store_id = st.id) AS zone_ids
  FROM stores st
  WHERE st.workspace_id = '00000000-0000-7000-8000-000000000001'::uuid
    AND st.deleted_at IS NULL
),
missing AS (
  SELECT t.* FROM targets t
  WHERE t.zone_ids IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM visitor_events ve
      WHERE ve.store_id = t.store_id
        AND ve.entered_at >= now() - interval '12 hours'
    )
)
INSERT INTO visitor_events (id, workspace_id, store_id, zone_id, entered_at, dwell_seconds, status)
SELECT
  md5('ve-recent-' || m.store_id::text || '-' || p.hours_ago || '-' || g)::uuid,
  m.workspace_id,
  m.store_id,
  m.zone_ids[1 + ((p.hours_ago * 7 + g) % array_length(m.zone_ids, 1))],
  date_trunc('hour', now())
    - make_interval(hours => p.hours_ago)
    + make_interval(mins => (g * 4) % 60),
  60 + ((p.hours_ago * 37 + g * 13) % 420),
  CASE WHEN g % 5 = 0 THEN 'in' ELSE 'out' END
FROM missing m
CROSS JOIN plan p
CROSS JOIN LATERAL generate_series(1, p.visits) AS g
ON CONFLICT (id) DO NOTHING;