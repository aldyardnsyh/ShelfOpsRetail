-- 000001_init (down) — hapus seluruh skema inti.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'benchmark_runs','model_registry','eval_results','eval_runs','eval_cases','eval_datasets',
    'tasks','alerts','audit_metrics','price_tags','detections','audit_images','audit_sessions',
    'planograms','stores','ai_budget','ai_usage_daily','llm_traces','failure_cases','feedback',
    'tool_calls','message_citations','messages','conversations','ingestion_jobs','chunks',
    'document_versions','documents','idempotency_keys','upload_slots','audit_logs',
    'refresh_tokens','memberships','users','workspaces'
  ] LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', t);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS set_updated_at();
