-- 000002_rls (down)
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
    EXECUTE format('DROP POLICY IF EXISTS ws_isolation ON %I', t);
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS users_self_or_member ON users;
ALTER TABLE users NO FORCE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspaces_active ON workspaces;
ALTER TABLE workspaces NO FORCE ROW LEVEL SECURITY;
ALTER TABLE workspaces DISABLE ROW LEVEL SECURITY;
