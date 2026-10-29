"use server";

import { revalidatePath } from "next/cache";

import { getCookieHeader, SERVER_API_URL } from "@/lib/api";
import { getMe } from "@/lib/data";
import { DEMO_MODE } from "@/lib/demo";
import { can } from "@/lib/permissions";

export interface WriteActionResult {
  ok: boolean;
  /** true bila aksi hanya simulasi (mode demo tanpa backend). */
  demo: boolean;
  detail?: string;
  /** pesan sukses yang bisa ditampilkan apa adanya (mis. kode dokumen). */
  message?: string;
}

async function readDetail(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { detail?: string; title?: string };
    return body.detail ?? body.title;
  } catch {
    return undefined;
  }
}

/** Buat purchase order (status "sent") beserta barisnya. */
export async function createPurchaseOrderAction(
  _previous: WriteActionResult,
  formData: FormData,
): Promise<WriteActionResult> {
  const me = await getMe();
  if (!me.ok || !can(me.data.role, "purchase.write")) {
    return { ok: false, demo: DEMO_MODE, detail: "Role Anda tidak boleh membuat purchase order." };
  }

  const storeId = String(formData.get("store_id") ?? "").trim();
  const supplierId = String(formData.get("supplier_id") ?? "").trim();
  const productId = String(formData.get("product_id") ?? "").trim();
  const qty = Number(formData.get("qty_order") ?? 0);
  const unitCost = Number(formData.get("unit_cost_idr") ?? 0);

  if (!storeId || !supplierId || !productId) {
    return { ok: false, demo: DEMO_MODE, detail: "Toko, supplier, dan produk wajib dipilih." };
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, demo: DEMO_MODE, detail: "Qty harus lebih besar dari 0." };
  }
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    return { ok: false, demo: DEMO_MODE, detail: "Harga satuan tidak boleh negatif." };
  }

  if (DEMO_MODE) {
    return {
      ok: true,
      demo: true,
      message: `Simulasi demo: PO untuk qty ${qty} tidak disimpan (mode demo tanpa backend).`,
    };
  }

  try {
    const cookie = await getCookieHeader();
    const response = await fetch(`${SERVER_API_URL}/api/v1/purchase-orders`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({
        store_id: storeId,
        supplier_id: supplierId,
        items: [{ product_id: productId, qty_order: qty, unit_cost_idr: unitCost }],
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, demo: false, detail: await readDetail(response) };
    }
    const po = (await response.json()) as { code?: string; total_idr?: number };
    revalidatePath("/purchasing");
    revalidatePath("/dashboard");
    return {
      ok: true,
      demo: false,
      message: `PO ${po.code ?? ""} dibuat (total ${po.total_idr ?? 0} IDR).`,
    };
  } catch {
    return { ok: false, demo: false, detail: "Tidak dapat menghubungi server." };
  }
}

/** Catat penerimaan barang terhadap satu baris PO (menambah stok). */
export async function receiveGoodsAction(
  _previous: WriteActionResult,
  formData: FormData,
): Promise<WriteActionResult> {
  const me = await getMe();
  if (!me.ok || !can(me.data.role, "purchase.write")) {
    return { ok: false, demo: DEMO_MODE, detail: "Role Anda tidak boleh mencatat penerimaan barang." };
  }

  const poId = String(formData.get("purchase_order_id") ?? "").trim();
  const poLineId = String(formData.get("po_line_id") ?? "").trim();
  const qty = Number(formData.get("qty_received") ?? 0);

  if (!poId || !poLineId) {
    return { ok: false, demo: DEMO_MODE, detail: "Pilih purchase order dan baris barangnya." };
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, demo: DEMO_MODE, detail: "Qty diterima harus lebih besar dari 0." };
  }

  if (DEMO_MODE) {
    return {
      ok: true,
      demo: true,
      message: `Simulasi demo: penerimaan ${qty} pcs tidak disimpan (mode demo tanpa backend).`,
    };
  }

  try {
    const cookie = await getCookieHeader();
    const response = await fetch(`${SERVER_API_URL}/api/v1/grns`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Kunci idempotensi mencegah stok bertambah dua kali saat tombol
        // terklik ganda atau request diulang.
        "Idempotency-Key": `web-${poId}-${poLineId}-${Date.now()}`,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({
        purchase_order_id: poId,
        items: [{ po_line_id: poLineId, qty_received: qty }],
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, demo: false, detail: await readDetail(response) };
    }
    const grn = (await response.json()) as { code?: string; stock_updated?: number };
    revalidatePath("/purchasing");
    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    return {
      ok: true,
      demo: false,
      message: `Penerimaan ${grn.code ?? ""} dicatat (${grn.stock_updated ?? 0} baris stok diperbarui).`,
    };
  } catch {
    return { ok: false, demo: false, detail: "Tidak dapat menghubungi server." };
  }
}

/** Finalisasi sesi audit: status final + alert/task tindak lanjut. */
export async function finalizeAuditAction(
  _previous: WriteActionResult,
  formData: FormData,
): Promise<WriteActionResult> {
  const me = await getMe();
  if (!me.ok || !can(me.data.role, "audit.finalize")) {
    return { ok: false, demo: DEMO_MODE, detail: "Role Anda tidak boleh memfinalisasi audit." };
  }
  const auditId = String(formData.get("audit_id") ?? "").trim();
  if (!auditId) {
    return { ok: false, demo: DEMO_MODE, detail: "ID audit tidak ditemukan." };
  }
  if (DEMO_MODE) {
    return { ok: true, demo: true, message: "Simulasi demo: audit tidak difinalisasi (tanpa backend)." };
  }

  try {
    const cookie = await getCookieHeader();
    const response = await fetch(`${SERVER_API_URL}/api/v1/audits/${auditId}/finalize`, {
      method: "POST",
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    });
    if (response.status === 409) {
      return {
        ok: false,
        demo: false,
        detail: "Audit ini sudah final atau belum selesai diproses.",
      };
    }
    if (!response.ok) {
      return { ok: false, demo: false, detail: await readDetail(response) };
    }
    const result = (await response.json()) as { alerts_created?: number; tasks_created?: number };
    revalidatePath(`/shelf/${auditId}`);
    revalidatePath("/shelf");
    revalidatePath("/alerts");
    revalidatePath("/tasks");
    return {
      ok: true,
      demo: false,
      message: `Audit final. ${result.alerts_created ?? 0} alert, ${result.tasks_created ?? 0} task dibuat.`,
    };
  } catch {
    return { ok: false, demo: false, detail: "Tidak dapat menghubungi server." };
  }
}
