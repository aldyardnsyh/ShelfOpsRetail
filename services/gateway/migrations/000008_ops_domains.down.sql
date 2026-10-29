-- 000008_ops_domains (down) — balikkan perubahan domain operasional.
DROP TRIGGER IF EXISTS products_updated_at ON products;
DROP TRIGGER IF EXISTS inventory_locations_updated_at ON inventory_locations;
DROP TRIGGER IF EXISTS inventory_balances_updated_at ON inventory_balances;
DROP TRIGGER IF EXISTS price_books_updated_at ON price_books;
DROP TRIGGER IF EXISTS purchase_orders_updated_at ON purchase_orders;
DROP TRIGGER IF EXISTS shipments_updated_at ON shipments;
DROP TRIGGER IF EXISTS cameras_updated_at ON cameras;
DROP TRIGGER IF EXISTS integrations_updated_at ON integrations;
DROP TRIGGER IF EXISTS reports_updated_at ON reports;
DROP TRIGGER IF EXISTS report_schedules_updated_at ON report_schedules;

DROP TABLE IF EXISTS report_schedules;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS webhook_events;
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS integration_sync_runs;
DROP TABLE IF EXISTS integrations;
DROP TABLE IF EXISTS visitor_events;
DROP TABLE IF EXISTS cameras;
DROP TABLE IF EXISTS zones;
DROP TABLE IF EXISTS shipments;
DROP TABLE IF EXISTS po_lines;
DROP TABLE IF EXISTS purchase_orders;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS price_book_items;
DROP TABLE IF EXISTS price_books;
DROP TABLE IF EXISTS inventory_movements;
DROP TABLE IF EXISTS inventory_balances;
DROP TABLE IF EXISTS inventory_locations;
DROP TABLE IF EXISTS products;

-- Kembalikan constraint status & kolom tambahan tabel tasks.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('open','done','cancelled'));
ALTER TABLE tasks DROP COLUMN IF EXISTS checklist;
ALTER TABLE tasks DROP COLUMN IF EXISTS assignee;
ALTER TABLE tasks DROP COLUMN IF EXISTS priority;
ALTER TABLE tasks DROP COLUMN IF EXISTS severity;
ALTER TABLE tasks DROP COLUMN IF EXISTS alert_type;
ALTER TABLE tasks DROP COLUMN IF EXISTS alert_id;
ALTER TABLE tasks DROP COLUMN IF EXISTS detail;
