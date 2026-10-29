"use server";

import { revalidatePath } from "next/cache";

import { getCookieHeader, SERVER_API_URL } from "@/lib/api";
import { getMe } from "@/lib/data";
import { DEMO_MODE } from "@/lib/demo";
import { can } from "@/lib/permissions";

export type TaskStatus = "open" | "in_progress" | "done" | "cancelled";

export interface TaskUpdateResult {
  ok: boolean;
  demo: boolean;
  detail?: string;
}

export async function updateTaskStatusAction(
  id: string,
  status: TaskStatus,
): Promise<TaskUpdateResult> {
  const me = await getMe();
  if (!me.ok || !can(me.data.role, "task.update")) {
    return { ok: false, demo: DEMO_MODE, detail: "role_not_allowed" };
  }
  if (DEMO_MODE) {
    return { ok: true, demo: true };
  }

  try {
    const cookie = await getCookieHeader();
    const response = await fetch(`${SERVER_API_URL}/api/v1/tasks/${id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({ status }),
      cache: "no-store",
    });
    if (!response.ok) {
      let detail: string | undefined;
      try {
        detail = ((await response.json()) as { detail?: string }).detail;
      } catch {
        detail = undefined;
      }
      return { ok: false, demo: false, detail };
    }
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    return { ok: true, demo: false };
  } catch {
    return { ok: false, demo: false };
  }
}