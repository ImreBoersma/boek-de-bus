/**
 * What actually happens when someone books, approves, or rejects.
 *
 * This is the product's rules, kept apart from the `"use server"` wrapper in
 * `@/lib/actions/trips`. Everything it touches — the repository, the notifier,
 * the clock — arrives as an argument, so the rules can be tested against a real
 * repository and an observable notifier instead of being reachable only through
 * an HTTP round trip. The action layer's whole job is to supply the session and
 * the live dependencies.
 *
 * Every function here re-derives permission from the `User` it is given and
 * re-checks the period against stored data. Callers are assumed hostile: a
 * server action is reachable by direct POST, so "the UI would not have let them"
 * is not a check.
 */

import type { Repository } from "@/lib/db/repository";
import type { TripWithUser, User } from "@/lib/db/types";
import type { Day } from "./schedule";
import {
  DAY_MS,
  dayOf,
  isRangeFree,
  isWithinWindow,
  rangeWords,
} from "./schedule";
import { MAX_DESTINATION, MAX_NOTE, toBookings } from "./trips";

/** How the outside world gets told. Implemented for real in `@/lib/email`. */
export type Notifier = {
  requestFiled(params: {
    owners: readonly string[];
    requesterName: string;
    start: Day;
    end: Day;
    today: Day;
    destination: string;
    note: string;
  }): Promise<unknown>;
  decision(params: {
    to: string;
    name: string;
    approved: boolean;
    deciderName: string;
    start: Day;
    end: Day;
    today: Day;
  }): Promise<unknown>;
};

export type BookingDeps = {
  repo: Repository;
  notify: Notifier;
  now: Date;
};

export type SubmitInput = {
  start: number;
  end: number;
  destination: string;
  note: string;
};

export type SubmitResult =
  | { ok: true; words: string; approved: boolean }
  | { ok: false; error: string };

export type DecisionResult = { ok: true } | { ok: false; error: string };

export const SIGNED_OUT =
  "Je bent uitgelogd. Log opnieuw in en probeer het nog eens.";
export const TAKEN =
  "Die dagen zijn net vergeven. Kies een andere periode op de kalender.";
export const BAD_PERIOD = "Die periode klopt niet. Kies hem opnieuw.";
export const OUT_OF_WINDOW =
  "Die periode valt buiten de kalender. Kies een andere.";
export const NOT_AN_OWNER = "Alleen Jan en Els beslissen over aanvragen.";
export const GONE = "Die aanvraag bestaat niet meer.";
export const ALREADY_DECIDED = "Daar is al over beslist.";
export const NOW_BOOKED =
  "Die dagen zijn inmiddels geboekt. Deze aanvraag kan niet meer goedgekeurd worden.";

/**
 * A `Day` is the epoch-ms of a UTC midnight, so every valid value is an exact
 * multiple of a day. Anything else did not come from the calendar.
 */
function parseDay(value: unknown): Day | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value % DAY_MS !== 0) return null;
  return value;
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Book a period outright (owner) or file it as a request (anyone else). */
export async function placeTrip(
  user: User,
  input: SubmitInput,
  { repo, notify, now }: BookingDeps,
): Promise<SubmitResult> {
  const start = parseDay(input?.start);
  const end = parseDay(input?.end);
  if (start == null || end == null || end < start) {
    return { ok: false, error: BAD_PERIOD };
  }

  const today = dayOf(now);
  if (!isWithinWindow(start, end, today)) {
    return { ok: false, error: OUT_OF_WINDOW };
  }

  // Re-read the schedule rather than believing what the client drew from.
  const trips = await repo.listTripsFrom(today);
  if (!isRangeFree(start, end, toBookings(trips, user.id), today)) {
    return { ok: false, error: TAKEN };
  }

  const owner = user.role === "owner";
  const destination = clean(input?.destination, MAX_DESTINATION);
  const note = clean(input?.note, MAX_NOTE);

  try {
    await repo.createTrip({
      userId: user.id,
      start,
      end,
      destination,
      note,
      status: owner ? "approved" : "pending",
      decidedBy: owner ? user.id : null,
    });
  } catch {
    // The overlap constraint fired between the check above and the write.
    return { ok: false, error: TAKEN };
  }

  // Only a request needs announcing; an owner booking their own trip already
  // knows about it.
  if (!owner) {
    const owners = await repo.listOwners();
    await notify.requestFiled({
      owners: owners.map((o) => o.email),
      requesterName: user.name,
      start,
      end,
      today,
      destination,
      note,
    });
  }

  return { ok: true, words: rangeWords(start, end, today), approved: owner };
}

/** Approve or reject a pending request. Owners only. */
export async function decideOnTrip(
  user: User,
  tripId: string,
  approve: boolean,
  { repo, notify, now }: BookingDeps,
): Promise<DecisionResult> {
  if (user.role !== "owner") return { ok: false, error: NOT_AN_OWNER };
  if (typeof tripId !== "string" || tripId.length === 0) {
    return { ok: false, error: GONE };
  }

  const result = approve
    ? await repo.approveTrip(tripId, user.id, now)
    : await repo.rejectTrip(tripId, user.id, now);

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "conflict"
          ? NOW_BOOKED
          : result.reason === "already-decided"
            ? ALREADY_DECIDED
            : GONE,
    };
  }

  await announce(result.trip, approve, user, notify, dayOf(now));
  return { ok: true };
}

function announce(
  trip: TripWithUser,
  approved: boolean,
  decider: User,
  notify: Notifier,
  today: Day,
) {
  return notify.decision({
    to: trip.user.email,
    name: trip.user.name,
    approved,
    deciderName: decider.name,
    start: trip.start,
    end: trip.end,
    today,
  });
}
