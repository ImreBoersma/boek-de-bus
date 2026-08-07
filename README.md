# Boek de Bus

A household tool for sharing one camper van. Pick a period on the calendar and
either book it outright or put in a request; Jan and Els approve or reject, and
everyone gets told by email.

Dutch-language UI, built with Next.js 16 (App Router, Turbopack, React Compiler),
React 19, Tailwind 4, and Biome.

## Running it

```bash
bun install
bun dev
```

Then open <http://localhost:3000>.

There is no self-signup — the app is an invitation list. In development the
seeded household is `jan@example.com` and `els@example.com` as owners, plus
`sanne@example.com` and `tom@example.com` as guests. Override with
`OWNER_EMAILS` / `GUEST_EMAILS`; see [`.env.example`](.env.example).

**Signing in locally:** email delivery is stubbed, so the sign-in link is printed
to the terminal running `bun dev` rather than sent. Enter one of the seeded
addresses on `/login`, then copy the `/auth/verify?token=…` URL out of the log.

## Checks

```bash
bun run verify      # biome + tsc + tests
bun test            # 120 unit tests
bun run typecheck
bun run lint
bun run build
```

> **A green build does not mean the pages render.** Every route here is dynamic
> (`ƒ` in the build output), so its module is never evaluated during a build —
> a broken import or an illegal export surfaces only on the first request. After
> changing anything under `lib/actions/` or `lib/db/`, load the app, not just the
> build.
>
> The sharpest edge is that a `"use server"` module may export **only** async
> functions. Its exports become the server-action registry and the transform
> emits a runtime reference for each exported name — including a type-only one
> TypeScript has already erased, which then throws
> `ReferenceError: X is not defined` at module evaluation and takes down every
> page importing it. `tsc`, Biome, and `next build` all pass on that.
> `src/lib/actions/use-server.test.ts` reads the source and fails instead.

## How it fits together

```
src/
  app/                        routes
    page.tsx                  the calendar, per-person
    login/                    request a sign-in link
    auth/verify/route.ts      redeem one
    aanvragen/                the owner queue
  components/boek-de-bus/     UI
  lib/
    boek-de-bus/
      schedule.ts             pure calendar domain: days, months, availability
      booking.ts              the rules for booking and deciding
      trips.ts                stored trips -> calendar shapes
    actions/                  "use server" entry points (thin)
    auth/                     sessions, sign-in tokens, authorization
    db/                       schema, repository interface, stub
    email/                    messages and transport
  proxy.ts                    optimistic auth routing
```

Two ideas run through it:

**The domain is pure and the clock is injected.** `schedule.ts` reads no clock
and does no I/O — "today" is always a parameter. That is what makes the calendar
testable, and it is also a correctness requirement: a module-level `Date.now()`
would freeze "today" at process start for the lifetime of the server.

**Rules are separated from the server-action wrapper.** `booking.ts` takes its
repository, notifier, and clock as arguments, so the rules are tested against a
real repository and an observable notifier rather than only through HTTP. The
`"use server"` functions in `lib/actions/` just supply the session and the live
dependencies.

### Authorization

Server actions are reachable by direct POST, not only through the UI, so every
one re-derives permission from the session and re-checks the period against
stored data. `proxy.ts` also redirects signed-out traffic, but it only verifies
the cookie signature and is a convenience for the address bar, not a control.
The checks that matter are in `lib/auth/dal.ts` and `lib/boek-de-bus/booking.ts`.

Sessions are HMAC-SHA256-signed cookies (`httpOnly`, `sameSite=lax`, 30 days).
Sign-in links are single-use, expire in 15 minutes, and only their SHA-256 is
stored, so a database dump cannot be turned back into working links.

## What is stubbed

Everything is real except two layers, both behind interfaces:

| Layer | Real | Stub |
| --- | --- | --- |
| Database | [`schema.sql`](src/lib/db/schema.sql), row types, `Repository` interface | In-memory store ([`stub.ts`](src/lib/db/stub.ts)) |
| Email | Subjects, Dutch copy, text + HTML parts | Writes to the server log ([`transport.ts`](src/lib/email/transport.ts)) |

The stub repository enforces the same invariants the schema does — no
overlapping approved trips, single-use expiring tokens, case-insensitive email —
so the code above it runs against the rules Postgres will apply. What it does not
do is survive a restart or coordinate between instances.

### Going to real Postgres

1. Provision it (Neon via the Vercel Marketplace) and apply
   [`src/lib/db/schema.sql`](src/lib/db/schema.sql).
2. Add `src/lib/db/postgres.ts` exporting a `Repository`, mapping the
   `trips_no_overlap` violation onto `approveTrip`'s `conflict` result.
3. Change one line in [`src/lib/db/index.ts`](src/lib/db/index.ts).

No screen, action, or test changes. The schema's exclusion constraint is what
makes double-booking impossible under concurrency — application checks alone
cannot, which is why `approveTrip` reports a conflict rather than returning a
trip.

### Going to real email

1. Add `src/lib/email/resend.ts` exporting a `Transport`.
2. Bind it in `transport()` in [`src/lib/email/index.ts`](src/lib/email/index.ts).

Production already refuses to boot on the log transport unless `ALLOW_LOG_EMAIL`
is set, so this cannot be forgotten silently.

## Known limits

- **The stub loses data on restart** and disagrees with itself across instances.
  Real persistence is the first thing to add.
- **Sign-in throttling is per-process** (`lib/actions/auth.ts`), so it softens
  rather than enforces on more than one instance. Wants shared storage.
- The bookable window is a rolling 12 months (`BOOKABLE_MONTHS`).
