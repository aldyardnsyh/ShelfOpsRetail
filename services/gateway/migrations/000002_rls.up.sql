-- 000002_rls — Postgres Row Level Security sebagai lapis kedua (PRD §17).
-- Gateway men-set `SET LOCAL app.workspace_id = '<uuid>'` per transaksi workspace.
-- Catatan jujur: RLS tidak berlaku untuk superuser/pemilik tabel kecuali FORCE.
-- Karena itu policy di bawah memakai FORCE ROW LEVEL SECURITY, dan produksi
-- sebaiknya memakai role aplikasi non-superuser (lihat infra/scripts/vps-bootstrap.sh).

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'memberships','refresh_tokens','upload_slots','idempotency_keys','documents',
    'document_versions','chunks','ingestion_jobs','conversations','messages',
    'message_citations','tool_calls','feedback','failure_cases','llm_traces',
    'ai_usage_daily','stores','planograms','audit_sessions','audit_images','detections',
    'price_tags','audit_metrics','alerts','tasks','eval_datasets','eval_cases','eval_runs',
    'eval_results','audit_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY ws_isolation ON %I
        USING (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
        WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
    $f$, t);
  END LOOP;
END $$;

-- Tabel tanpa workspace_id namun tetap perlu proteksi:
-- users: hanya boleh melihat dirinya atau anggota workspace aktif.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_self_or_member ON users
  USING (
    id = nullif(current_setting('app.user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = users.id
        AND m.workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid
    )
  );

-- workspaces: hanya workspace aktif.
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY workspaces_active ON workspaces
  USING (id = nullif(current_setting('app.workspace_id', true), '')::uuid);

-- ai_budget & benchmark_runs & model_registry bersifat global → tanpa RLS tenant.
-- benchmark_runs.workspace_id boleh NULL untuk hasil prakomputasi.
