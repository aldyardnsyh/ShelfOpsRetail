"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  applyAuthSetCookies,
  clearAuthCookies,
  getSetCookies,
  readProblemBody,
} from "@/lib/auth-cookies";
import { API_BASE_URL, DEMO_MODE } from "@/lib/demo";
import { getCookieHeader } from "@/lib/api";
import { safeNext } from "@/lib/safe-next";

export interface AuthState {
  error?: string;
}

function messageForStatus(status: number, detail?: string) {
  if (status === 401) return "Email atau kata sandi tidak sesuai.";
  if (status === 429) return "Terlalu banyak percobaan. Coba lagi beberapa saat lagi.";
  if (detail) return detail;
  return "Permintaan tidak dapat diproses. Coba lagi.";
}

export async function loginAction(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = safeNext(formData.get("next"));

  if (!email || !password) {
    return { error: "Email dan kata sandi wajib diisi." };
  }
  if (DEMO_MODE) {
    return {
      error:
        "Mode demo statis tidak memakai backend. Gunakan tombol demo untuk membuka dashboard.",
    };
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    return {
      error:
        "Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.",
    };
  }

  if (!response.ok) {
    const problem = await readProblemBody(response);
    return { error: messageForStatus(response.status, problem?.detail) };
  }

  const store = await cookies();
  applyAuthSetCookies(store, getSetCookies(response));
  redirect(nextPath);
}

export async function startDemoAction(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const nextPath = safeNext(formData.get("next"));
  if (DEMO_MODE) {
    redirect(nextPath);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/auth/demo`, {
      method: "POST",
      cache: "no-store",
    });
  } catch {
    return {
      error:
        "Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.",
    };
  }

  if (!response.ok) {
    const problem = await readProblemBody(response);
    return {
      error:
        response.status === 429
          ? "Terlalu banyak sesi demo dari jaringan ini. Coba lagi nanti."
          : (problem?.detail ?? "Sesi demo tidak dapat dibuat."),
    };
  }

  const store = await cookies();
  applyAuthSetCookies(store, getSetCookies(response));
  redirect(nextPath);
}

export async function logoutAction(): Promise<void> {
  if (!DEMO_MODE) {
    try {
      const cookieHeader = await getCookieHeader();
      await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers: cookieHeader ? { cookie: cookieHeader } : undefined,
        cache: "no-store",
      });
    } catch {
      // Local session is still cleared when the gateway is unreachable.
    }
  }
  await clearAuthCookies();
  redirect("/");
}
