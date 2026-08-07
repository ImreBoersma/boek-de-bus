/**
 * The data access contract. Every query the app makes is named here, so the
 * screens and actions depend on this interface rather than on a driver.
 *
 * Two things are deliberately part of the contract rather than left to callers:
 *
 *  - `approveTrip` reports a `conflict` instead of returning a trip. Approving
 *    is the one operation with a race — two owners approving overlapping
 *    requests at the same moment — and the only place it can be settled
 *    correctly is inside the write. Postgres has the `trips_no_overlap`
 *    exclusion constraint for exactly this; a caller-side "check then write"
 *    cannot be made safe.
 *  - `consumeLoginToken` both validates and spends the token in one call, so a
 *    link cannot be redeemed twice by two concurrent requests.
 */

import type { Day } from "@/lib/boek-de-bus/schedule";
import type { NewTrip, TripStatus, TripWithUser, User } from "./types";

export type ApproveResult =
  | { ok: true; trip: TripWithUser }
  | { ok: false; reason: "not-found" | "already-decided" | "conflict" };

export type RejectResult =
  | { ok: true; trip: TripWithUser }
  | { ok: false; reason: "not-found" | "already-decided" };

export type NewLoginToken = {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
};

export interface Repository {
  /** `email` is normalised by the caller; implementations may assume lowercase. */
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  /** Everyone who decides on requests — the recipients of the notify email. */
  listOwners(): Promise<User[]>;

  createLoginToken(token: NewLoginToken): Promise<void>;
  /**
   * Spend a token. Returns the user it belonged to, or `null` if the hash is
   * unknown, already spent, or expired — the caller cannot tell which, on
   * purpose, so a bad link leaks nothing about why it failed.
   */
  consumeLoginToken(tokenHash: string, now: Date): Promise<User | null>;

  /**
   * Pending and approved trips ending on or after `from`, for the calendar.
   * Rejected trips are never returned; they leave no mark on the schedule.
   */
  listTripsFrom(from: Day): Promise<TripWithUser[]>;
  /** The owner queue, oldest request first. */
  listPendingTrips(): Promise<TripWithUser[]>;
  findTripById(id: string): Promise<TripWithUser | null>;

  /**
   * Insert a trip. `status` is decided by the caller from the requester's role.
   * Throws on an approved trip that would overlap an existing approved one —
   * callers that can hit that must check first and treat a throw as a lost race.
   */
  createTrip(trip: NewTrip): Promise<TripWithUser>;

  approveTrip(id: string, deciderId: string, now: Date): Promise<ApproveResult>;
  rejectTrip(id: string, deciderId: string, now: Date): Promise<RejectResult>;
}

/** Which statuses a trip may be moved to from `pending`. */
export const DECIDABLE: readonly TripStatus[] = ["approved", "rejected"];
