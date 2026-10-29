-- 000008_ops_domains — domain operasional + data lab yang belum ada di init:
-- tasks (perluasan), katalog inventory, pricing, purchasing, tracking, monitor
-- (kamera/zona/pengunjung), integrasi, laporan, dan seed data lab
-- (conversations/messages/citations, llm_traces, eval, benchmark, audit_images/
-- detections/price_tags untuk detail audit & pricing).
-- Deterministik seperti 000004 (setseed), idempotent (ON CONFLICT DO NOTHING).

-- Tambah kolom tasks yang dipakai papan tugas (TaskRow) tanpa merusak data lama.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS detail      text NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS alert_id    uuid REFERENCES alerts(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS alert_type  text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS severity    text NOT NULL DEFAULT 'medium'
                CHECK (severity IN ('low','medium','high'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority    text NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('low','normal','high'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee    text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS checklist   jsonb NOT NULL DEFAULT '[]'::jsonb;

-- tasks.status perlu 'in_progress' & 'overdue' untuk papan kanban.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('open','in_progress','done','cancelled','overdue'));

-- ---------------------------------------------------------------------------
-- Katalog & stok (M3 PRD: inventory sederhana)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sku           text NOT NULL,
  name          text NOT NULL,
  category      text NOT NULL DEFAULT '',
  sub_category  text NOT NULL DEFAULT '',
  unit          text NOT NULL DEFAULT 'pcs',
  price_idr     bigint NOT NULL DEFAULT 0,
  cost_idr      bigint NOT NULL DEFAULT 0,
  reorder_point integer NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  UNIQUE (workspace_id, sku)
);

CREATE TABLE IF NOT EXISTS inventory_locations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name         text NOT NULL,
  kind         text NOT NULL DEFAULT 'shelf' CHECK (kind IN ('shelf','backroom','chiller')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  UNIQUE (store_id, name)
);
CREATE INDEX inventory_locations_ws_idx ON inventory_locations (workspace_id);

CREATE TABLE IF NOT EXISTS inventory_balances (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  store_id         uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  location_id      uuid NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  product_id       uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  on_hand          integer NOT NULL DEFAULT 0,
  reserved         integer NOT NULL DEFAULT 0,
  reorder_point    integer NOT NULL DEFAULT 0,
  last_movement_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, product_id)
);
CREATE INDEX inventory_balances_ws_idx ON inventory_balances (workspace_id);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  store_id      uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('in','out','adjust','transfer')),
  qty           integer NOT NULL,
  unit_cost_idr bigint NOT NULL DEFAULT 0,
  reason        text NOT NULL DEFAULT '',
  ref           text NOT NULL DEFAULT '',
  unit          text NOT NULL DEFAULT 'pcs',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_ws_idx ON inventory_movements (workspace_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Pricing: buku harga per toko (price_tags tetap untuk hasil OCR audit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_books (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  channel      text NOT NULL DEFAULT 'minimarket',
  valid_from   date NOT NULL DEFAULT current_date - interval '30 days',
  valid_to     date,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','scheduled','expired')),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  UNIQUE (store_id)
);

CREATE TABLE IF NOT EXISTS price_book_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  book_id      uuid NOT NULL REFERENCES price_books(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_idr    bigint NOT NULL DEFAULT 0,
  cost_idr     bigint NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, product_id)
);
CREATE INDEX price_book_items_ws_idx ON price_book_items (workspace_id);

-- ---------------------------------------------------------------------------
-- Purchasing & tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name           text NOT NULL,
  category       text NOT NULL DEFAULT '',
  lead_time_days integer NOT NULL DEFAULT 3,
  on_time_pct    real NOT NULL DEFAULT 90,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  store_id       uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  supplier_id    uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  po_code        text NOT NULL,
  status         text NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','sent','confirmed','receiving','received','cancelled')),
  order_date     date NOT NULL DEFAULT current_date,
  expected_date  date NOT NULL DEFAULT current_date + 3,
  received_pct   integer NOT NULL DEFAULT 0 CHECK (received_pct BETWEEN 0 AND 100),
  total_idr      bigint NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, po_code)
);

CREATE TABLE IF NOT EXISTS po_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  po_id         uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty_order     integer NOT NULL,
  qty_received  integer NOT NULL DEFAULT 0,
  unit_cost_idr bigint NOT NULL DEFAULT 0
);
CREATE INDEX po_lines_po_idx ON po_lines (po_id);

CREATE TABLE IF NOT EXISTS shipments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  po_id         uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  supplier_name text NOT NULL DEFAULT '',
  origin        text NOT NULL DEFAULT '',
  destination   text NOT NULL DEFAULT '',
  carrier       text NOT NULL DEFAULT '',
  tracking_no   text NOT NULL UNIQUE,
  eta           timestamptz,
  status        text NOT NULL DEFAULT 'booked'
                CHECK (status IN ('booked','picked_up','in_transit','at_hub','out_for_delivery','delivered','delayed')),
  progress_pct  integer NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  timeline      jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_update   timestamptz,
  items_summary text NOT NULL DEFAULT '',
  temp_ok       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shipments_ws_idx ON shipments (workspace_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Monitor: kamera, zona, kunjungan (CCTV + traffic)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name         text NOT NULL,
  share        real NOT NULL DEFAULT 0,
  dwell_seconds integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, name)
);

CREATE TABLE IF NOT EXISTS cameras (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  zone_id      uuid REFERENCES zones(id) ON DELETE SET NULL,
  name         text NOT NULL,
  status       text NOT NULL DEFAULT 'online' CHECK (status IN ('online','offline','degraded')),
  fps          integer NOT NULL DEFAULT 25,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cameras_ws_idx ON cameras (workspace_id);

CREATE TABLE IF NOT EXISTS visitor_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  store_id      uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  zone_id       uuid REFERENCES zones(id) ON DELETE SET NULL,
  entered_at    timestamptz NOT NULL DEFAULT now(),
  dwell_seconds integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'out' CHECK (status IN ('in','out')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX visitor_events_ws_idx ON visitor_events (workspace_id, entered_at DESC);

-- ---------------------------------------------------------------------------
-- Integrasi & API keys (M7 PRD versi ringkas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integrations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('pos','supplier','ecommerce','logistics','cv')),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('connected','error','disabled','pending')),
  store_scope  text NOT NULL DEFAULT 'all',
  last_sync    timestamptz,
  records      integer NOT NULL DEFAULT 0,
  latency_ms   integer NOT NULL DEFAULT 0,
  note         text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_sync_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('pull','push','webhook')),
  started_at     timestamptz NOT NULL DEFAULT now(),
  duration_s     integer NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'success' CHECK (status IN ('success','failed','partial')),
  records        integer NOT NULL DEFAULT 0,
  message        text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  prefix       text NOT NULL DEFAULT '',
  masked       text NOT NULL DEFAULT '',
  scope        text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event        text NOT NULL,
  endpoint     text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','failed','retrying')),
  attempts     integer NOT NULL DEFAULT 1,
  at           timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Laporan terkirim & jadwal (laporan M5)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title         text NOT NULL,
  kind          text NOT NULL DEFAULT 'weekly' CHECK (kind IN ('weekly','monthly','incident','custom')),
  period_from   date NOT NULL,
  period_to     date NOT NULL,
  scope         text NOT NULL DEFAULT 'all',
  stores_count  integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','processing','scheduled','failed')),
  generated_at  timestamptz,
  format        text NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf','csv','xlsx')),
  metrics       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_schedules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  cadence      text NOT NULL CHECK (cadence IN ('weekly','monthly')),
  scope        text NOT NULL DEFAULT 'all',
  format       text NOT NULL DEFAULT 'pdf',
  recipients   text[] NOT NULL DEFAULT '{}',
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Trigger updated_at untuk tabel baru
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products','inventory_locations','inventory_balances','price_books',
    'purchase_orders','shipments','cameras','integrations','reports',
    'report_schedules'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;
