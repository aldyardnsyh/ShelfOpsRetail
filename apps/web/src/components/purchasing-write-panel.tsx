"use client";

import { useActionState } from "react";

import {
  createPurchaseOrderAction,
  receiveGoodsAction,
  type WriteActionResult,
} from "@/actions/purchasing";
import { Button } from "@/components/ui/button";

const initial: WriteActionResult = { ok: false, demo: false };

export interface WriteOption {
  id: string;
  label: string;
}

export interface OpenOrderLine {
  po_line_id: string;
  sku: string;
  qty_order: number;
  qty_received: number;
}

export interface OpenOrder {
  id: string;
  code: string;
  lines: OpenOrderLine[];
}

/**
 * Panel aksi tulis pengadaan: buat PO dan catat penerimaan barang.
 * Semua status ditampilkan apa adanya dari server â€” tidak ada klaim sukses palsu.
 */
export function PurchasingWritePanel({
  stores,
  suppliers,
  products,
  orders,
}: {
  stores: WriteOption[];
  suppliers: WriteOption[];
  products: WriteOption[];
  orders: OpenOrder[];
}) {
  const [poState, poAction, poPending] = useActionState(createPurchaseOrderAction, initial);
  const [grnState, grnAction, grnPending] = useActionState(receiveGoodsAction, initial);

  const canCreate = stores.length > 0 && suppliers.length > 0 && products.length > 0;
  const receivable = orders.flatMap((order) =>
    order.lines
      .filter((line) => line.qty_received < line.qty_order)
      .map((line) => ({
        orderId: order.id,
        orderCode: order.code,
        line,
        label: `${order.code} Â· ${line.sku} (${line.qty_received}/${line.qty_order})`,
      })),
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Buat purchase order */}
      <section className="rounded-2xl border border-border bg-background p-5">
        <h2 className="text-sm font-semibold text-foreground">Buat purchase order</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          PO tersimpan di server dan langsung muncul di daftar pengadaan.
        </p>
        <form action={poAction} className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Toko
            <select name="store_id" required className="min-h-[40px] rounded-lg border border-border bg-background px-3 text-sm text-foreground">
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Supplier
            <select name="supplier_id" required className="min-h-[40px] rounded-lg border border-border bg-background px-3 text-sm text-foreground">
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Produk
            <select name="product_id" required className="min-h-[40px] rounded-lg border border-border bg-background px-3 text-sm text-foreground">
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Qty
              <input
                type="number"
                name="qty_order"
                min={1}
                defaultValue={10}
                required
                className="min-h-[40px] rounded-lg border border-border bg-background px-3 text-sm text-foreground"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Harga satuan (IDR)
              <input
                type="number"
                name="unit_cost_idr"
                min={0}
                step={100}
                defaultValue={12500}
                required
                className="min-h-[40px] rounded-lg border border-border bg-background px-3 text-sm text-foreground"
              />
            </label>
          </div>
          <Button type="submit" disabled={poPending || !canCreate}>
            {poPending ? "Menyimpanâ€¦" : "Simpan purchase order"}
          </Button>
          {!canCreate ? (
            <p className="text-xs text-muted-foreground">
              Data toko/supplier/produk belum tersedia untuk workspace ini.
            </p>
          ) : null}
          {poState.message ? (
            <p className="text-xs font-medium text-emerald-700" role="status">
              {poState.message}
            </p>
          ) : null}
          {poState.detail ? (
            <p className="text-xs font-medium text-red-700" role="alert">
              {poState.detail}
            </p>
          ) : null}
        </form>
      </section>

      {/* Terima barang */}
      <section className="rounded-2xl border border-border bg-background p-5">
        <h2 className="text-sm font-semibold text-foreground">Catat penerimaan barang</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Menambah stok, menulis pergerakan inventori, dan memperbarui progres PO.
        </p>
        {receivable.length === 0 ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Tidak ada baris PO yang menunggu penerimaan.
          </p>
        ) : (
          <form action={grnAction} className="mt-4 grid gap-3">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Baris PO
              <select
                name="__selected"
                required
                onChange={(event) => {
                  const [orderId, lineId] = event.currentTarget.value.split("|");
                  const form = event.currentTarget.form;
                  if (!form || !orderId || !lineId) return;
                  (form.elements.namedItem("purchase_order_id") as HTMLInputElement).value = orderId;
                  (form.elements.namedItem("po_line_id") as HTMLInputElement).value = lineId;
                }}
                className="min-h-[40px] rounded-lg border border-border bg-background px-3 text-sm text-foreground"
              >
                {receivable.map((item) => (
                  <option key={`${item.orderId}-${item.line.po_line_id}`} value={`${item.orderId}|${item.line.po_line_id}`}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <input type="hidden" name="purchase_order_id" defaultValue={receivable[0]?.orderId ?? ""} />
            <input type="hidden" name="po_line_id" defaultValue={receivable[0]?.line.po_line_id ?? ""} />
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Qty diterima
              <input
                type="number"
                name="qty_received"
                min={1}
                defaultValue={1}
                required
                className="min-h-[40px] rounded-lg border border-border bg-background px-3 text-sm text-foreground"
              />
            </label>
            <Button type="submit" disabled={grnPending}>
              {grnPending ? "Menyimpanâ€¦" : "Catat penerimaan"}
            </Button>
            {grnState.message ? (
              <p className="text-xs font-medium text-emerald-700" role="status">
                {grnState.message}
              </p>
            ) : null}
            {grnState.detail ? (
              <p className="text-xs font-medium text-red-700" role="alert">
                {grnState.detail}
              </p>
            ) : null}
          </form>
        )}
      </section>
    </div>
  );
}
