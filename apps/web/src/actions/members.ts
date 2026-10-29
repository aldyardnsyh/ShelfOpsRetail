"use server";

import type { MemberCreate, Role } from "@shelfops/api-client";

import { getServerApi } from "@/lib/api";
import { DEMO_MODE } from "@/lib/demo";

export interface InviteMemberState {
  status: "idle" | "success" | "demo" | "error";
  code?: "invalidEmail" | "forbidden" | "network" | "server";
  detail?: string;
}

const ROLES: Role[] = ["admin", "analyst", "auditor", "viewer"];

export async function inviteMemberAction(
  _previous: InviteMemberState,
  formData: FormData,
): Promise<InviteMemberState> {
  const email = String(formData.get("email") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "viewer");
  const role = (ROLES.includes(roleRaw as Role) ? roleRaw : "viewer") as Role;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", code: "invalidEmail" };
  }

  if (DEMO_MODE) {
    return { status: "demo" };
  }

  const body: MemberCreate = { email, role };
  try {
    const api = await getServerApi();
    const { response, error } = await api.workspace.addMember(body);
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
    return { status: "success" };
  } catch {
    return { status: "error", code: "network" };
  }
}
