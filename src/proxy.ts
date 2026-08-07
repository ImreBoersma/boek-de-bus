/**
 * Optimistic auth routing.
 *
 * This only reads and verifies the session cookie's signature — no database,
 * because the proxy runs on every request including prefetches. It is not a
 * security control: it keeps signed-out visitors from landing on a page that
 * would only redirect them anyway, and keeps signed-in ones off the login form.
 * Authorization proper lives in `src/lib/auth/dal.ts`, next to the data.
 *
 * Named `proxy` rather than `middleware`: the middleware convention is
 * deprecated in Next.js 16, and the proxy runtime is Node.js only.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

/** Reachable without a session. Everything else needs one. */
const PUBLIC_PATHS = ["/login", "/auth/verify"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  const session = verifySession(
    request.cookies.get(SESSION_COOKIE)?.value,
    new Date(),
  );

  if (!session && !isPublic) {
    const url = new URL("/login", request.nextUrl);
    // So the sign-in can hand them back to where they were headed.
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
