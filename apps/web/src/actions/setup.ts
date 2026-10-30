"use server";

import { revalidatePath } from "next/cache";

import { getServerApi } from "@/lib/api";
import { getMe } from "@/lib/data";
import { DEMO_MODE } from "@/lib/demo";
import { can } from "@/lib/permissions";

export interface SetupStatusData {
  workspace_name: string;
  is_demo: boolean;
  has_admin: boolean;
  setup_done: boolean;
  providers: Record<string, string>;
  provider_ok: boolean;
}

export interface SetupActionResult {
  ok: boolean;
  demo: boolean;
  detail?: string;
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

/** Terapkan pilihan wizard setup produksi (admin saja). */
export async function applySetupAction(
  _previous: SetupActionResult,
  formData: FormData,
): Promise<SetupActionResult> {
  const me = await getMe();
  if (!me.ok || !can(me.data.role, "workspace.manage")) {
    return { ok: false, demo: DEMO_MODE, detail: "Hanya admin yang boleh menjalankan setup." };
  }

  const workspaceName = String(formData.get("workspace_name") ?? "").trim();
  const adminEmail = String(formData.get("admin_email") ?? "").trim();
  const adminPassword = String(formData.get("admin_password") ?? "");
  const adminName = String(formData.get("admin_name") ?? "").trim();
  const llmProvider = String(formData.get("llm_provider") ?? "").trim();
  const llmBaseUrl = String(formData.get("llm_base_url") ?? "").trim();
  const llmApiKey = String(formData.get("llm_api_key") ?? "").trim();
  const llmModel = String(formData.get("llm_model") ?? "").trim();

  if (workspaceName && (workspaceName.length < 2 || workspaceName.length > 80)) {
    return { ok: false, demo: DEMO_MODE, detail: "Nama workspace 2-80 karakter." };
  }
  if (adminEmail) {
    if (!adminEmail.includes("@")) {
      return { ok: false, demo: DEMO_MODE, detail: "Email admin tidak valid." };
    }
    if (adminPassword.length < 8) {
      return { ok: false, demo: DEMO_MODE, detail: "Sandi admin minimal 8 karakter." };
    }
  }

  if (DEMO_MODE) {
    return {
      ok: true,
      demo: true,
      message: "Simulasi demo: setup tidak disimpan (mode demo tanpa backend).",
    };
  }

  try {
    const api = await getServerApi();
    const { response, error } = await api.system.setupApply({
      workspace_name: workspaceName,
      admin_email: adminEmail,
      admin_password: adminPassword,
      admin_name: adminName,
      llm_provider: llmProvider,
      llm_base_url: llmBaseUrl,
      llm_api_key: llmApiKey,
      llm_model: llmModel,
    });
    if (!response.ok) {
      const detail =
        typeof error === "object" && error !== null && "detail" in error
          ? String((error as { detail?: unknown }).detail ?? "")
          : await readDetail(response);
      return { ok: false, demo: false, detail };
    }
    revalidatePath("/setup");
    revalidatePath("/settings");
    return { ok: true, demo: false, message: "Setup tersimpan. Workspace siap dipakai." };
  } catch {
    return { ok: false, demo: false, detail: "Tidak dapat menghubungi server." };
  }
}
