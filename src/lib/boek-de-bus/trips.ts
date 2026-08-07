/**
 * Turning stored trips into the shape the calendar reasons about.
 *
 * The domain deals in `Booking` and `PendingRequest` — start, end, whose it is,
 * what initial to draw — and knows nothing about rows, statuses, or users. This
 * is the one place that translates, and it is pure, so both the server component
 * that renders the calendar and the server action that re-validates a submission
 * can use it.
 */

import type { TripWithUser } from "@/lib/db/types";
import { initialOf } from "@/lib/db/types";
import type { Booking, PendingRequest, Schedule } from "./schedule";

/** Input length caps, shared by the form's `maxLength` and the server's check. */
export const MAX_DESTINATION = 120;
export const MAX_NOTE = 500;

/**
 * Approved trips only — these are the days nobody else can take.
 *
 * `viewerId` decides which are drawn in the accent ramp as the viewer's own, so
 * the same stored trip renders differently for Jan than it does for Sanne.
 */
export function toBookings(
  trips: readonly TripWithUser[],
  viewerId: string,
): Booking[] {
  return trips
    .filter((trip) => trip.status === "approved")
    .map((trip) => ({
      start: trip.start,
      end: trip.end,
      chip: initialOf(trip.user.name),
      own: trip.userId === viewerId,
    }));
}

/** Requests still awaiting a decision. They may overlap each other freely. */
export function toPending(
  trips: readonly TripWithUser[],
  viewerId: string,
): PendingRequest[] {
  return trips
    .filter((trip) => trip.status === "pending")
    .map((trip) => ({
      start: trip.start,
      end: trip.end,
      own: trip.userId === viewerId,
    }));
}

export function toSchedule(
  trips: readonly TripWithUser[],
  viewerId: string,
): Schedule {
  return {
    bookings: toBookings(trips, viewerId),
    pending: toPending(trips, viewerId),
  };
}
