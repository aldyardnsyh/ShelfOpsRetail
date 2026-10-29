-- 000001_init — skema inti ShelfOps (PRD §10).
-- Konvensi: PK uuid (UUIDv7 dibuat aplikasi, default gen_random_uuid() sebagai pengaman),
-- semua tabel tenant punya workspace_id + created_at/updated_at, soft delete via deleted_at.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Helper: updated_at otomatis
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- M1 Auth & Workspace
-- ---------------------------------------------------------------------------
CREATE TABLE workspaces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  is_demo         boolean NOT NULL DEFAULT false,
  demo_expires_at timestamptz,
  locale          text NOT NULL DEFAULT 'id' CHECK (locale IN ('id','en')),
  settings        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  password_hash text,
  name          text NOT NULL,
  locale        text NOT NULL DEFAULT 'id' CHECK (locale IN ('id','en')),
  is_demo       boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE UNIQUE INDEX users_email_uniq ON users (lower(email)) WHERE deleted_at IS NULL;

CREATE TABLE memberships (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('admin','analyst','auditor','viewer')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id)
);
CREATE INDEX memberships_workspace_idx ON memberships (workspace_id);

CREATE TABLE refresh_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  rotated_from uuid REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  user_agent   text,
  ip           inet,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id, expires_at);

CREATE TABLE audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  actor_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action       text NOT NULL,
  entity       text NOT NULL,
  entity_id    uuid,
  ip           inet,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_ws_at_idx ON audit_logs (workspace_id, at DESC);

-- ---------------------------------------------------------------------------
-- Upload slot + idempotency (ObjectStore lewat token sekali pakai)
-- ---------------------------------------------------------------------------
CREATE TABLE upload_slots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  purpose      text NOT NULL CHECK (purpose IN ('document','audit_image')),
  object_key   text NOT NULL UNIQUE,
  filename     text NOT NULL,
  mime         text NOT NULL,
  max_bytes    bigint NOT NULL,
  token_hash   text NOT NULL,
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX upload_slots_ws_idx ON upload_slots (workspace_id, created_at DESC);

CREATE TABLE idempotency_keys (
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key             text NOT NULL,
  request_hash    text NOT NULL,
  response_status int NOT NULL,
  response_body   jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, key)
);

-- ---------------------------------------------------------------------------
-- M2 Knowledge Base
-- ---------------------------------------------------------------------------
CREATE TABLE documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title           text NOT NULL,
  source_uri      text,
  mime            text NOT NULL,
  language        text NOT NULL DEFAULT 'id' CHECK (language IN ('id','en')),
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','parsing','chunking','embedding','ready','failed')),
  current_version integer NOT NULL DEFAULT 1,
  size_bytes      bigint NOT NULL DEFAULT 0,
  chunk_count     integer NOT NULL DEFAULT 0,
  error           text,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  last_indexed_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX documents_ws_created_idx ON documents (workspace_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX documents_ws_status_idx ON documents (workspace_id, status) WHERE deleted_at IS NULL;

CREATE TABLE document_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version      integer NOT NULL,
  checksum     text NOT NULL,
  storage_key  text NOT NULL,
  size_bytes   bigint NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','active','superseded','failed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);

CREATE TABLE chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version      integer NOT NULL,
  ordinal      integer NOT NULL,
  content      text NOT NULL,
  heading_path text NOT NULL DEFAULT '',
  page         integer,
  token_count  integer NOT NULL DEFAULT 0,
  lang         regconfig NOT NULL DEFAULT 'indonesian',
  embedding    vector(1024),
  tsv          tsvector GENERATED ALWAYS AS (to_tsvector(lang, content)) STORED,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version, ordinal)
);
CREATE INDEX chunks_ws_doc_idx ON chunks (workspace_id, document_id, version, ordinal);
CREATE INDEX chunks_tsv_idx ON chunks USING gin (tsv);
-- HNSW: m=16, ef_construction=64 (PRD §9.1). Tuning lewat eval.
CREATE INDEX chunks_embedding_idx ON chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE TABLE ingestion_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  state        text NOT NULL DEFAULT 'queued'
               CHECK (state IN ('queued','parsing','chunking','embedding','ready','failed')),
  attempts     integer NOT NULL DEFAULT 0,
  error        text,
  river_job_id bigint,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ingestion_jobs_doc_idx ON ingestion_jobs (document_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- M3 Copilot Chat
-- ---------------------------------------------------------------------------
CREATE TABLE conversations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  title        text NOT NULL DEFAULT 'Percakapan baru',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX conversations_ws_idx ON conversations (workspace_id, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content         text NOT NULL DEFAULT '',
  model           text,
  provider        text,
  tokens_in       integer NOT NULL DEFAULT 0,
  tokens_out      integer NOT NULL DEFAULT 0,
  cost_usd        numeric(12,6) NOT NULL DEFAULT 0,
  latency_ms      integer NOT NULL DEFAULT 0,
  refused         boolean NOT NULL DEFAULT false,
  replay          boolean NOT NULL DEFAULT false,
  request_id      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at);
CREATE INDEX messages_ws_idx ON messages (workspace_id, created_at DESC);

CREATE TABLE message_citations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  message_id    uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  chunk_id      uuid REFERENCES chunks(id) ON DELETE SET NULL,
  document_id   uuid REFERENCES documents(id) ON DELETE SET NULL,
  ordinal       integer NOT NULL,
  score         real NOT NULL DEFAULT 0,
  page          integer,
  heading_path  text NOT NULL DEFAULT '',
  snippet       text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX message_citations_message_idx ON message_citations (message_id, ordinal);

CREATE TABLE tool_calls (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  message_id            uuid REFERENCES messages(id) ON DELETE CASCADE,
  conversation_id       uuid REFERENCES conversations(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  args                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary        text,
  result_payload        jsonb,
  duration_ms           integer NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','awaiting_confirmation','running','done','failed','rejected')),
  requires_confirmation boolean NOT NULL DEFAULT false,
  confirmed_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tool_calls_ws_idx ON tool_calls (workspace_id, created_at DESC);
CREATE INDEX tool_calls_conversation_idx ON tool_calls (conversation_id, created_at);

CREATE TABLE feedback (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  message_id        uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id           uuid REFERENCES users(id) ON DELETE SET NULL,
  value             text NOT NULL CHECK (value IN ('up','down')),
  reason            text,
  promoted_case_id  uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feedback_ws_idx ON feedback (workspace_id, created_at DESC);

CREATE TABLE failure_cases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source            text NOT NULL CHECK (source IN ('feedback','low_confidence','error')),
  question          text,
  answer            text,
  reason            text,
  request_id        text,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  promoted_case_id  uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX failure_cases_ws_idx ON failure_cases (workspace_id, created_at DESC);

CREATE TABLE llm_traces (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  request_id   text NOT NULL,
  stage        text NOT NULL,
  span_id      text,
  parent_span  text,
  input_hash   text,
  latency_ms   integer NOT NULL DEFAULT 0,
  tokens_in    integer NOT NULL DEFAULT 0,
  tokens_out   integer NOT NULL DEFAULT 0,
  cost_usd     numeric(12,6) NOT NULL DEFAULT 0,
  model        text,
  provider     text,
  status       text NOT NULL DEFAULT 'ok',
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX llm_traces_request_idx ON llm_traces (request_id, started_at);
CREATE INDEX llm_traces_ws_idx ON llm_traces (workspace_id, started_at DESC);
CREATE INDEX llm_traces_stage_idx ON llm_traces (stage, started_at DESC);

-- Kuota & biaya AI (PRD §9.2, BR-09)
CREATE TABLE ai_usage_daily (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  day          date NOT NULL,
  provider     text NOT NULL,
  requests     integer NOT NULL DEFAULT 0,
  errors_429   integer NOT NULL DEFAULT 0,
  tokens_in    bigint NOT NULL DEFAULT 0,
  tokens_out   bigint NOT NULL DEFAULT 0,
  cost_usd     numeric(12,6) NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, day, provider)
);

CREATE TABLE ai_budget (
  day         date PRIMARY KEY,
  requests    integer NOT NULL DEFAULT 0,
  cost_usd    numeric(12,6) NOT NULL DEFAULT 0,
  cap_usd     numeric(12,6),
  replay_mode boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- M4 Shelf Audit
-- ---------------------------------------------------------------------------
CREATE TABLE stores (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  code         text NOT NULL,
  name         text NOT NULL,
  region       text NOT NULL DEFAULT '',
  channel      text NOT NULL DEFAULT 'minimarket',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  UNIQUE (workspace_id, code)
);

CREATE TABLE planograms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  config       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE TABLE audit_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  store_id      uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  planogram_id  uuid REFERENCES planograms(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','processing','review','final','partial')),
  score         integer,
  audit_date    date NOT NULL DEFAULT current_date,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX audit_sessions_ws_idx ON audit_sessions (workspace_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX audit_sessions_store_idx ON audit_sessions (store_id, audit_date DESC);

CREATE TABLE audit_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id   uuid NOT NULL REFERENCES audit_sessions(id) ON DELETE CASCADE,
  storage_key  text NOT NULL,
  mime         text NOT NULL DEFAULT 'image/jpeg',
  size_bytes   bigint NOT NULL DEFAULT 0,
  width        integer,
  height       integer,
  status       text NOT NULL DEFAULT 'uploaded'
               CHECK (status IN ('uploaded','queued','processing','done','failed')),
  error        text,
  attempts     integer NOT NULL DEFAULT 0,
  low_confidence boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_images_session_idx ON audit_images (session_id, created_at);
CREATE INDEX audit_images_status_idx ON audit_images (workspace_id, status);

CREATE TABLE detections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  image_id     uuid NOT NULL REFERENCES audit_images(id) ON DELETE CASCADE,
  x1           real NOT NULL,
  y1           real NOT NULL,
  x2           real NOT NULL,
  y2           real NOT NULL,
  confidence   real NOT NULL,
  label        text,
  label_score  real,
  row_index    integer,
  source       text NOT NULL DEFAULT 'model' CHECK (source IN ('model','manual')),
  corrected_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  CHECK (x2 > x1 AND y2 > y1)
);
CREATE INDEX detections_image_idx ON detections (image_id) WHERE deleted_at IS NULL;
CREATE INDEX detections_ws_idx ON detections (workspace_id, created_at DESC);

CREATE TABLE price_tags (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  image_id            uuid NOT NULL REFERENCES audit_images(id) ON DELETE CASCADE,
  detection_id        uuid REFERENCES detections(id) ON DELETE SET NULL,
  x1 real NOT NULL, y1 real NOT NULL, x2 real NOT NULL, y2 real NOT NULL,
  raw_text            text NOT NULL DEFAULT '',
  price_idr           bigint,
  ocr_confidence      real NOT NULL DEFAULT 0,
  matched_label       text,
  reference_price_idr bigint,
  mismatch            boolean NOT NULL DEFAULT false,
  edited_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX price_tags_image_idx ON price_tags (image_id);

CREATE TABLE audit_metrics (
  session_id       uuid PRIMARY KEY REFERENCES audit_sessions(id) ON DELETE CASCADE,
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  facing_total     integer NOT NULL DEFAULT 0,
  oos_count        integer NOT NULL DEFAULT 0,
  price_mismatch   integer NOT NULL DEFAULT 0,
  price_read       integer NOT NULL DEFAULT 0,
  compliance_score integer,
  breakdown        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  session_id   uuid REFERENCES audit_sessions(id) ON DELETE SET NULL,
  type         text NOT NULL CHECK (type IN ('oos','price_mismatch','low_confidence')),
  severity     text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  detail       text NOT NULL DEFAULT '',
  acknowledged_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alerts_ws_status_idx ON alerts (workspace_id, status, created_at DESC);

CREATE TABLE tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  store_id     uuid REFERENCES stores(id) ON DELETE SET NULL,
  title        text NOT NULL,
  due_at       timestamptz,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  source       text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','agent')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_ws_idx ON tasks (workspace_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- M6 Eval & Observability
-- ---------------------------------------------------------------------------
CREATE TABLE eval_datasets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE eval_cases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  dataset_id       uuid NOT NULL REFERENCES eval_datasets(id) ON DELETE CASCADE,
  question         text NOT NULL,
  expected_answer  text NOT NULL DEFAULT '',
  expected_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags             text[] NOT NULL DEFAULT '{}',
  answerable       boolean NOT NULL DEFAULT true,
  language         text NOT NULL DEFAULT 'id' CHECK (language IN ('id','en')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX eval_cases_dataset_idx ON eval_cases (dataset_id, created_at);

CREATE TABLE eval_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  dataset_id      uuid NOT NULL REFERENCES eval_datasets(id) ON DELETE CASCADE,
  kind            text NOT NULL DEFAULT 'rag' CHECK (kind IN ('rag','agent','cv')),
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','running','completed','failed','cancelled')),
  config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics         jsonb NOT NULL DEFAULT '{}'::jsonb,
  baseline_of     uuid REFERENCES eval_runs(id) ON DELETE SET NULL,
  use_replay      boolean NOT NULL DEFAULT true,
  error           text,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);
CREATE INDEX eval_runs_ws_idx ON eval_runs (workspace_id, created_at DESC);

CREATE TABLE eval_results (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id             uuid NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  case_id            uuid NOT NULL REFERENCES eval_cases(id) ON DELETE CASCADE,
  answer             text NOT NULL DEFAULT '',
  refused            boolean NOT NULL DEFAULT false,
  hit_at_5           real,
  mrr                real,
  context_recall     real,
  faithfulness       real,
  answer_relevance   real,
  answer_correctness real,
  citation_precision real,
  citation_recall    real,
  latency_ms         integer NOT NULL DEFAULT 0,
  cost_usd           numeric(12,6) NOT NULL DEFAULT 0,
  detail             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, case_id)
);

CREATE TABLE model_registry (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  version    text NOT NULL,
  hash       text,
  kind       text NOT NULL DEFAULT 'detector' CHECK (kind IN ('detector','embedding','llm','prompt')),
  metrics    jsonb NOT NULL DEFAULT '{}'::jsonb,
  status     text NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','active','retired','placeholder')),
  notes      text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

CREATE TABLE benchmark_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  model_variant  text NOT NULL CHECK (model_variant IN ('fp32','fp16','int8','cloud_vlm')),
  hardware       text NOT NULL DEFAULT '',
  imgsz          integer NOT NULL DEFAULT 640,
  batch          integer NOT NULL DEFAULT 1,
  p50_ms         real,
  p95_ms         real,
  throughput_ips real,
  memory_mb      real,
  model_size_mb  real,
  map50          real,
  count_mape     real,
  dataset        text NOT NULL DEFAULT '',
  notes          text NOT NULL DEFAULT '',
  committed      boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Trigger updated_at
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workspaces','users','memberships','documents','ingestion_jobs','conversations',
    'tool_calls','stores','planograms','audit_sessions','audit_images','detections',
    'price_tags','audit_metrics','alerts','tasks','eval_datasets','eval_cases'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;
