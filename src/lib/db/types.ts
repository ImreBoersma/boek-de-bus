/**
 * Row shapes for `schema.sql`, and the conversions between how Postgres stores
 * a date and how the domain identifies one.
 *
 * Dates cross this boundary as `YYYY-MM-DD` strings, which is what a Postgres
 * `date` column yields and accepts. The domain works in `Day` (epoch-ms of UTC
 * midnight), so every read and write goes through the two functions at the
 * bottom rather than constructing `Date`s ad hoc.
 */

import type { Day } from "@/lib/boek-de-bus/schedule";

export type Role = "owner" | "guest";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export type TripStatus = "pending" | "approved" | "rejected";

export type Trip = {
  id: string;
  userId: string;
  start: Day;
  end: Day;
  destination: string;
  note: string;
  status: TripStatus;
  createdAt: Date;
  decidedAt: Date | null;
  decidedBy: string | null;
};

/** A trip joined to the person who asked for it — what every screen renders. */
export type TripWithUser = Trip & {
  user: Pick<User, "id" | "name" | "email">;
};

export type NewTrip = {
  userId: string;
  start: Day;
  end: Day;
  destination: string;
  note: string;
  status: TripStatus;
  decidedBy: string | null;
};

export type LoginToken = {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  consumedAt: Date | null;
};

/** The initial drawn on a booked day's badge. */
export function initialOf(name: string): string {
  return (name.trim().at(0) ?? "?").toUpperCase();
}

/** `Day` → the `YYYY-MM-DD` a Postgres `date` column expects. */
export function toDateString(d: Day): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` from a `date` column → `Day`. */
export function fromDateString(s: string): Day {
  const [year, month, date] = s.split("-").map(Number);
  return Date.UTC(year, month - 1, date);
}
