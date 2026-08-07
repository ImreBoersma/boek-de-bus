/**
 * Token crypto: the signed session value, and the single-use sign-in token.
 *
 * Pure and dependency-free — Node's `crypto` only — so it can be tested
 * directly. Nothing here touches cookies, the request, or the database; see
 * `session.ts` and `dal.ts` for that.
 *
 * The session token is a signed payload, not an encrypted one. It carries a
 * user id and an expiry and nothing else, both of which the holder already
 * knows, so confidentiality buys nothing and integrity is the whole
 * requirement. `HMAC-SHA256` over the encoded payload gives that.
 */

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * The session cookie's name. It lives here rather than in `session.ts` so that
 * `proxy.ts` can read it without pulling `next/headers` and the `server-only`
 * marker into the proxy bundle.
 */
export const SESSION_COOKIE = "bdb_session";

/** How long a session lasts. Long, because this is a household tool. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** How long a sign-in link stays usable. Short, because it is emailed. */
export const SIGN_IN_TTL_MS = 15 * 60 * 1000;
export const SIGN_IN_TTL_MINUTES = SIGN_IN_TTL_MS / 60_000;

/**
 * A fixed development secret. Only ever used when `SESSION_SECRET` is unset
 * outside production, so that restarting the dev server does not sign everyone
 * out. Production refuses to start without a real secret.
 */
const DEV_SECRET = "boek-de-bus-development-secret-do-not-use-in-production";

const MIN_SECRET_LENGTH = 32;

export function sessionSecret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= MIN_SECRET_LENGTH) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      configured
        ? `SESSION_SECRET is too short: it must be at least ${MIN_SECRET_LENGTH} characters. Generate one with \`openssl rand -base64 32\`.`
        : "SESSION_SECRET is not set. Generate one with `openssl rand -base64 32`.",
    );
  }
  return DEV_SECRET;
}

export type SessionPayload = {
  /** The user's id. */
  sub: string;
  /** Expiry, epoch-ms. */
  exp: number;
};

function hmac(body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

const encode = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

/** `<base64url payload>.<base64url signature>` */
export function signSession(
  payload: SessionPayload,
  secret = sessionSecret(),
): string {
  const body = encode(payload);
  return `${body}.${hmac(body, secret).toString("base64url")}`;
}

/**
 * Verify and decode a session token, or return `null`.
 *
 * The signature is checked before the payload is parsed, so malformed JSON from
 * an attacker is never handed to `JSON.parse`, and the comparison is
 * constant-time. Every failure — bad shape, bad signature, expired — returns the
 * same `null`; the caller has no use for the distinction and the holder of a bad
 * token should not learn which check rejected it.
 */
export function verifySession(
  token: string | undefined | null,
  now: Date,
  secret = sessionSecret(),
): SessionPayload | null {
  if (!token) return null;

  const split = token.lastIndexOf(".");
  if (split <= 0 || split === token.length - 1) return null;

  const body = token.slice(0, split);
  const expected = hmac(body, secret);

  let given: Buffer;
  try {
    given = Buffer.from(token.slice(split + 1), "base64url");
  } catch {
    return null;
  }
  // `timingSafeEqual` throws on a length mismatch, so screen for it first. The
  // length of an HMAC is not a secret.
  if (given.length !== expected.length) return null;
  if (!timingSafeEqual(given, expected)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const { sub, exp } = parsed as Record<string, unknown>;
  if (typeof sub !== "string" || sub.length === 0) return null;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  if (exp <= now.getTime()) return null;

  return { sub, exp };
}

/**
 * Everything needed to write the session cookie, without knowing how it will be
 * written. `session.ts` applies this through `cookies()`; the sign-in route
 * applies it to a `NextResponse` instead, which is why the description lives
 * here in the dependency-free module rather than next to the `cookies()` call.
 */
export type SessionCookie = {
  name: typeof SESSION_COOKIE;
  value: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    expires: Date;
    path: "/";
  };
};

export function sessionCookie(userId: string, now = new Date()): SessionCookie {
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  return {
    name: SESSION_COOKIE,
    value: signSession({ sub: userId, exp: expires.getTime() }),
    options: {
      httpOnly: true,
      // Off over plain http so the cookie works on localhost; on everywhere real.
      secure: process.env.NODE_ENV === "production",
      // Load-bearing: signing in follows a link out of a mail client, which is a
      // cross-site top-level GET. Lax cookies are sent on exactly that; `strict`
      // ones are not, and would land people on a logged-out page right after a
      // successful sign-in.
      sameSite: "lax",
      expires,
      path: "/",
    },
  };
}

/**
 * Mint a sign-in token: 256 bits of randomness for the link, and its SHA-256
 * for the database. Only the hash is ever stored, so a leaked dump cannot be
 * turned back into working links.
 */
export function newSignInToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashSignInToken(token) };
}

export function hashSignInToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
