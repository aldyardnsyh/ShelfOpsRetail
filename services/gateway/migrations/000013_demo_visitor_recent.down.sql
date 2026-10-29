-- 000013_demo_visitor_recent (down)
-- Menghapus kunjungan contoh yang ditambahkan migrasi ini.

DELETE FROM visitor_events
WHERE id IN (
  SELECT md5('ve-recent-' || st.id::text || '-' || p.hours_ago || '-' || g)::uuid
  FROM stores st
  CROSS JOIN (VALUES (11),(10),(9),(8),(7),(6),(5),(4),(3),(2),(1),(0)) AS p(hours_ago)
  CROSS JOIN LATERAL generate_series(1, 22) AS g
  WHERE st.workspace_id = '00000000-0000-7000-8000-000000000001'::uuid
);