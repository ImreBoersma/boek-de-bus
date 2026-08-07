import { Caprasimo, Figtree } from "next/font/google";

/**
 * The Organic design system's two voices, self-hosted.
 *
 * Both loaders are called here and only here — every call hosts another
 * instance of the family — and `src/styles/organic.css` maps the variables
 * they emit onto its own `--font-heading` / `--font-body` tokens.
 *
 * `variable` emits a CSS class, not a global custom property, so
 * `caprasimo.variable` and `figtree.variable` have to be mounted on <html>
 * for the tokens to resolve. See src/app/layout.tsx.
 */

/** Display face. Non-variable, so a weight is required — 400 is all it has. */
export const caprasimo = Caprasimo({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-caprasimo",
});

/** Body face. Variable, so `weight` is omitted to ship the whole wght axis. */
export const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
});
