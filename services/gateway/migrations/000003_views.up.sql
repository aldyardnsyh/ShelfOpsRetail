-- 000003_seed_helpers — view bantu dashboard + helper demo (dipakai seed & query).
-- Angka dashboard selalu dihitung dari tabel (tidak ada angka hard-coded di UI).

CREATE OR REPLACE VIEW v_audit_daily WITH (security_invoker = true) AS
SELECT
  s.workspace_id,
  s.audit_date AS day,
  count(DISTINCT s.id) FILTER (WHERE s.status IN ('review','final','partial')) AS audits,
  avg(m.compliance_score) FILTER (WHERE m.compliance_score IS NOT NULL) AS avg_compliance,
  sum(m.facing_total) AS facing_total,
  sum(m.oos_count) AS oos_count,
  sum(m.price_read) AS price_read,
  sum(m.price_mismatch) AS price_mismatch
FROM audit_sessions s
LEFT JOIN audit_metrics m ON m.session_id = s.id
WHERE s.deleted_at IS NULL
GROUP BY s.workspace_id, s.audit_date;

CREATE OR REPLACE VIEW v_store_performance WITH (security_invoker = true) AS
SELECT
  st.workspace_id,
  st.id AS store_id,
  st.name AS store_name,
  st.region,
  count(DISTINCT s.id) FILTER (WHERE s.status IN ('review','final','partial')) AS audits,
  avg(m.compliance_score) FILTER (WHERE m.compliance_score IS NOT NULL) AS avg_compliance,
  sum(m.oos_count) AS oos_count,
  sum(m.facing_total) AS facing_total,
  max(s.created_at) FILTER (WHERE s.status IN ('review','final','partial')) AS last_audit_at
FROM stores st
LEFT JOIN audit_sessions s ON s.store_id = st.id AND s.deleted_at IS NULL
LEFT JOIN audit_metrics m ON m.session_id = s.id
WHERE st.deleted_at IS NULL
GROUP BY st.workspace_id, st.id, st.name, st.region;
