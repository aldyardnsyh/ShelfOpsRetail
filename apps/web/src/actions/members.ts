"use server";

import type { MemberCreate, Role } from "@shelfops/api-client";

import { getCookieHeader, getServerApi } from "@/lib/api";
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
    // Coba tambah anggota yang sudah terdaftar dulu; bila belum ada akun,
    // pakai endpoint undangan yang membuat user + membership baru.
    const { response, error } = await api.workspace.addMember(body);
    if (response.ok) {
      return { status: "success" };
    }
    const detail =
      typeof error === "object" && error !== null && "detail" in error
        ? String((error as { detail?: unknown }).detail ?? "")
        : "";
    if (/belum terdaftar/i.test(detail)) {
      const invite = await fetch(
        `${process.env.API_INTERNAL_URL || process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/v1/workspace/members/invite`,
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie: await getCookieHeader() },
          body: JSON.stringify({ email, role }),
          cache: "no-store",
        },
      );
      if (invite.ok) {
        return { status: "success" };
      }
      if (invite.status === 403) {
        return { status: "error", code: "forbidden" };
      }
      return { status: "error", code: "server" };
    }
    if (response.status === 403) {
      return { status: "error", code: "forbidden" };
    }
    return { status: "error", code: "server", detail: detail || undefined };
  } catch {
    return { status: "error", code: "network" };
  }
}
