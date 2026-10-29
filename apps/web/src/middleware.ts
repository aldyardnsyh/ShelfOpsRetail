import { NextResponse, type NextRequest } from "next/server";

import { DEMO_MODE } from "./lib/demo";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/visitors",
  "/cameras",
  "/stores",
  "/shelf",
  "/alerts",
  "/knowledge",
  "/copilot",
  "/settings",
  "/users",
  "/audit",
  "/evals",
  "/traces",
  "/docs",
  "/pricing",
  "/purchasing",
  "/inventory",
  "/tasks",
  "/tracking",
  "/monitor",
  "/reports",
  "/integrations",
];

function hasSession(request: NextRequest) {
  return (
    request.cookies.has("shelfops_access") ||
    request.cookies.has("shelfops_at") ||
    request.cookies.has("ShelfOpsRetail_at") ||
    request.cookies.has("ShelfOpsRetail_access")
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Teruskan pathname ke server component agar layout bisa membangun ?next= saat 401.
  const withPath = () => {
    const headers = new Headers(request.headers);
    headers.set("x-pathname", pathname + request.nextUrl.search);
    return NextResponse.next({ request: { headers } });
  };

  if (DEMO_MODE) {
    return withPath();
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !hasSession(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Sertakan query asli agar filter pengguna tidak hilang setelah login.
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && hasSession(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return withPath();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|fixtures/|.*\\..*).*)",
  ],
};

