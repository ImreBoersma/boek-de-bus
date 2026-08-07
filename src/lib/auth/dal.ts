/**
 * The data access layer's front door: who is asking, and may they.
 *
 * Every server component and server action goes through one of these rather
 * than reading the cookie itself. `proxy.ts` also redirects unauthenticated
 * traffic, but that is a courtesy for the address bar, not a control —
 * server actions are reachable by direct POST, so the check that counts is the
 * one here, next to the data.
 *
 * `cache` memoises per render pass, so a page that needs the user in three
 * places still does one lookup.
 */

import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import type { User } from "@/lib/db/types";
import { readSession } from "./session";

/**
 * The signed-in user, or `null`. Returns `null` for a validly-signed session
 * whose user no longer exists, so revoking access is a matter of deleting the
 * row — no need to rotate the signing secret.
 */
export const currentUser = cache(async (): Promise<User | null> => {
  const session = await readSession();
  if (!session) return null;
  return db.findUserById(session.sub);
});

/** For pages: send anonymous visitors to sign in. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** For the owner-only screen. Guests are bounced to the calendar, not to login. */
export async function requireOwner(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/");
  return user;
}

/**
 * For server actions, where redirecting mid-mutation is the wrong shape: the
 * caller wants to render an error next to the form. Returns `null` instead.
 */
export async function actingUser(): Promise<User | null> {
  return currentUser();
}
