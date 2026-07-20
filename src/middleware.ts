import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  const isProtected =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/voter") ||
    pathname.startsWith("/settings");

  if (isProtected && !sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Auth pages (/login, /register, etc.) intentionally do NOT redirect on
  // cookie presence here — a stale-but-present cookie would trap an
  // already-logged-out-server-side user in a redirect loop with no way to
  // reach the login form. The (auth) layout does the real, DB-backed check
  // instead (mirrors src/app/page.tsx), redirecting only truly active
  // sessions away from these pages.

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/voter/:path*",
    "/settings/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ],
};
