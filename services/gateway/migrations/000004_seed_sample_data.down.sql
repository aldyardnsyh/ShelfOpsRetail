-- 000004_seed_sample_data (down) — hapus seluruh sample data fiktif.
DO $$
DECLARE ws uuid := '00000000-0000-7000-8000-000000000001';
BEGIN
  DELETE FROM alerts WHERE workspace_id = ws;
  DELETE FROM audit_metrics WHERE workspace_id = ws;
  DELETE FROM detections WHERE workspace_id = ws;
  DELETE FROM audit_images WHERE workspace_id = ws;
  DELETE FROM audit_sessions WHERE workspace_id = ws;
  DELETE FROM planograms WHERE workspace_id = ws;
  DELETE FROM stores WHERE workspace_id = ws;
  DELETE FROM memberships WHERE workspace_id = ws;
  DELETE FROM refresh_tokens WHERE workspace_id = ws;
  DELETE FROM users WHERE id IN (
    '00000000-0000-7000-8000-000000000101',
    '00000000-0000-7000-8000-000000000102');
  DELETE FROM workspaces WHERE id = ws;
END $$;
