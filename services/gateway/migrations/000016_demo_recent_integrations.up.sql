-- 000016_demo_recent_integrations
--
-- Kartu "Event 24 jam" dan "Gagal 24 jam" selalu nol karena event integrasi
-- seed berumur lebih dari 24 jam. Migrasi ini menambahkan event webhook dan
-- sinkronisasi dalam 24 jam terakhir.
--
-- Deterministik dan idempoten.

SELECT setseed(0.42);

INSERT INTO webhook_events (id, workspace_id, event, endpoint, status, attempts, at)
SELECT
  md5('wh-recent-' || g)::uuid,
  '00000000-0000-7000-8000-000000000001'::uuid,
  (ARRAY['price.changed', 'stock.low', 'audit.finished', 'po.received', 'task.created'])[1 + (g % 5)],
  'https://ops.internal/webhooks/' || (ARRAY['price', 'stock', 'audit', 'po', 'task'])[1 + (g % 5)],
  CASE WHEN g = 4 THEN 'failed' ELSE 'ok' END,
  1 + (g % 3),
  now() - make_interval(hours => (g * 3) % 20, mins => (g * 7) % 60)
FROM generate_series(1, 9) AS g
ON CONFLICT (id) DO NOTHING;

INSERT INTO integration_sync_runs (id, workspace_id, integration_id, kind, started_at, duration_s, status, records, message)
SELECT
  md5('sync-recent-' || i.id::text || '-' || g)::uuid,
  i.workspace_id, i.id,
  (ARRAY['push', 'pull', 'webhook'])[1 + (g % 3)],
  now() - make_interval(hours => (g * 4) % 22, mins => (g * 11) % 60),
  8 + ((g * 7) % 40),
  CASE WHEN g = 3 THEN 'failed' ELSE 'success' END,
  40 + ((g * 37) % 260),
  CASE WHEN g = 3 THEN 'timeout saat handshake' ELSE '' END
FROM integrations i
CROSS JOIN generate_series(1, 4) AS g
WHERE i.workspace_id = '00000000-0000-7000-8000-000000000001'::uuid
  AND i.status = 'connected'
ON CONFLICT (id) DO NOTHING;