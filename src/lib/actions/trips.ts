"use server";

/**
 * The server-action surface for booking and deciding.
 *
 * Thin on purpose: authenticate, hand the rules in `@/lib/boek-de-bus/booking`
 * the live dependencies, and refresh the router. The rules themselves are
 * dependency-injected so they can be tested directly, which is where the real
 * coverage of this behaviour lives.
 *
 * Authentication happens here, on every call. These endpoints are reachable by
 * direct POST, so none of them may assume the UI gated them.
 */

import { refresh } from "next/cache";
import { actingUser } from "@/lib/auth/dal";
import type {
  DecisionResult,
  Notifier,
  SubmitInput,
  SubmitResult,
} from "@/lib/boek-de-bus/booking";
import { decideOnTrip, placeTrip, SIGNED_OUT } from "@/lib/boek-de-bus/booking";
import { db } from "@/lib/db";
import { sendDecision, sendRequestFiled } from "@/lib/email";

// Nothing is re-exported from here, not even a type. A "use server" module's
// exports become the server-action registry, and the transform that builds it
// emits a runtime reference for every export name — including a type-only one,
// which then blows up at module evaluation with "X is not defined". Types come
// from `@/lib/boek-de-bus/booking` directly.

/** The live notifier: the real templates, over whatever transport is bound. */
const notify: Notifier = {
  requestFiled: sendRequestFiled,
  decision: sendDecision,
};

const deps = () => ({ repo: db, notify, now: new Date() });

export async function submitTrip(input: SubmitInput): Promise<SubmitResult> {
  const user = await actingUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const result = await placeTrip(user, input, deps());
  // Even a refusal refreshes: the usual reason for one is that the calendar the
  // client was working from is out of date.
  refresh();
  return result;
}

export async function approveTrip(tripId: string): Promise<DecisionResult> {
  const user = await actingUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const result = await decideOnTrip(user, tripId, true, deps());
  refresh();
  return result;
}

export async function rejectTrip(tripId: string): Promise<DecisionResult> {
  const user = await actingUser();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const result = await decideOnTrip(user, tripId, false, deps());
  refresh();
  return result;
}
