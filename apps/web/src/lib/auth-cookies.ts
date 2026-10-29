import "server-only";

import { cookies } from "next/headers";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

// Nama cookie kanonik mengikuti gateway (services/gateway/internal/httpx/server.go):
// cookieAccess = "shelfops_access", cookieRefresh = "shelfops_refresh".
// Alias *_at / *_rt dipertahankan agar sesi lama (pra-rename brand) tidak error.
const CANONICAL_ACCESS = "shelfops_access";
const CANONICAL_REFRESH = "shelfops_refresh";

const AUTH_COOKIES = [
  CANONICAL_ACCESS,
  CANONICAL_REFRESH,
  "shelfops_at",
  "shelfops_rt",
  "ShelfOpsRetail_at",
  "ShelfOpsRetail_rt",
  "ShelfOpsRetail_access",
  "ShelfOpsRetail_refresh",
];

interface ParsedCookie {
  name: string;
  value: string;
  options: Parameters<CookieStore["set"]>[2];
}

function parseSetCookie(raw: string): ParsedCookie | null {
  const [pair, ...attributes] = raw.split(";");
  if (!pair) return null;
  const separator = pair.indexOf("=");
  if (separator <= 0) return null;

  const name = pair.slice(0, separator).trim();
  const value = pair.slice(separator + 1).trim();
  if (!name) return null;

  const options: Parameters<CookieStore["set"]>[2] = {
    httpOnly: attributes.some((attr) => attr.trim().toLowerCase() === "httponly"),
    secure: attributes.some((attr) => attr.trim().toLowerCase() === "secure"),
    sameSite: "lax",
    path: "/",
  };

  for (const attribute of attributes) {
    const [rawKey, ...rawValue] = attribute.split("=");
    const key = rawKey?.trim().toLowerCase();
    const valuePart = rawValue.join("=").trim();
    if (key === "path" && valuePart) options.path = valuePart;
    if (key === "max-age" && valuePart) {
      const maxAge = Number(valuePart);
      if (Number.isFinite(maxAge)) options.maxAge = maxAge;
    }
    if (key === "expires" && valuePart) {
      const expires = new Date(valuePart);
      if (!Number.isNaN(expires.getTime())) options.expires = expires;
    }
    if (key === "samesite") {
      const normalized = valuePart.toLowerCase();
      if (normalized === "lax" || normalized === "strict" || normalized === "none") {
        options.sameSite = normalized;
      }
    }
  }

  return { name, value, options };
}

export function getSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

export function applyAuthSetCookies(store: CookieStore, rawCookies: string[]) {
  for (const raw of rawCookies) {
    const parsed = parseSetCookie(raw);
    if (!parsed) continue;
    store.set(parsed.name, parsed.value, parsed.options);

    // Mirror ke alias path "/" supaya middleware & server component punya
    // pembacaan yang seragam (refresh cookie dari gateway berpath /api/v1/auth).
    if (parsed.name === CANONICAL_ACCESS) {
      store.set("shelfops_at", parsed.value, { ...parsed.options, path: "/" });
    }
    if (parsed.name === CANONICAL_REFRESH) {
      store.set("shelfops_rt", parsed.value, { ...parsed.options, path: "/" });
    }
  }
}

export async function clearAuthCookies() {
  const store = await cookies();
  for (const name of AUTH_COOKIES) {
    store.delete(name);
  }
}

export async function readProblemBody(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return null;
  try {
    return (await response.json()) as {
      title?: string;
      detail?: string;
      status?: number;
      trace_id?: string;
    };
  } catch {
    return null;
  }
}
