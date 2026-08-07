import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A "use server" module may only export async functions.
 *
 * This is not a style rule. Such a module's exports become the server-action
 * registry, and the transform that builds it emits a runtime reference for every
 * exported name — including type-only ones, which TypeScript has already erased.
 * The result is `ReferenceError: X is not defined` thrown at module evaluation,
 * taking down every page that imports the module.
 *
 * Nothing else catches it:
 *
 *  - `tsc` is happy, because `export type` is valid TypeScript.
 *  - Biome is happy, because it is valid JavaScript once erased.
 *  - `next build` is happy, because every route in this app is dynamic and a
 *    dynamic route's module is never evaluated during a build.
 *
 * So it is caught here, by reading the source.
 */

const SRC = join(import.meta.dir, "..", "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

const serverModules = walk(SRC).filter((path) =>
  /^\s*["']use server["']/.test(readFileSync(path, "utf8")),
);

/** Strips block and line comments so commented-out code is not flagged. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe('"use server" modules', () => {
  test("there is at least one, or this suite is silently vacuous", () => {
    expect(serverModules.length).toBeGreaterThan(0);
  });

  for (const path of serverModules) {
    const relative = path.slice(SRC.length + 1);

    test(`${relative} exports only async functions`, () => {
      const exports = code(readFileSync(path, "utf8"))
        .split("\n")
        .filter((line) => /^export\b/.test(line));

      expect(exports.length).toBeGreaterThan(0);
      for (const line of exports) {
        // `export async function name(` and nothing else. In particular no
        // `export type {…}`, `export const`, `export {…}`, or `export default`.
        expect(line).toMatch(/^export async function [A-Za-z_$][\w$]*\s*\(/);
      }
    });

    test(`${relative} re-exports nothing, not even a type`, () => {
      const source = code(readFileSync(path, "utf8"));
      expect(source).not.toMatch(/^export\s+(type\s+)?\{/m);
      expect(source).not.toMatch(/^export\s+\*/m);
    });
  }
});
