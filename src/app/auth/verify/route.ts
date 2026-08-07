import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { safeNext } from "@/lib/auth/shared";
import { hashSignInToken, sessionCookie } from "@/lib/auth/token";
import { db } from "@/lib/db";

/**
 * Redeeming a sign-in link.
 *
 * The token in the URL is hashed before it is looked up — the database only ever
 * holds hashes — and `consumeLoginToken` validates and spends it in a single
 * call, so following the same link twice cannot produce two sessions.
 *
 * Failure is deliberately uninformative: unknown, expired, and already-used all
 * redirect to the same `reason=invalid`. Distinguishing them would tell whoever
 * holds a stale link something about why it failed.
 *
 * The cookie is set on the response rather than through `cookies()` so that the
 * write and the redirect are unambiguously the same HTTP response.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const token = params.get("token");

  const bounce = (reason: string) =>
    NextResponse.redirect(
      new URL(`/login?reason=${reason}`, request.nextUrl.origin),
    );

  if (!token) return bounce("missing");

  const user = await db.consumeLoginToken(hashSignInToken(token), new Date());
  if (!user) return bounce("invalid");

  // Re-validated here rather than trusted from the link: the `next` value made
  // the round trip through an email, and an open redirect on a sign-in route is
  // a phishing primitive.
  const target = safeNext(params.get("next"));
  const response = NextResponse.redirect(
    new URL(target, request.nextUrl.origin),
  );

  const { name, value, options } = sessionCookie(user.id);
  response.cookies.set(name, value, options);
  return response;
}
