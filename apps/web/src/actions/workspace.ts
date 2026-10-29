"use server";

import { revalidatePath } from "next/cache";

import type { WorkspaceUpdate } from "@shelfops/api-client";

import { getServerApi } from "@/lib/api";
import { DEMO_MODE } from "@/lib/demo";

export interface WorkspaceActionState {
  status: "idle" | "success" | "demo" | "error";
  code?: "invalid" | "forbidden" | "network" | "server";
  detail?: string;
}

export async function updateWorkspaceAction(
  _previous: WorkspaceActionState,
  formData: FormData,
): Promise<WorkspaceActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const locale = String(formData.get("locale") ?? "id");

  if (name.length < 2 || name.length > 80) {
    return { status: "error", code: "invalid" };
  }
  if (locale !== "id" && locale !== "en") {
    return { status: "error", code: "invalid" };
  }

  if (DEMO_MODE) {
    return { status: "demo" };
  }

  const body: WorkspaceUpdate = { name, locale };
  try {
    const api = await getServerApi();
    const { response, error } = await api.workspace.update(body);
    if (!response.ok) {
      if (response.status === 403) {
        return { status: "error", code: "forbidden" };
      }
      const detail =
        typeof error === "object" && error !== null && "detail" in error
          ? String((error as { detail?: unknown }).detail ?? "")
          : undefined;
      return { status: "error", code: "server", detail };
    }
    revalidatePath("/settings");
    revalidatePath("/", "layout");
    return { status: "success" };
  } catch {
    return { status: "error", code: "network" };
  }
}
