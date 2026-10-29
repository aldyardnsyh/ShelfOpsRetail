-- 000006_demo_reset — reset workspace demo + GC berkas kedaluwarsa (BR-08, TC-DEMO-01).
-- Dijalankan sebagai job terjadwal (River) dan tidak menyentuh sample data
-- (baris yang dibuat user seed tetap utuh).

CREATE OR REPLACE FUNCTION demo_reset(p_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_users integer := 0;
  v_conversations integer := 0;
  v_documents integer := 0;
  v_audits integer := 0;
  v_tokens integer := 0;
  v_slots integer := 0;
  cutoff timestamptz := now() - make_interval(hours => greatest(p_hours, 1));
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS tmp_demo_users ON COMMIT DROP AS
  SELECT id FROM users
  WHERE is_demo = true
    AND coalesce(last_login_at, created_at) < cutoff;

  DELETE FROM conversations WHERE user_id IN (SELECT id FROM tmp_demo_users);
  GET DIAGNOSTICS v_conversations = ROW_COUNT;

  DELETE FROM documents WHERE created_by IN (SELECT id FROM tmp_demo_users);
  GET DIAGNOSTICS v_documents = ROW_COUNT;

  DELETE FROM audit_sessions WHERE created_by IN (SELECT id FROM tmp_demo_users);
  GET DIAGNOSTICS v_audits = ROW_COUNT;

  DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM tmp_demo_users);
  GET DIAGNOSTICS v_tokens = ROW_COUNT;

  DELETE FROM memberships WHERE user_id IN (SELECT id FROM tmp_demo_users);
  DELETE FROM users WHERE id IN (SELECT id FROM tmp_demo_users);
  GET DIAGNOSTICS v_users = ROW_COUNT;

  DELETE FROM upload_slots WHERE expires_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_slots = ROW_COUNT;

  RETURN jsonb_build_object(
    'users_removed', v_users,
    'conversations_removed', v_conversations,
    'documents_removed', v_documents,
    'audit_sessions_removed', v_audits,
    'refresh_tokens_removed', v_tokens,
    'upload_slots_gc', v_slots,
    'cutoff', cutoff
  );
END $$;

-- Berkas yatim (storage_key yang tidak lagi direferensikan) dibersihkan oleh
-- `shelfops gc --objects` di sisi Go, karena menyentuh filesystem.

-- Berkas yatim untuk GC sisi Go (dijalankan job object_gc).
CREATE OR REPLACE FUNCTION gc_orphan_uploads(p_cutoff timestamptz)
RETURNS SETOF text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT object_key FROM upload_slots
   WHERE used_at IS NULL AND expires_at < p_cutoff
  UNION
  SELECT storage_key FROM document_versions
   WHERE status = 'superseded' AND created_at < p_cutoff
$$;