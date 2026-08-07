/**
 * In-memory `Repository`. This is the one deliberately fake layer in the app.
 *
 * It is not a toy, though: it enforces the same invariants `schema.sql` does —
 * overlapping approved trips are refused, login tokens are single-use and
 * expire, emails are matched case-insensitively — so the code above it is
 * exercised against the same rules the real database will apply. Swapping in
 * Postgres means adding one file and pointing `index.ts` at it; nothing that
 * imports `Repository` changes.
 *
 * What it does not do: survive a restart, or coordinate between instances. Data
 * lives in the process, so a deployed copy on more than one instance will
 * disagree with itself. That is the expected cost of the stub.
 */

// No `server-only` marker here on purpose: the tests import this module
// directly, and that package throws outside a react-server condition. The guard
// lives on `./index.ts`, which is what application code imports.

import type { Day } from "@/lib/boek-de-bus/schedule";
import type {
  ApproveResult,
  NewLoginToken,
  RejectResult,
  Repository,
} from "./repository";
import type {
  LoginToken,
  NewTrip,
  Role,
  Trip,
  TripWithUser,
  User,
} from "./types";

type Store = {
  users: User[];
  trips: Trip[];
  tokens: LoginToken[];
};

/**
 * Held on `globalThis` so the dev server's hot reload does not wipe the data on
 * every edit — module state is discarded when a module is replaced, globals are
 * not. A restart still clears it.
 */
const GLOBAL_KEY = "__boekDeBusStubStore__";

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const word = local.split(/[._-]/)[0] ?? local;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * The seed is the invitation list: there is no self-signup, so a person can
 * only sign in if they are here. Override with `OWNER_EMAILS` / `GUEST_EMAILS`
 * (comma-separated) to make the stub match a real household.
 */
function seedUsers(): User[] {
  const parse = (value: string | undefined, role: Role): User[] =>
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
      .map((email) => ({
        id: crypto.randomUUID(),
        email,
        name: nameFromEmail(email),
        role,
      }));

  const owners = parse(process.env.OWNER_EMAILS, "owner");
  const guests = parse(process.env.GUEST_EMAILS, "guest");
  if (owners.length > 0 || guests.length > 0) return [...owners, ...guests];

  return [
    {
      id: crypto.randomUUID(),
      email: "jan@example.com",
      name: "Jan",
      role: "owner",
    },
    {
      id: crypto.randomUUID(),
      email: "els@example.com",
      name: "Els",
      role: "owner",
    },
    {
      id: crypto.randomUUID(),
      email: "sanne@example.com",
      name: "Sanne",
      role: "guest",
    },
    {
      id: crypto.randomUUID(),
      email: "tom@example.com",
      name: "Tom",
      role: "guest",
    },
  ];
}

function store(): Store {
  const holder = globalThis as typeof globalThis & { [GLOBAL_KEY]?: Store };
  if (!holder[GLOBAL_KEY]) {
    holder[GLOBAL_KEY] = { users: seedUsers(), trips: [], tokens: [] };
  }
  return holder[GLOBAL_KEY];
}

const overlaps = (
  a: { start: Day; end: Day },
  b: { start: Day; end: Day },
): boolean => a.start <= b.end && b.start <= a.end;

function join(trip: Trip, users: readonly User[]): TripWithUser {
  const user = users.find((u) => u.id === trip.userId);
  return {
    ...trip,
    user: {
      id: trip.userId,
      name: user?.name ?? "Onbekend",
      email: user?.email ?? "",
    },
  };
}

export const stubRepository: Repository = {
  async findUserByEmail(email) {
    const wanted = email.trim().toLowerCase();
    return store().users.find((u) => u.email === wanted) ?? null;
  },

  async findUserById(id) {
    return store().users.find((u) => u.id === id) ?? null;
  },

  async listOwners() {
    return store().users.filter((u) => u.role === "owner");
  },

  async createLoginToken(token: NewLoginToken) {
    store().tokens.push({
      id: crypto.randomUUID(),
      tokenHash: token.tokenHash,
      userId: token.userId,
      expiresAt: token.expiresAt,
      consumedAt: null,
    });
  },

  async consumeLoginToken(tokenHash, now) {
    const db = store();
    const token = db.tokens.find((t) => t.tokenHash === tokenHash);
    // Unknown, already spent, or expired all fail the same way on purpose.
    if (!token || token.consumedAt !== null || token.expiresAt <= now) {
      return null;
    }
    token.consumedAt = now;
    return db.users.find((u) => u.id === token.userId) ?? null;
  },

  async listTripsFrom(from) {
    const db = store();
    return db.trips
      .filter((t) => t.status !== "rejected" && t.end >= from)
      .sort((a, b) => a.start - b.start)
      .map((t) => join(t, db.users));
  },

  async listPendingTrips() {
    const db = store();
    return db.trips
      .filter((t) => t.status === "pending")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((t) => join(t, db.users));
  },

  async findTripById(id) {
    const db = store();
    const trip = db.trips.find((t) => t.id === id);
    return trip ? join(trip, db.users) : null;
  },

  async createTrip(trip: NewTrip) {
    const db = store();
    if (trip.status === "approved") {
      const clash = db.trips.some(
        (t) => t.status === "approved" && overlaps(t, trip),
      );
      // Mirrors the `trips_no_overlap` exclusion constraint.
      if (clash) throw new Error("trips_no_overlap");
    }
    const row: Trip = {
      id: crypto.randomUUID(),
      userId: trip.userId,
      start: trip.start,
      end: trip.end,
      destination: trip.destination,
      note: trip.note,
      status: trip.status,
      createdAt: new Date(),
      decidedAt: trip.status === "pending" ? null : new Date(),
      decidedBy: trip.status === "pending" ? null : trip.decidedBy,
    };
    db.trips.push(row);
    return join(row, db.users);
  },

  async approveTrip(id, deciderId, now): Promise<ApproveResult> {
    const db = store();
    const trip = db.trips.find((t) => t.id === id);
    if (!trip) return { ok: false, reason: "not-found" };
    if (trip.status !== "pending")
      return { ok: false, reason: "already-decided" };

    const clash = db.trips.some(
      (t) => t.id !== id && t.status === "approved" && overlaps(t, trip),
    );
    if (clash) return { ok: false, reason: "conflict" };

    trip.status = "approved";
    trip.decidedAt = now;
    trip.decidedBy = deciderId;
    return { ok: true, trip: join(trip, db.users) };
  },

  async rejectTrip(id, deciderId, now): Promise<RejectResult> {
    const db = store();
    const trip = db.trips.find((t) => t.id === id);
    if (!trip) return { ok: false, reason: "not-found" };
    if (trip.status !== "pending")
      return { ok: false, reason: "already-decided" };

    trip.status = "rejected";
    trip.decidedAt = now;
    trip.decidedBy = deciderId;
    return { ok: true, trip: join(trip, db.users) };
  },
};

/** Drops all state. Tests only — never called by the app. */
export function resetStubStore(): void {
  const holder = globalThis as typeof globalThis & { [GLOBAL_KEY]?: Store };
  delete holder[GLOBAL_KEY];
}
