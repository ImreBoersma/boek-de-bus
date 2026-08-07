/**
 * Icons for the flow. Lucide outlines at stroke-width 2.75, which is the
 * heavier weight the Organic design system asks for.
 *
 * All of them are decorative — every one sits next to text that already says
 * what it means — so each is hidden from assistive tech.
 */

type IconProps = { size?: number };

const outline = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/**
 * The Boek de Bus mark: a camper van on a sage road with an approved-tick.
 * Drawn from the design system's tokens rather than the prototype's literal
 * hexes.
 */
export function BusMark() {
  return (
    <svg
      width="40"
      height="30"
      viewBox="0 0 50 38"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 31.5 H46"
        stroke="var(--color-accent-2)"
        strokeWidth="2.75"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M6 27.5 V18 a5 5 0 0 1 5-5 h16 a6 6 0 0 1 4.9 2.55 l3.4 4.9 a6 6 0 0 1 1.06 3.4 V27.5"
        stroke="var(--color-text)"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 27.5 h3.1 M18.1 27.5 h9.2 M31.9 27.5 h4.5"
        stroke="var(--color-text)"
        strokeWidth="2.75"
        strokeLinecap="round"
      />
      <circle
        cx="13.6"
        cy="27.5"
        r="3.4"
        stroke="var(--color-text)"
        strokeWidth="2.75"
        fill="var(--color-bg)"
      />
      <circle
        cx="27.3"
        cy="27.5"
        r="3.4"
        stroke="var(--color-text)"
        strokeWidth="2.75"
        fill="var(--color-bg)"
      />
      <rect
        x="10.5"
        y="17.5"
        width="7"
        height="5"
        rx="1.8"
        stroke="var(--color-accent)"
        strokeWidth="2.5"
      />
      <path
        d="M27.5 17.5 h2.6 a2.4 2.4 0 0 1 1.94 1 l2.3 3.2"
        stroke="var(--color-accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="41" cy="9.5" r="7" fill="var(--color-accent-2)" />
      <path
        d="M37.8 9.5 l2.2 2.2 4-4.4"
        stroke="var(--color-bg)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronLeft({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      {...outline}
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronRight({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      {...outline}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/* The next two sit in a flex row and are stroked a step lighter than the text
   beside them; `.cal-error svg` / `.form-summary svg` handle that. */

export function TriangleAlert({ size = 15 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      {...outline}
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

export function CalendarIcon({ size = 22 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      {...outline}
    >
      <path d="M8 2v4M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="4" />
      <path d="M3 10h18" />
    </svg>
  );
}

export function Check({ size = 38 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      {...outline}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function Xmark({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      {...outline}
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
