/**
 * Sanitasi parameter ?next= agar hanya mengizinkan path internal.
 * Menolak URL absolut, protocol-relative (//evil.com), dan backslash trick.
 * Dipakai di login page (server) dan login action.
 */
export const DEFAULT_NEXT = "/dashboard";

export function safeNext(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_NEXT;
  const raw = value.trim();
  if (!raw) return DEFAULT_NEXT;
  // Harus path internal.
  if (!raw.startsWith("/")) return DEFAULT_NEXT;
  // Tolak //evil.com yang akan dibaca browser sebagai protocol-relative.
  if (raw.startsWith("//")) return DEFAULT_NEXT;
  // Tolak backslash yang sebagian browser normalisasi jadi "//".
  if (raw.includes("\\")) return DEFAULT_NEXT;
  // Tolak karakter kontrol.
  if (/[\u0000-\u001f]/.test(raw)) return DEFAULT_NEXT;
  // Tolak bila ada skema di depan (defense in depth).
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return DEFAULT_NEXT;
  return raw;
}
