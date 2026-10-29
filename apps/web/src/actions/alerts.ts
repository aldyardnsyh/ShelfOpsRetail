"use server";

import type { AlertStatus } from "@shelfops/api-client";

import { getServerApi } from "@/lib/api";
import { DEMO_MODE } from "@/lib/demo";
import { can } from "@/lib/permissions";
import { getMe } from "@/lib/data";

export interface AlertUpdateResult {
  ok: boolean;
  demo: boolean;
  detail?: string;
}

export async function updateAlertStatusAction(
  id: string,
  status: AlertStatus,
): Promise<AlertUpdateResult> {
  // Least privilege (PRODUCT.md section 5): hanya owner/admin yang boleh menutup peringatan.
  const me = await getMe();
  if (!me.ok || !can(me.data.role, "alert.update")) {
    return { ok: false, demo: DEMO_MODE, detail: "role_not_allowed" };
  }

  if (DEMO_MODE) {
    return { ok: true, demo: true };
  }

  try {
    const api = await getServerApi();
    const { response, error } = await api.alerts.update(id, status);
    if (!response.ok) {
      const detail =
        typeof error === "object" && error !== null && "detail" in error
          ? String((error as { detail?: unknown }).detail ?? "")
          : undefined;
      return { ok: false, demo: false, detail };
    }
    return { ok: true, demo: false };
  } catch {
    return { ok: false, demo: false };
  }
}
