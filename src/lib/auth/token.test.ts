import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  hashSignInToken,
  newSignInToken,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  sessionCookie,
  signSession,
  verifySession,
} from "./token";

// Passed explicitly so these tests never depend on SESSION_SECRET being set.
const SECRET = "test-secret-that-is-at-least-32-characters-long";
const OTHER_SECRET = "a-different-secret-also-32-characters-long!!";
const NOW = new Date("2026-08-06T12:00:00.000Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);

const validToken = () =>
  signSession({ sub: "user-1", exp: later(60_000).getTime() }, SECRET);

/**
 * Reproduces the signing construction so a test can put a *validly signed*
 * arbitrary body in front of `verifySession`. Without this, every odd payload
 * would be caught by the signature check and the shape checks after it would
 * never actually run.
 */
function signedBody(payload: unknown): string {
  const body = Buffer.from(JSON.stringify(payload) ?? "", "utf8").toString(
    "base64url",
  );
  return `${body}.${createHmac("sha256", SECRET).update(body).digest("base64url")}`;
}

function signedRaw(raw: string): string {
  const body = Buffer.from(raw, "utf8").toString("base64url");
  return `${body}.${createHmac("sha256", SECRET).update(body).digest("base64url")}`;
}

describe("session token", () => {
  test("round-trips the payload", () => {
    const payload = { sub: "user-1", exp: later(60_000).getTime() };
    expect(verifySession(signSession(payload, SECRET), NOW, SECRET)).toEqual(
      payload,
    );
  });

  test("carries nothing but the subject and the expiry", () => {
    const [body] = validToken().split(".");
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    expect(Object.keys(decoded).sort()).toEqual(["exp", "sub"]);
  });

  test("rejects a tampered payload", () => {
    const token = validToken();
    const [, signature] = token.split(".");
    // Re-encode a different user, keeping the original signature.
    const forged = Buffer.from(
      JSON.stringify({ sub: "user-2", exp: later(60_000).getTime() }),
      "utf8",
    ).toString("base64url");
    expect(verifySession(`${forged}.${signature}`, NOW, SECRET)).toBeNull();
  });

  test("rejects a tampered signature", () => {
    const [body, signature] = validToken().split(".");
    // Flip a bit in the decoded bytes rather than swapping a base64url
    // character: the final character of a 43-char encoding carries only two
    // significant bits, so several distinct characters decode to the same 32
    // bytes and "tampering" with it would change nothing.
    const raw = Buffer.from(signature, "base64url");
    raw[0] ^= 0xff;
    expect(
      verifySession(`${body}.${raw.toString("base64url")}`, NOW, SECRET),
    ).toBeNull();
  });

  test("rejects a signature of the wrong length", () => {
    const [body, signature] = validToken().split(".");
    const raw = Buffer.from(signature, "base64url");
    for (const wrong of [
      raw.subarray(0, 31),
      Buffer.concat([raw, Buffer.of(0)]),
    ]) {
      // Must return null, not throw — `timingSafeEqual` throws on a length
      // mismatch, so this is the screen in front of it.
      expect(
        verifySession(`${body}.${wrong.toString("base64url")}`, NOW, SECRET),
      ).toBeNull();
    }
  });

  test("rejects a token signed with another secret", () => {
    const token = signSession(
      { sub: "user-1", exp: later(60_000).getTime() },
      OTHER_SECRET,
    );
    expect(verifySession(token, NOW, SECRET)).toBeNull();
    // Sanity: it is a valid token, just not for us.
    expect(verifySession(token, NOW, OTHER_SECRET)).not.toBeNull();
  });

  test("rejects an unsigned 'none'-style token", () => {
    const body = Buffer.from(
      JSON.stringify({ sub: "user-1", exp: later(60_000).getTime() }),
      "utf8",
    ).toString("base64url");
    expect(verifySession(body, NOW, SECRET)).toBeNull();
    expect(verifySession(`${body}.`, NOW, SECRET)).toBeNull();
  });

  test("expires exactly at its expiry, not after", () => {
    const exp = later(60_000).getTime();
    const token = signSession({ sub: "user-1", exp }, SECRET);
    expect(verifySession(token, new Date(exp - 1), SECRET)).not.toBeNull();
    expect(verifySession(token, new Date(exp), SECRET)).toBeNull();
    expect(verifySession(token, new Date(exp + 1), SECRET)).toBeNull();
  });

  test("rejects junk without throwing", () => {
    for (const bad of [
      undefined,
      null,
      "",
      ".",
      "..",
      "not-a-token",
      "a.b.c",
      `${"x".repeat(500)}.${"y".repeat(500)}`,
      // Valid signature shape over a payload that is not JSON.
      `${Buffer.from("not json").toString("base64url")}.AAAA`,
    ]) {
      expect(verifySession(bad, NOW, SECRET)).toBeNull();
    }
  });

  test("rejects a correctly signed payload of the wrong shape", () => {
    const exp = later(60_000).getTime();
    for (const payload of [
      { sub: "", exp },
      { sub: 42, exp },
      { sub: "user-1" },
      { sub: "user-1", exp: "soon" },
      { sub: "user-1", exp: Number.POSITIVE_INFINITY },
      { sub: "user-1", exp: null },
      null,
      "a string",
      [1, 2, 3],
      42,
    ]) {
      const token = signedBody(payload);
      // The signature is genuinely valid, so only the shape check can reject it.
      expect(verifySession(token, NOW, SECRET)).toBeNull();
    }
  });

  test("rejects a correctly signed body that is not JSON at all", () => {
    expect(verifySession(signedRaw("not json"), NOW, SECRET)).toBeNull();
    expect(verifySession(signedRaw(""), NOW, SECRET)).toBeNull();
  });

  test("NaN expiry does not slip through as a comparison that is always false", () => {
    // `NaN <= now` is false, so a missing `Number.isFinite` check here would
    // hand out a session that never expires.
    expect(
      verifySession(
        signedBody({ sub: "user-1", exp: Number.NaN }),
        NOW,
        SECRET,
      ),
    ).toBeNull();
  });
});

describe("session cookie", () => {
  test("is httpOnly, lax, path-wide, and expires with the token", () => {
    const cookie = sessionCookie("user-1", NOW);
    expect(cookie.name).toBe(SESSION_COOKIE);
    expect(cookie.options.httpOnly).toBe(true);
    expect(cookie.options.sameSite).toBe("lax");
    expect(cookie.options.path).toBe("/");
    expect(cookie.options.expires.getTime()).toBe(
      NOW.getTime() + SESSION_TTL_MS,
    );
  });

  test("its value is a session token for that user", () => {
    const cookie = sessionCookie("user-1", NOW);
    // No secret passed, so this exercises the ambient one the app will use.
    expect(verifySession(cookie.value, NOW)?.sub).toBe("user-1");
  });
});

describe("sign-in token", () => {
  test("only the hash is storable, and it matches the token", () => {
    const { token, hash } = newSignInToken();
    expect(hashSignInToken(token)).toBe(hash);
    // The hash must not contain the token, or storing it would defeat the point.
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is long enough to be unguessable and URL-safe", () => {
    const { token } = newSignInToken();
    // 32 random bytes, base64url — no padding, no characters needing escaping.
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test("never repeats", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(newSignInToken().token);
    expect(seen.size).toBe(500);
  });

  test("hashing is deterministic and diverges on any change", () => {
    expect(hashSignInToken("abc")).toBe(hashSignInToken("abc"));
    expect(hashSignInToken("abc")).not.toBe(hashSignInToken("abd"));
  });
});
