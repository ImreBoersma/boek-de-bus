import { beforeEach, describe, expect, test } from "bun:test";
import { day } from "@/lib/boek-de-bus/schedule";
import { stubRepository as repo, resetStubStore } from "./stub";
import type { NewTrip } from "./types";
import { fromDateString, initialOf, toDateString } from "./types";

/**
 * These assert the invariants `schema.sql` enforces. They matter because the
 * stub is what the app actually runs against — if it were laxer than the real
 * schema, the code above it would be written against rules Postgres will later
 * refuse.
 */

const NOW = new Date("2026-08-06T12:00:00.000Z");
const D = (date: number) => day(2026, 7, date);

beforeEach(() => {
  resetStubStore();
  process.env.OWNER_EMAILS = "jan@example.com,els@example.com";
  process.env.GUEST_EMAILS = "sanne@example.com";
});

async function users() {
  const jan = await repo.findUserByEmail("jan@example.com");
  const sanne = await repo.findUserByEmail("sanne@example.com");
  if (!jan || !sanne) throw new Error("seed missing");
  return { jan, sanne };
}

const trip = (over: Partial<NewTrip> & Pick<NewTrip, "userId">): NewTrip => ({
  start: D(10),
  end: D(12),
  destination: "",
  note: "",
  status: "pending",
  decidedBy: null,
  ...over,
});

describe("users", () => {
  test("the seed is the invitation list", async () => {
    const { jan, sanne } = await users();
    expect(jan.role).toBe("owner");
    expect(sanne.role).toBe("guest");
    expect(await repo.findUserByEmail("stranger@example.com")).toBeNull();
  });

  test("email matching ignores case and surrounding space", async () => {
    const { jan } = await users();
    expect((await repo.findUserByEmail("  JAN@Example.COM  "))?.id).toBe(
      jan.id,
    );
  });

  test("owners are who gets notified", async () => {
    const owners = await repo.listOwners();
    expect(owners.map((o) => o.email).sort()).toEqual([
      "els@example.com",
      "jan@example.com",
    ]);
  });
});

describe("sign-in tokens", () => {
  test("a token can be spent exactly once", async () => {
    const { sanne } = await users();
    await repo.createLoginToken({
      tokenHash: "hash-1",
      userId: sanne.id,
      expiresAt: new Date(NOW.getTime() + 60_000),
    });

    expect((await repo.consumeLoginToken("hash-1", NOW))?.id).toBe(sanne.id);
    // The whole point: a second redemption of the same link gets nothing.
    expect(await repo.consumeLoginToken("hash-1", NOW)).toBeNull();
  });

  test("an expired token is refused, at the boundary", async () => {
    const { sanne } = await users();
    const expiresAt = new Date(NOW.getTime() + 60_000);
    await repo.createLoginToken({
      tokenHash: "h",
      userId: sanne.id,
      expiresAt,
    });

    expect(
      await repo.consumeLoginToken("h", new Date(expiresAt.getTime())),
    ).toBeNull();
    // Still unspent, so a moment earlier it works.
    expect(
      (await repo.consumeLoginToken("h", new Date(expiresAt.getTime() - 1)))
        ?.id,
    ).toBe(sanne.id);
  });

  test("an unknown hash is refused", async () => {
    expect(await repo.consumeLoginToken("never-issued", NOW)).toBeNull();
  });
});

describe("trips", () => {
  test("a guest's trip lands pending and undecided", async () => {
    const { sanne } = await users();
    const created = await repo.createTrip(trip({ userId: sanne.id }));
    expect(created.status).toBe("pending");
    expect(created.decidedAt).toBeNull();
    expect(created.decidedBy).toBeNull();
    expect(created.user.name).toBe("Sanne");
  });

  test("an owner's trip lands approved and decided", async () => {
    const { jan } = await users();
    const created = await repo.createTrip(
      trip({ userId: jan.id, status: "approved", decidedBy: jan.id }),
    );
    expect(created.status).toBe("approved");
    expect(created.decidedAt).not.toBeNull();
    expect(created.decidedBy).toBe(jan.id);
  });

  test("approved trips may not overlap — the exclusion constraint", async () => {
    const { jan } = await users();
    await repo.createTrip(
      trip({ userId: jan.id, status: "approved", decidedBy: jan.id }),
    );
    // Overlaps on its first day.
    await expect(
      repo.createTrip(
        trip({
          userId: jan.id,
          start: D(12),
          end: D(14),
          status: "approved",
          decidedBy: jan.id,
        }),
      ),
    ).rejects.toThrow("trips_no_overlap");
  });

  test("pending requests may overlap each other freely", async () => {
    const { sanne, jan } = await users();
    await repo.createTrip(trip({ userId: sanne.id }));
    await repo.createTrip(trip({ userId: jan.id, start: D(11), end: D(13) }));
    expect(await repo.listPendingTrips()).toHaveLength(2);
  });

  test("approving settles it and records who decided", async () => {
    const { sanne, jan } = await users();
    const created = await repo.createTrip(trip({ userId: sanne.id }));

    const result = await repo.approveTrip(created.id, jan.id, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.trip.status).toBe("approved");
    expect(result.trip.decidedBy).toBe(jan.id);
    expect(result.trip.decidedAt).toEqual(NOW);
    expect(await repo.listPendingTrips()).toHaveLength(0);
  });

  test("approving a request whose days were taken meanwhile reports a conflict", async () => {
    const { sanne, jan } = await users();
    const request = await repo.createTrip(trip({ userId: sanne.id }));
    // Jan books over it directly before deciding.
    await repo.createTrip(
      trip({
        userId: jan.id,
        start: D(11),
        end: D(11),
        status: "approved",
        decidedBy: jan.id,
      }),
    );

    const result = await repo.approveTrip(request.id, jan.id, NOW);
    expect(result).toEqual({ ok: false, reason: "conflict" });
    // Still pending, so it can be rejected deliberately rather than vanishing.
    expect(await repo.listPendingTrips()).toHaveLength(1);
  });

  test("a decision cannot be made twice", async () => {
    const { sanne, jan } = await users();
    const created = await repo.createTrip(trip({ userId: sanne.id }));
    expect((await repo.approveTrip(created.id, jan.id, NOW)).ok).toBe(true);

    expect(await repo.approveTrip(created.id, jan.id, NOW)).toEqual({
      ok: false,
      reason: "already-decided",
    });
    expect(await repo.rejectTrip(created.id, jan.id, NOW)).toEqual({
      ok: false,
      reason: "already-decided",
    });
  });

  test("deciding on something that does not exist says so", async () => {
    const { jan } = await users();
    expect(await repo.approveTrip("no-such-id", jan.id, NOW)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  test("a rejected trip leaves no mark on the calendar", async () => {
    const { sanne, jan } = await users();
    const created = await repo.createTrip(trip({ userId: sanne.id }));
    await repo.rejectTrip(created.id, jan.id, NOW);

    expect(await repo.listTripsFrom(D(1))).toHaveLength(0);
    expect(await repo.listPendingTrips()).toHaveLength(0);
    // And the days are free again.
    await repo.createTrip(
      trip({ userId: jan.id, status: "approved", decidedBy: jan.id }),
    );
    expect(await repo.listTripsFrom(D(1))).toHaveLength(1);
  });

  test("the calendar query drops trips that have finished", async () => {
    const { jan } = await users();
    await repo.createTrip(
      trip({
        userId: jan.id,
        start: D(1),
        end: D(3),
        status: "approved",
        decidedBy: jan.id,
      }),
    );
    await repo.createTrip(trip({ userId: jan.id, start: D(20), end: D(22) }));

    expect(await repo.listTripsFrom(D(10))).toHaveLength(1);
    // A trip still running today is not finished.
    expect(await repo.listTripsFrom(D(3))).toHaveLength(2);
  });

  test("the calendar query is ordered by start date", async () => {
    const { jan } = await users();
    await repo.createTrip(trip({ userId: jan.id, start: D(20), end: D(21) }));
    await repo.createTrip(trip({ userId: jan.id, start: D(10), end: D(11) }));
    const found = await repo.listTripsFrom(D(1));
    expect(found.map((t) => t.start)).toEqual([D(10), D(20)]);
  });
});

describe("date conversion", () => {
  test("round-trips through the wire format Postgres uses", () => {
    for (const d of [D(1), D(31), day(2027, 0, 1), day(2028, 1, 29)]) {
      expect(fromDateString(toDateString(d))).toBe(d);
    }
  });

  test("renders as a plain calendar date, with no time and no zone", () => {
    expect(toDateString(D(6))).toBe("2026-08-06");
    expect(toDateString(day(2028, 1, 29))).toBe("2028-02-29");
  });
});

describe("initials", () => {
  test("takes the first letter, upper-cased", () => {
    expect(initialOf("Sanne")).toBe("S");
    expect(initialOf("els")).toBe("E");
    expect(initialOf("  jan ")).toBe("J");
  });

  test("does not crash on an empty name", () => {
    expect(initialOf("")).toBe("?");
    expect(initialOf("   ")).toBe("?");
  });
});
