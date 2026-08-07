import Link from "next/link";
import { signOut } from "@/lib/actions/auth";
import type { User } from "@/lib/db/types";

/**
 * Who you are, and the way out. A server component, so signing out is a plain
 * form post to a server action and keeps working without JavaScript.
 *
 * The badge counts the queue rather than merely marking it non-empty, because
 * the number is the thing an owner wants from across the room.
 */
export function AppBar({
  user,
  pendingCount,
}: {
  user: User;
  pendingCount: number;
}) {
  return (
    <header className="app-bar">
      <span className="app-bar-who">
        {user.name}
        {user.role === "owner" && (
          <span className="app-bar-role">eigenaar</span>
        )}
      </span>

      {user.role === "owner" && (
        <Link className="app-bar-link" href="/aanvragen">
          Aanvragen
          {pendingCount > 0 && (
            <span className="app-bar-badge">
              {pendingCount}
              <span className="sr-only">
                {pendingCount === 1
                  ? " aanvraag wacht op een beslissing"
                  : " aanvragen wachten op een beslissing"}
              </span>
            </span>
          )}
        </Link>
      )}

      <form action={signOut}>
        <button type="submit" className="app-bar-link app-bar-signout">
          Uitloggen
        </button>
      </form>
    </header>
  );
}
