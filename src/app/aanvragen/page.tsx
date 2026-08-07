import type { Metadata } from "next";
import Link from "next/link";
import {
  type PendingView,
  RequestList,
} from "@/components/boek-de-bus/request-list";
import { requireOwner } from "@/lib/auth/dal";
import { dayCountWords, dayOf, rangeWords } from "@/lib/boek-de-bus/schedule";
import { toBookings } from "@/lib/boek-de-bus/trips";
import { db } from "@/lib/db";
import { initialOf } from "@/lib/db/types";

export const metadata: Metadata = {
  title: "Aanvragen — Boek de Bus",
};

/**
 * The owner queue: every request still waiting on Jan or Els.
 *
 * `requireOwner` gates the page, and the approve/reject actions re-check the
 * role themselves — a page guard cannot protect an endpoint that is reachable by
 * direct POST.
 *
 * Two things are worked out here rather than left for the owner to discover by
 * pressing a button: whether a request has been overtaken by an approved trip,
 * and whether its dates have simply passed. Both make approving impossible or
 * pointless, and both are easier to read as a label than as an error.
 */
export default async function RequestsPage() {
  await requireOwner();

  const now = new Date();
  const today = dayOf(now);
  const [pending, upcoming] = await Promise.all([
    db.listPendingTrips(),
    db.listTripsFrom(today),
  ]);

  // `own` is irrelevant here — this view is about other people's requests — so
  // any id will do for the mapping.
  const approved = toBookings(upcoming, "");

  const requests: PendingView[] = pending.map((trip) => ({
    id: trip.id,
    requester: trip.user.name,
    initial: initialOf(trip.user.name),
    period: rangeWords(trip.start, trip.end, today),
    days: dayCountWords(trip.start, trip.end),
    destination: trip.destination,
    note: trip.note,
    past: trip.end < today,
    conflicts: approved.some(
      (booking) => booking.start <= trip.end && trip.start <= booking.end,
    ),
  }));

  return (
    <div className="page page-narrow">
      <header className="app-bar">
        <span className="app-bar-who">Aanvragen</span>
        <Link className="app-bar-link" href="/">
          Naar de kalender
        </Link>
      </header>

      <div className="card queue-card">
        <h1 className="auth-title">
          {requests.length === 0
            ? "Niets te beslissen"
            : requests.length === 1
              ? "1 aanvraag"
              : `${requests.length} aanvragen`}
        </h1>

        {requests.length === 0 ? (
          <p className="auth-lede">
            Zodra iemand de bus aanvraagt, staat het hier — en krijgen jullie
            een mail.
          </p>
        ) : (
          <RequestList requests={requests} />
        )}
      </div>
    </div>
  );
}
