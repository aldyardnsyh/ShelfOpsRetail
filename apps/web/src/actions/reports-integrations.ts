"use server";

import { revalidatePath } from "next/cache";

import { getCookieHeader, SERVER_API_URL } from "@/lib/api";
import { getMe } from "@/lib/data";
import { DEMO_MODE } from "@/lib/demo";
import { can } from "@/lib/permissions";

import type { WriteActionResult } from "./purchasing";

export type { WriteActionResult };

async function readDetail(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { detail?: string; title?: string };
    return body.detail ?? body.title;
  } catch {
    return undefined;
  }
}

/** Buat laporan baru (status "ready", metrik dari audit final periode). */
export async function createReportAction(
  _previous: WriteActionResult,
  formData: FormData,
): Promise<WriteActionResult> {
  const me = await getMe();
  if (!me.ok || !can(me.data.role, "report.write")) {
    return { ok: false, demo: DEMO_MODE, detail: "Role Anda tidak boleh membuat laporan." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const kind = String(formData.get("kind") ?? "custom").trim();
  const periodFrom = String(formData.get("period_from") ?? "").trim();
  const periodTo = String(formData.get("period_to") ?? "").trim();
  const format = String(formData.get("format") ?? "pdf").trim();

  if (!title) {
    return { ok: false, demo: DEMO_MODE, detail: "Judul laporan wajib diisi." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(periodTo)) {
    return { ok: false, demo: DEMO_MODE, detail: "Periode harus tanggal valid (YYYY-MM-DD)." };
  }

  if (DEMO_MODE) {
    return {
      ok: true,
      demo: true,
      message: `Simulasi demo: laporan "${title}" tidak disimpan (mode demo tanpa backend).`,
    };
  }

  try {
    const cookie = await getCookieHeader();
    const response = await fetch(`${SERVER_API_URL}/api/v1/reports`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({
        title,
        kind,
        period_from: periodFrom,
        period_to: periodTo,
        format,
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, demo: false, detail: await readDetail(response) };
    }
    revalidatePath("/reports");
    return { ok: true, demo: false, message: `Laporan "${title}" dibuat.` };
  } catch {
    return { ok: false, demo: false, detail: "Tidak dapat menghubungi server." };
  }
}

/** Buat jadwal laporan otomatis (aktif). */
export async function createReportScheduleAction(
  _previous: WriteActionResult,
  formData: FormData,
): Promise<WriteActionResult> {
  const me = await getMe();
  if (!me.ok || !can(me.data.role, "report.write")) {
    return { ok: false, demo: DEMO_MODE, detail: "Role Anda tidak boleh membuat jadwal laporan." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const cadence = String(formData.get("cadence") ?? "").trim();
  const format = String(formData.get("format") ?? "pdf").trim();
  const recipientsRaw = String(formData.get("recipients") ?? "").trim();
  const recipients = recipientsRaw
    .split(/[,;\n]/)
    .map((r) => r.trim())
    .filter(Boolean);

  if (!name) {
    return { ok: false, demo: DEMO_MODE, detail: "Nama jadwal wajib diisi." };
  }
  if (cadence !== "weekly" && cadence !== "monthly") {
    return { ok: false, demo: DEMO_MODE, detail: "Cadence harus weekly atau monthly." };
  }

  if (DEMO_MODE) {
    return {
      ok: true,
      demo: true,
      message: `Simulasi demo: jadwal "${name}" tidak disimpan (mode demo tanpa backend).`,
    };
  }

  try {
    const cookie = await getCookieHeader();
    const response = await fetch(`${SERVER_API_URL}/api/v1/report-schedules`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ name, cadence, format, recipients }),
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, demo: false, detail: await readDetail(response) };
    }
    revalidatePath("/reports");
    return { ok: true, demo: false, message: `Jadwal "${name}" dibuat dan aktif.` };
  } catch {
    return { ok: false, demo: false, detail: "Tidak dapat menghubungi server." };
  }
}

/** Buat konektor integrasi baru (status "pending"). */
export async function createIntegrationAction(
  _previous: WriteActionResult,
  formData: FormData,
): Promise<WriteActionResult> {
  const me = await getMe();
  if (!me.ok || !can(me.data.role, "integration.manage")) {
    return { ok: false, demo: DEMO_MODE, detail: "Role Anda tidak boleh menambah konektor." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "").trim();

  if (!name) {
    return { ok: false, demo: DEMO_MODE, detail: "Nama konektor wajib diisi." };
  }
  if (!["pos", "supplier", "ecommerce", "logistics", "cv"].includes(kind)) {
    return { ok: false, demo: DEMO_MODE, detail: "Jenis konektor tidak dikenal." };
  }

  if (DEMO_MODE) {
    return {
      ok: true,
      demo: true,
      message: `Simulasi demo: konektor "${name}" tidak disimpan (mode demo tanpa backend).`,
    };
  }

  try {
    const cookie = await getCookieHeader();
    const response = await fetch(`${SERVER_API_URL}/api/v1/integrations`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ name, kind }),
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, demo: false, detail: await readDetail(response) };
    }
    revalidatePath("/integrations");
    return { ok: true, demo: false, message: `Konektor "${name}" dibuat (pending).` };
  } catch {
    return { ok: false, demo: false, detail: "Tidak dapat menghubungi server." };
  }
}

/** Uji koneksi konektor: mencatat sync run + menandai connected. */
export async function testIntegrationAction(
  _previous: WriteActionResult,
  formData: FormData,
): Promise<WriteActionResult> {
  const me = await getMe();
  if (!me.ok || !can(me.data.role, "integration.manage")) {
    return { ok: false, demo: DEMO_MODE, detail: "Role Anda tidak boleh menguji konektor." };
  }

  const integrationId = String(formData.get("integration_id") ?? "").trim();
  if (!integrationId) {
    return { ok: false, demo: DEMO_MODE, detail: "ID konektor tidak ditemukan." };
  }

  if (DEMO_MODE) {
    return {
      ok: true,
      demo: true,
      message: "Simulasi demo: uji koneksi tidak dicatat (mode demo tanpa backend).",
    };
  }

  try {
    const cookie = await getCookieHeader();
    const response = await fetch(
      `${SERVER_API_URL}/api/v1/integrations/${integrationId}/test`,
      {
        method: "POST",
        headers: cookie ? { cookie } : undefined,
        cache: "no-store",
      },
    );
    if (!response.ok) {
      return { ok: false, demo: false, detail: await readDetail(response) };
    }
    revalidatePath("/integrations");
    return { ok: true, demo: false, message: "Uji koneksi berhasil, konektor connected." };
  } catch {
    return { ok: false, demo: false, detail: "Tidak dapat menghubungi server." };
  }
}

/** Rotasi API key: cabut key lama, terbitkan baru (secret tampil sekali). */
export async function rotateApiKeyAction(
  _previous: WriteActionResult,
  formData: FormData,
): Promise<WriteActionResult> {
  const me = await getMe();
  if (!me.ok || !can(me.data.role, "integration.manage")) {
    return { ok: false, demo: DEMO_MODE, detail: "Role Anda tidak boleh merotasi API key." };
  }

  const keyId = String(formData.get("key_id") ?? "").trim();
  if (!keyId) {
    return { ok: false, demo: DEMO_MODE, detail: "ID API key tidak ditemukan." };
  }

  if (DEMO_MODE) {
    return {
      ok: true,
      demo: true,
      message: "Simulasi demo: API key tidak dirotasi (mode demo tanpa backend).",
    };
  }

  try {
    const cookie = await getCookieHeader();
    const response = await fetch(`${SERVER_API_URL}/api/v1/api-keys/${keyId}/rotate`, {
      method: "POST",
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, demo: false, detail: await readDetail(response) };
    }
    const out = (await response.json()) as { secret?: string };
    revalidatePath("/integrations");
    return {
      ok: true,
      demo: false,
      message: out.secret
        ? `Key baru diterbitkan. Secret (tampil sekali): ${out.secret}`
        : "Key baru diterbitkan.",
    };
  } catch {
    return { ok: false, demo: false, detail: "Tidak dapat menghubungi server." };
  }
}
