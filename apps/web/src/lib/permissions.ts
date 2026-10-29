import type { AppRole } from "@/lib/types";

/**
 * Matriks izin, satu sumber kebenaran. Diturunkan dari PRODUCT.md section 5.
 *
 * Tidak memakai AppRole di luar tipe yang ada (admin/analyst/auditor/viewer/owner),
 * jadi peran area manager/supervisor dipetakan ke admin/analyst di lapisan backend.
 */
export type Capability =
  | "monitor.view"
  | "alert.update"
  | "task.update"
  | "stock.update"
  | "purchase.create"
  // Aksi tulis pengadaan (PO + penerimaan barang) dan finalisasi audit:
  // mengikuti RBAC gateway (purchase_order.write & audit.write = admin+analyst).
  | "purchase.write"
  | "audit.finalize"
  | "price.update"
  | "camera.manage"
  | "member.manage"
  | "integration.manage"
  | "lab.run"
  | "audit.view"
  | "workspace.manage";

const MATRIX: Record<Capability, readonly AppRole[]> = {
  "monitor.view": ["owner", "admin", "analyst", "auditor", "viewer"],
  // PRODUCT.md 5: tutup alert / selesaikan tugas = owner, admin, supervisor.
  // Analyst dan viewer tidak boleh.
  "alert.update": ["owner", "admin"],
  "task.update": ["owner", "admin"],
  "stock.update": ["owner", "admin"],
  "purchase.create": ["owner", "admin"],
  // Backend memberi admin+analyst izin purchase_order.write; UI mengikuti
  // sumber yang sama agar tidak menolak aksi yang sah.
  "purchase.write": ["owner", "admin", "analyst"],
  "audit.finalize": ["owner", "admin", "analyst"],
  "price.update": ["owner", "admin"],
  "camera.manage": ["owner", "admin"],
  "member.manage": ["owner", "admin"],
  "integration.manage": ["owner", "admin"],
  // Lab & trace = owner, admin, analyst. Viewer dan auditor tidak.
  "lab.run": ["owner", "admin", "analyst"],
  "audit.view": ["owner", "admin"],
  "workspace.manage": ["owner", "admin"],
};

export function can(
  role: string | null | undefined,
  capability: Capability,
): boolean {
  if (!role) return false;
  return MATRIX[capability].includes(role as AppRole);
}

/** Halaman yang hanya boleh dibuka admin/owner. */
export const ADMIN_PATHS = ["/users", "/audit", "/integrations"] as const;

/** Halaman Lab: admin/owner/analyst. */
export const LAB_PATH_PREFIXES = ["/evals", "/traces"] as const;

export function canAccessPath(
  role: string | null | undefined,
  pathname: string,
): boolean {
  if (ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return can(role, "member.manage");
  }
  if (LAB_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return can(role, "lab.run");
  }
  return true;
}

/** Label peran yang dibutuhkan untuk pesan 403 per path. */
export function requiredRoleLabel(pathname: string): "admin" | "lab" | null {
  if (ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return "admin";
  }
  if (LAB_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return "lab";
  }
  return null;
}
