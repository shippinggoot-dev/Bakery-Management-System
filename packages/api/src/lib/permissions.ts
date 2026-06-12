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

/**
 * Super admin — operator(s) of the platform itself, distinct from workspace
 * members. Has cross-tenant access to triage feedback, etc. The allow-list
 * comes from the SUPER_ADMIN_EMAILS env var (comma-separated). Keep in sync
 * with the matching RLS policy in 2026-06-12_feedback.sql.
 */
export function isSuperAdmin(user: CtxUser): boolean {
  if (!user || !user.email || user.isAnonymous) return false;
  const allowlist = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(user.email.toLowerCase());
}
