-- 000017_write_ops — penerimaan barang (goods receipt) untuk aksi tulis G4.
--
-- purchase_orders + po_lines sudah ada (000008). Yang belum ada: dokumen
-- penerimaan barang beserta barisnya dan kunci idempotensi supaya request
-- berulang tidak menambah stok dua kali.

CREATE TABLE IF NOT EXISTS goods_receipts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  store_id        uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  po_id           uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  receipt_code    text NOT NULL,
  status          text NOT NULL DEFAULT 'received'
                  CHECK (status IN ('received','cancelled')),
  idempotency_key text NOT NULL DEFAULT '',
  notes           text NOT NULL DEFAULT '',
  received_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, receipt_code)
);

CREATE INDEX IF NOT EXISTS goods_receipts_ws_idx
  ON goods_receipts (workspace_id, created_at DESC);

-- Idempotensi: satu kunci = satu penerimaan. Kunci kosong diabaikan.
CREATE UNIQUE INDEX IF NOT EXISTS goods_receipts_idempotency_idx
  ON goods_receipts (workspace_id, idempotency_key)
  WHERE idempotency_key <> '';

CREATE TABLE IF NOT EXISTS goods_receipt_lines (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  receipt_id     uuid NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  po_line_id     uuid REFERENCES po_lines(id) ON DELETE SET NULL,
  product_id     uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty_received   integer NOT NULL CHECK (qty_received > 0),
  unit_cost_idr  bigint NOT NULL DEFAULT 0 CHECK (unit_cost_idr >= 0)
);

CREATE INDEX IF NOT EXISTS goods_receipt_lines_receipt_idx
  ON goods_receipt_lines (receipt_id);
