import { describe, expect, test } from "bun:test";
import { safeNext } from "./shared";

/**
 * `safeNext` guards the one redirect an attacker can influence. An open redirect
 * on a sign-in route is worth real effort to exploit — the victim genuinely does
 * log into the real app, and is then handed to a page of someone else's
 * choosing — so this is tested as a denylist-resistant allowlist, not a
 * best-effort filter.
 */
describe("safeNext", () => {
  test("keeps a same-site path", () => {
    expect(safeNext("/aanvragen")).toBe("/aanvragen");
    expect(safeNext("/aanvragen?filter=open")).toBe("/aanvragen?filter=open");
    expect(safeNext("/")).toBe("/");
  });

  test("refuses absolute URLs to another host", () => {
    for (const bad of [
      "https://evil.example",
      "http://evil.example",
      "//evil.example",
      "///evil.example",
      "https://evil.example/aanvragen",
    ]) {
      expect(safeNext(bad)).toBe("/");
    }
  });

  test("refuses backslash forms some parsers read as protocol-relative", () => {
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("/\\/evil.example")).toBe("/");
  });

  test("refuses anything that is not an absolute path", () => {
    for (const bad of [
      "aanvragen",
      "../aanvragen",
      "javascript:alert(1)",
      "data:text/html,<script>",
      "mailto:someone@example.com",
    ]) {
      expect(safeNext(bad)).toBe("/");
    }
  });

  test("refuses non-strings and empties", () => {
    for (const bad of [undefined, null, "", 0, 42, {}, [], ["/ok"], true]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});
