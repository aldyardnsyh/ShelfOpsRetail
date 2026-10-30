-- 000018_setup — konfigurasi setup produksi per workspace (key-value) + RLS.
--
-- Wizard /setup di web menyimpan pilihan operator di sini (bukan env),
-- supaya vendor yang punya akses penuh tinggal isi dari browser:
-- nama workspace, provider AI + key, dan status setup selesai.
-- Secret disimpan apa adanya; baca terbatas ke admin (RLS workspace).

CREATE TABLE IF NOT EXISTS workspace_config (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key          text NOT NULL,
  value        text NOT NULL DEFAULT '',
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, key)
);

ALTER TABLE workspace_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_config FORCE ROW LEVEL SECURITY;
CREATE POLICY ws_isolation ON workspace_config
  USING (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
