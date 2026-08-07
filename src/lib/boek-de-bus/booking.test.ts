import { beforeEach, describe, expect, test } from "bun:test";
import { resetStubStore, stubRepository } from "@/lib/db/stub";
import type { User } from "@/lib/db/types";
import type { BookingDeps, Notifier } from "./booking";
import {
  ALREADY_DECIDED,
  BAD_PERIOD,
  decideOnTrip,
  GONE,
  NOT_AN_OWNER,
  NOW_BOOKED,
  OUT_OF_WINDOW,
  placeTrip,
  TAKEN,
} from "./booking";
import { DAY_MS, day, lastBookableDay } from "./schedule";
import { MAX_DESTINATION, MAX_NOTE } from "./trips";

/**
 * The booking rules, against the real stub repository and a notifier that
 * records. These are the tests that cover what the server actions do; the
 * actions themselves only add session lookup and a router refresh.
 */

const NOW = new Date("2026-08-06T09:30:00.000Z");
const TODAY = day(2026, 7, 6);
const D = (date: number) => day(2026, 7, date);

type Recorded = {
  requests: Parameters<Notifier["requestFiled"]>[0][];
  decisions: Parameters<Notifier["decision"]>[0][];
};

let sent: Recorded;
let deps: BookingDeps;

function recorder(): Notifier {
  return {
    async requestFiled(params) {
      sent.requests.push(params);
    },
    async decision(params) {
      sent.decisions.push(params);
    },
  };
}

beforeEach(() => {
  resetStubStore();
  process.env.OWNER_EMAILS = "jan@example.com,els@example.com";
  process.env.GUEST_EMAILS = "sanne@example.com,tom@example.com";
  sent = { requests: [], decisions: [] };
  deps = { repo: stubRepository, notify: recorder(), now: NOW };
});

async function who(email: string): Promise<User> {
  const user = await stubRepository.findUserByEmail(email);
  if (!user) throw new Error(`no seed user ${email}`);
  return user;
}

const input = (over: Partial<Parameters<typeof placeTrip>[1]> = {}) => ({
  start: D(10),
  end: D(12),
  destination: "",
  note: "",
  ...over,
});

describe("placing a trip", () => {
  test("an owner's booking is settled on the spot, and tells nobody", async () => {
    const jan = await who("jan@example.com");
    const result = await placeTrip(jan, input(), deps);

    expect(result).toEqual({
      ok: true,
      words: "ma 10 t/m wo 12 augustus",
      approved: true,
    });
    const stored = await stubRepository.listTripsFrom(TODAY);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.status).toBe("approved");
    expect(stored[0]?.decidedBy).toBe(jan.id);
    expect(sent.requests).toHaveLength(0);
  });

  test("a guest's booking becomes a request, and both owners are told", async () => {
    const sanne = await who("sanne@example.com");
    const result = await placeTrip(
      sanne,
      input({ destination: "Texel", note: "met de hond" }),
      deps,
    );

    expect(result).toEqual({
      ok: true,
      words: "ma 10 t/m wo 12 augustus",
      approved: false,
    });
    expect((await stubRepository.listPendingTrips())[0]?.status).toBe(
      "pending",
    );

    expect(sent.requests).toHaveLength(1);
    expect(sent.requests[0]).toMatchObject({
      owners: ["jan@example.com", "els@example.com"],
      requesterName: "Sanne",
      start: D(10),
      end: D(12),
      destination: "Texel",
      note: "met de hond",
    });
  });

  test("a single-day trip is allowed", async () => {
    const jan = await who("jan@example.com");
    const result = await placeTrip(
      jan,
      input({ start: D(10), end: D(10) }),
      deps,
    );
    expect(result).toMatchObject({ ok: true, words: "ma 10 augustus" });
  });

  test("today is bookable", async () => {
    const jan = await who("jan@example.com");
    expect(
      await placeTrip(jan, input({ start: TODAY, end: TODAY }), deps),
    ).toMatchObject({ ok: true });
  });

  test("days already booked are refused", async () => {
    const jan = await who("jan@example.com");
    const sanne = await who("sanne@example.com");
    await placeTrip(jan, input({ start: D(10), end: D(12) }), deps);

    // Overlaps on the last day.
    expect(
      await placeTrip(sanne, input({ start: D(12), end: D(14) }), deps),
    ).toEqual({ ok: false, error: TAKEN });
    // Nothing was filed, and no owner was bothered about it.
    expect(await stubRepository.listPendingTrips()).toHaveLength(0);
    expect(sent.requests).toHaveLength(0);
  });

  test("pending requests do not block each other", async () => {
    const sanne = await who("sanne@example.com");
    const tom = await who("tom@example.com");
    expect(await placeTrip(sanne, input(), deps)).toMatchObject({ ok: true });
    expect(
      await placeTrip(tom, input({ start: D(11), end: D(13) }), deps),
    ).toMatchObject({ ok: true });
    expect(await stubRepository.listPendingTrips()).toHaveLength(2);
  });

  test("the past is refused", async () => {
    const jan = await who("jan@example.com");
    expect(
      await placeTrip(jan, input({ start: TODAY - DAY_MS, end: TODAY }), deps),
    ).toEqual({ ok: false, error: OUT_OF_WINDOW });
  });

  test("beyond the rolling horizon is refused, at the boundary", async () => {
    const jan = await who("jan@example.com");
    const last = lastBookableDay(TODAY);
    expect(
      await placeTrip(jan, input({ start: last, end: last }), deps),
    ).toMatchObject({ ok: true });
    expect(
      await placeTrip(
        jan,
        input({ start: last + DAY_MS, end: last + DAY_MS }),
        deps,
      ),
    ).toEqual({ ok: false, error: OUT_OF_WINDOW });
  });

  test("an inverted period is refused", async () => {
    const jan = await who("jan@example.com");
    expect(
      await placeTrip(jan, input({ start: D(12), end: D(10) }), deps),
    ).toEqual({ ok: false, error: BAD_PERIOD });
  });

  test("a value that is not a real day is refused", async () => {
    const jan = await who("jan@example.com");
    // Every case here is something only a hand-made request could send.
    for (const bad of [
      { start: D(10) + 1, end: D(12) },
      { start: D(10) + 60_000, end: D(12) },
      { start: 1.5, end: D(12) },
      { start: Number.NaN, end: D(12) },
      { start: Number.POSITIVE_INFINITY, end: D(12) },
      { start: "2026-08-10" as unknown as number, end: D(12) },
      { start: null as unknown as number, end: D(12) },
      { start: undefined as unknown as number, end: D(12) },
      { start: D(10), end: {} as unknown as number },
    ]) {
      expect(await placeTrip(jan, input(bad), deps)).toEqual({
        ok: false,
        error: BAD_PERIOD,
      });
    }
    expect(await stubRepository.listTripsFrom(0)).toHaveLength(0);
  });

  test("free text is trimmed, capped, and never rejected for length", async () => {
    const sanne = await who("sanne@example.com");
    await placeTrip(
      sanne,
      input({
        destination: `  ${"T".repeat(MAX_DESTINATION + 50)}  `,
        note: `  ${"n".repeat(MAX_NOTE + 50)}  `,
      }),
      deps,
    );
    const stored = (await stubRepository.listPendingTrips())[0];
    expect(stored?.destination).toHaveLength(MAX_DESTINATION);
    expect(stored?.note).toHaveLength(MAX_NOTE);
  });

  test("non-string free text becomes empty rather than 'undefined'", async () => {
    const sanne = await who("sanne@example.com");
    await placeTrip(
      sanne,
      input({
        destination: undefined as unknown as string,
        note: 42 as unknown as string,
      }),
      deps,
    );
    const stored = (await stubRepository.listPendingTrips())[0];
    expect(stored?.destination).toBe("");
    expect(stored?.note).toBe("");
  });

  test("a booking lost to a race between the check and the write is refused", async () => {
    const jan = await who("jan@example.com");
    // A repository that reports the days free, then refuses the write — exactly
    // what the exclusion constraint does under concurrency.
    const racing = {
      ...stubRepository,
      async listTripsFrom() {
        return [];
      },
      async createTrip() {
        throw new Error("trips_no_overlap");
      },
    };
    expect(await placeTrip(jan, input(), { ...deps, repo: racing })).toEqual({
      ok: false,
      error: TAKEN,
    });
  });
});

describe("deciding on a request", () => {
  async function pendingRequest() {
    const sanne = await who("sanne@example.com");
    await placeTrip(sanne, input({ destination: "Texel" }), deps);
    const [request] = await stubRepository.listPendingTrips();
    if (!request) throw new Error("no request");
    return request;
  }

  test("a guest may not decide, even on their own request", async () => {
    const request = await pendingRequest();
    const sanne = await who("sanne@example.com");
    expect(await decideOnTrip(sanne, request.id, true, deps)).toEqual({
      ok: false,
      error: NOT_AN_OWNER,
    });
    // Untouched.
    expect(await stubRepository.listPendingTrips()).toHaveLength(1);
    expect(sent.decisions).toHaveLength(0);
  });

  test("approving books the days and tells the requester who decided", async () => {
    const request = await pendingRequest();
    const els = await who("els@example.com");

    expect(await decideOnTrip(els, request.id, true, deps)).toEqual({
      ok: true,
    });

    const stored = await stubRepository.findTripById(request.id);
    expect(stored?.status).toBe("approved");
    expect(stored?.decidedBy).toBe(els.id);
    expect(stored?.decidedAt).toEqual(NOW);

    expect(sent.decisions).toHaveLength(1);
    expect(sent.decisions[0]).toMatchObject({
      to: "sanne@example.com",
      name: "Sanne",
      approved: true,
      deciderName: "Els",
      start: D(10),
      end: D(12),
    });
  });

  test("approving locks the days against everyone else", async () => {
    const request = await pendingRequest();
    const jan = await who("jan@example.com");
    await decideOnTrip(jan, request.id, true, deps);

    const tom = await who("tom@example.com");
    expect(
      await placeTrip(tom, input({ start: D(11), end: D(11) }), deps),
    ).toEqual({ ok: false, error: TAKEN });
  });

  test("rejecting frees the days and says so", async () => {
    const request = await pendingRequest();
    const jan = await who("jan@example.com");

    expect(await decideOnTrip(jan, request.id, false, deps)).toEqual({
      ok: true,
    });
    expect(sent.decisions[0]).toMatchObject({
      approved: false,
      deciderName: "Jan",
    });

    // The days are available again.
    const tom = await who("tom@example.com");
    expect(await placeTrip(tom, input(), deps)).toMatchObject({ ok: true });
  });

  test("a decision cannot be made twice", async () => {
    const request = await pendingRequest();
    const jan = await who("jan@example.com");
    await decideOnTrip(jan, request.id, true, deps);

    expect(await decideOnTrip(jan, request.id, true, deps)).toEqual({
      ok: false,
      error: ALREADY_DECIDED,
    });
    // And the requester is not told a second time.
    expect(sent.decisions).toHaveLength(1);
  });

  test("approving days that were taken in the meantime reports it", async () => {
    const request = await pendingRequest();
    const jan = await who("jan@example.com");
    // Jan books over the requested days directly.
    await placeTrip(jan, input({ start: D(11), end: D(11) }), deps);

    expect(await decideOnTrip(jan, request.id, true, deps)).toEqual({
      ok: false,
      error: NOW_BOOKED,
    });
    // Still pending, so it can be rejected deliberately.
    expect(await stubRepository.listPendingTrips()).toHaveLength(1);
    expect(sent.decisions).toHaveLength(0);
  });

  test("a request that is gone reports it, and an empty id is not a lookup", async () => {
    const jan = await who("jan@example.com");
    for (const id of ["", "no-such-trip"]) {
      expect(await decideOnTrip(jan, id, true, deps)).toEqual({
        ok: false,
        error: GONE,
      });
    }
  });
});
