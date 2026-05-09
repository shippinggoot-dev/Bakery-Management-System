/**
 * Centralised permission checks.
 *
 * Today every authenticated workspace member can do everything — there is no
 * employee/manager distinction yet. The functions here are intentionally
 * trivial. They exist so that when role-based access is introduced
 * (workspace_members table with `role`), there's exactly one place to wire
 * the role check rather than scattering `if user.role === ...` across the
 * codebase.
 *
 * Convention: each function takes the tRPC ctx.user object and returns
 * boolean. Callers `if (!canX(ctx.user)) throw new TRPCError(...)`.
 */

import type { TRPCUser } from "../trpc";

type CtxUser = TRPCUser | null | undefined;

/** Anyone signed in (and not anonymous) counts as a workspace member today. */
function isMember(user: CtxUser): boolean {
  if (!user) return false;
  if (user.isAnonymous) return false;
  return true;
}

/**
 * Can this user unlock a recorded production batch for editing?
 *
 * Today: any non-anonymous workspace member. Future: managers only — change
 * the body to `return user.role === "manager"` and every callsite is gated.
 */
export function canUnlockRecordedBatch(user: CtxUser): boolean {
  return isMember(user);
}

/**
 * Can this user override / re-record a production batch that was already
 * recorded? Same future intent as unlock — managers only when roles land.
 */
export function canOverrideRecordedBatch(user: CtxUser): boolean {
  return isMember(user);
}
