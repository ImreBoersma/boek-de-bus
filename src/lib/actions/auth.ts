"use server";

/**
 * Sign in and sign out.
 *
 * Two things here are security decisions rather than style:
 *
 *  - Requesting a link always reports the same thing. If an unknown address said
 *    "no such user", the form would become a way to test who is in the
 *    household. So an unknown address is accepted, silently sends nothing, and
 *    reads identically to a real one.
 *  - `next` is validated as a same-site path before it is ever redirected to.
 *    Reflecting it back unchecked would make this an open redirect, and an open
 *    redirect on a sign-in route is a phishing primitive.
 */

import { redirect } from "next/navigation";
import { endSession } from "@/lib/auth/session";
import type { SignInState } from "@/lib/auth/shared";
import { safeNext } from "@/lib/auth/shared";
import {
  newSignInToken,
  SIGN_IN_TTL_MINUTES,
  SIGN_IN_TTL_MS,
} from "@/lib/auth/token";
import { db } from "@/lib/db";
import { appUrl, sendSignInLink } from "@/lib/email";

// `SignInState`, `SIGN_IN_IDLE`, and `safeNext` live in `@/lib/auth/shared`: a
// "use server" module may only export async functions.

/** Shown whether or not the address is known. */
const SENT_MESSAGE =
  "Gelukt. Staat het adres in de bus-lijst, dan ligt er nu een inloglink in de mail. De link werkt een kwartier.";

/**
 * One request per address per interval. In-process, so it is per-instance: on
 * more than one instance this becomes a soft limit rather than a real one, and
 * wants moving to shared storage (Upstash Redis, Vercel's runtime cache) at that
 * point. It is here because an unthrottled endpoint that sends mail to an
 * address of the caller's choosing is a way to flood someone's inbox.
 */
const THROTTLE_MS = 60_000;
const THROTTLE_KEY = "__boekDeBusSignInThrottle__";

function throttle(): Map<string, number> {
  const holder = globalThis as typeof globalThis & {
    [THROTTLE_KEY]?: Map<string, number>;
  };
  holder[THROTTLE_KEY] ??= new Map();
  return holder[THROTTLE_KEY];
}

function recentlySent(email: string, now: number): boolean {
  const seen = throttle();
  const last = seen.get(email);
  if (last !== undefined && now - last < THROTTLE_MS) return true;
  seen.set(email, now);
  // Opportunistic sweep; the map only ever holds one entry per household member.
  for (const [key, at] of seen) {
    if (now - at >= THROTTLE_MS) seen.delete(key);
  }
  return false;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestSignInLink(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const raw = formData.get("email");
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const next = safeNext(formData.get("next"));

  if (!EMAIL_PATTERN.test(email)) {
    return { status: "error", message: "Vul een geldig e-mailadres in." };
  }

  const now = Date.now();
  if (recentlySent(email, now)) {
    // Deliberately the success message: telling the caller they are being
    // throttled would confirm the address is worth throttling.
    return { status: "sent", message: SENT_MESSAGE };
  }

  const user = await db.findUserByEmail(email);
  if (user) {
    const { token, hash } = newSignInToken();
    await db.createLoginToken({
      tokenHash: hash,
      userId: user.id,
      expiresAt: new Date(now + SIGN_IN_TTL_MS),
    });

    const url = new URL(`${appUrl()}/auth/verify`);
    url.searchParams.set("token", token);
    if (next !== "/") url.searchParams.set("next", next);

    const sent = await sendSignInLink({
      to: user.email,
      name: user.name,
      url: url.toString(),
      expiresInMinutes: SIGN_IN_TTL_MINUTES,
    });
    if (!sent.ok) {
      return {
        status: "error",
        message: "De mail kon niet verstuurd worden. Probeer het nog eens.",
      };
    }
  }

  return { status: "sent", message: SENT_MESSAGE };
}

export async function signOut() {
  await endSession();
  redirect("/login");
}
