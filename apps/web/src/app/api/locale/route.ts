import { NextResponse } from "next/server";

import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { title: "Body JSON tidak valid", status: 400 },
      { status: 400 },
    );
  }

  const raw =
    typeof body === "object" && body !== null && "locale" in body
      ? String((body as { locale?: unknown }).locale ?? "")
      : "";
  if (raw !== "id" && raw !== "en") {
    return NextResponse.json(
      { title: "Locale tidak didukung", status: 422 },
      { status: 422 },
    );
  }

  const response = NextResponse.json({ locale: normalizeLocale(raw) });
  response.cookies.set(LOCALE_COOKIE, normalizeLocale(raw), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}
