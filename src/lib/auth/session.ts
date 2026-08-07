/**
 * Reading and writing the session cookie through `cookies()`, for server
 * components and server actions.
 *
 * The cookie's shape — name, flags, lifetime — is described in `token.ts`, so
 * the sign-in route can apply the identical cookie to a `NextResponse` without
 * duplicating the flags. Two places setting a session cookie with subtly
 * different attributes is a bug waiting to happen.
 */

import "server-only";

import { cookies } from "next/headers";
import type { SessionPayload } from "./token";
import { SESSION_COOKIE, sessionCookie, verifySession } from "./token";

export { SESSION_COOKIE };

export async function startSession(userId: string, now = new Date()) {
  const { name, value, options } = sessionCookie(userId, now);
  const store = await cookies();
  store.set(name, value, options);
}

export async function readSession(
  now = new Date(),
): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value, now);
}

export async function endSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
