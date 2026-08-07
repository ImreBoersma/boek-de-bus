import { AppBar } from "@/components/boek-de-bus/app-bar";
import { PlanATrip } from "@/components/boek-de-bus/plan-a-trip";
import { requireUser } from "@/lib/auth/dal";
import { dayOf } from "@/lib/boek-de-bus/schedule";
import { toSchedule } from "@/lib/boek-de-bus/trips";
import { db } from "@/lib/db";

/**
 * The calendar, in the framed-phone presentation the design uses.
 *
 * Server-rendered per person: the schedule is read here, and which trips read as
 * "yours" depends on who is asking. `requireUser` both authenticates and supplies
 * that identity, so there is no path through this page that renders someone
 * else's view of the calendar.
 */
export default async function Page() {
  const user = await requireUser();
  const today = dayOf(new Date());
  const trips = await db.listTripsFrom(today);

  const pendingCount =
    user.role === "owner"
      ? trips.filter((trip) => trip.status === "pending").length
      : 0;

  return (
    <div className="page">
      <AppBar user={user} pendingCount={pendingCount} />

      <PlanATrip
        schedule={toSchedule(trips, user.id)}
        today={today}
        isOwner={user.role === "owner"}
      />

      <p className="page-note">
        Tik een eerste en laatste dag (geboekte en voorbije dagen kunnen niet).
        Aangevraagde dagen mogen overlappen — Jan of Els hakt de knoop door.
      </p>
    </div>
  );
}
