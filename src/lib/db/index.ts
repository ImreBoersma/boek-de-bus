/**
 * The single place the app's data access is bound to an implementation.
 *
 * Everything else imports `db` and sees only the `Repository` interface, so
 * going from the stub to real Postgres is a change to this file and the addition
 * of one more implementation module:
 *
 *   1. Provision Postgres (Neon via the Vercel Marketplace) and apply
 *      `schema.sql`, which includes the `trips_no_overlap` exclusion constraint
 *      the stub imitates in memory.
 *   2. Add `postgres.ts` exporting a `Repository` backed by the driver, keeping
 *      `approveTrip`'s `conflict` result mapped from the constraint violation.
 *   3. Swap the export below.
 *
 * No screen, action, or test needs to change for that.
 */

import "server-only";

import type { Repository } from "./repository";
import { stubRepository } from "./stub";

export const db: Repository = stubRepository;

export type { ApproveResult, RejectResult, Repository } from "./repository";
export * from "./types";
