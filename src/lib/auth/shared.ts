/**
 * Pieces of the sign-in flow that are not server functions.
 *
 * They live apart from `@/lib/actions/auth` because a `"use server"` module may
 * only export async functions — a exported constant or a sync helper there is a
 * build error. Keeping them here also means the sign-in action, the login page,
 * the login form, and the verify route all share one definition of `safeNext`
 * instead of each carrying a copy.
 */

export type SignInState = {
  status: "idle" | "sent" | "error";
  message: string;
};

export const SIGN_IN_IDLE: SignInState = { status: "idle", message: "" };

/**
 * Reduce a caller-supplied redirect target to a same-site absolute path.
 *
 * Anything else becomes `/`. Without this the sign-in flow would be an open
 * redirect, which on an authentication route is a phishing primitive: a link
 * that really does log you into the real app and then hands you to an attacker's
 * page. `//host` and `/\host` are both treated as protocol-relative by some
 * parsers, so neither is allowed through.
 */
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/";
  }
  return raw;
}
