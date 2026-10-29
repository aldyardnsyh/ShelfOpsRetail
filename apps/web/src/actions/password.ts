"use server";

import { getCookieHeader, SERVER_API_URL } from "@/lib/api";
import { DEMO_MODE } from "@/lib/demo";

export interface PasswordChangeResult {
  ok: boolean;
  demo: boolean;
  detail?: string;
}

/** Ganti sandi sendiri: verifikasi sandi lama, cabut semua sesi lain. */
export async function changePasswordAction(
  _previous: PasswordChangeResult,
  formData: FormData,
): Promise<PasswordChangeResult> {
  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (newPassword.length < 8) {
    return { ok: false, demo: DEMO_MODE, detail: "Sandi baru minimal 8 karakter." };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, demo: DEMO_MODE, detail: "Konfirmasi sandi tidak cocok." };
  }

  if (DEMO_MODE) {
    return {
      ok: true,
      demo: true,
      detail: "Simulasi demo: sandi tidak diganti (mode demo tanpa backend).",
    };
  }

  try {
    const cookie = await getCookieHeader();
    const response = await fetch(`${SERVER_API_URL}/api/v1/me/password`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      cache: "no-store",
    });
    if (response.status === 401) {
      return { ok: false, demo: false, detail: "Sandi saat ini salah." };
    }
    if (!response.ok) {
      let detail: string | undefined;
      try {
        const body = (await response.json()) as { detail?: string; title?: string };
        detail = body.detail ?? body.title;
      } catch {
        detail = undefined;
      }
      return { ok: false, demo: false, detail };
    }
    return { ok: true, demo: false };
  } catch {
    return { ok: false, demo: false, detail: "Tidak dapat menghubungi server." };
  }
}
