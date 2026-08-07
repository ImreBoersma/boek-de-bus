import { describe, expect, test } from "bun:test";
import type { TripWithUser } from "@/lib/db/types";
import { day } from "./schedule";
import { toBookings, toPending, toSchedule } from "./trips";

const D = (date: number) => day(2026, 7, date);

let counter = 0;
function trip(over: Partial<TripWithUser> = {}): TripWithUser {
  counter += 1;
  return {
    id: `trip-${counter}`,
    userId: "sanne",
    start: D(10),
    end: D(12),
    destination: "",
    note: "",
    status: "pending",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    decidedAt: null,
    decidedBy: null,
    user: { id: "sanne", name: "Sanne", email: "sanne@example.com" },
    ...over,
  };
}

describe("mapping stored trips onto the calendar", () => {
  test("only approved trips block days", () => {
    const trips = [
      trip({ status: "approved" }),
      trip({ status: "pending" }),
      trip({ status: "rejected" }),
    ];
    expect(toBookings(trips, "sanne")).toHaveLength(1);
  });

  test("only pending trips draw the request ring", () => {
    const trips = [
      trip({ status: "approved" }),
      trip({ status: "pending" }),
      trip({ status: "rejected" }),
    ];
    expect(toPending(trips, "sanne")).toHaveLength(1);
  });

  test("a rejected trip appears nowhere", () => {
    const schedule = toSchedule([trip({ status: "rejected" })], "sanne");
    expect(schedule.bookings).toHaveLength(0);
    expect(schedule.pending).toHaveLength(0);
  });

  test("the badge is the requester's initial, not the viewer's", () => {
    const trips = [
      trip({
        status: "approved",
        userId: "els",
        user: { id: "els", name: "Els", email: "els@example.com" },
      }),
    ];
    expect(toBookings(trips, "sanne")[0]?.chip).toBe("E");
  });

  test("the same stored trip is 'own' for its requester and not for anyone else", () => {
    const trips = [trip({ status: "approved", userId: "sanne" })];
    expect(toBookings(trips, "sanne")[0]?.own).toBe(true);
    expect(toBookings(trips, "els")[0]?.own).toBe(false);
  });

  test("ownership is tracked on pending requests too", () => {
    const trips = [trip({ status: "pending", userId: "sanne" })];
    expect(toPending(trips, "sanne")[0]?.own).toBe(true);
    expect(toPending(trips, "els")[0]?.own).toBe(false);
  });

  test("dates come through untouched", () => {
    const trips = [trip({ status: "approved", start: D(4), end: D(9) })];
    expect(toBookings(trips, "sanne")[0]).toMatchObject({
      start: D(4),
      end: D(9),
    });
  });

  test("an empty list is an empty schedule", () => {
    expect(toSchedule([], "sanne")).toEqual({ bookings: [], pending: [] });
  });
});
