-- 000016_demo_recent_integrations (down)

DELETE FROM webhook_events
WHERE id IN (SELECT md5('wh-recent-' || g)::uuid FROM generate_series(1, 9) AS g);

DELETE FROM integration_sync_runs
WHERE id IN (
  SELECT md5('sync-recent-' || i.id::text || '-' || g)::uuid
  FROM integrations i CROSS JOIN generate_series(1, 4) AS g
  WHERE i.workspace_id = '00000000-0000-7000-8000-000000000001'::uuid
);