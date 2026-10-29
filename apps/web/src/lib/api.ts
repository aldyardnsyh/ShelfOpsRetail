import "server-only";

import { createShelfopsClient } from "@shelfops/api-client";
import { cookies } from "next/headers";

/**
 * Base URL gateway untuk pemanggilan dari SERVER (server action / RSC).
 *
 * Di Docker, web harus memanggil gateway lewat nama service internal
 * (`http://gateway:8080`), bukan URL publik. Urutan prioritas:
 * API_INTERNAL_URL -> API_BASE_URL -> NEXT_PUBLIC_API_URL -> localhost.
 */
const SERVER_API_URL = (
  process.env.API_INTERNAL_URL ||
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080"
).replace(/\/+$/, "");

export async function getCookieHeader(): Promise<string> {
  const store = await cookies();
  return store
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

export async function getServerApi() {
  const cookieHeader = await getCookieHeader();
  return createShelfopsClient({
    baseUrl: SERVER_API_URL,
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

export { SERVER_API_URL };
