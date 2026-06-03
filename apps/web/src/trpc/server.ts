import "server-only";
import { cache } from "react";
import { createCallerFactory } from "@bakery/api/trpc";
import { appRouter } from "@bakery/api";
import { db } from "@bakery/db";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Context } from "@bakery/api/trpc";

/**
 * Server-side tRPC caller for React Server Components.
 * The context is cached per React render (one Supabase auth call per request).
 *
 * Usage in an RSC:
 *   const recipes = await api.recipes.getAll()
 */
const createCaller = createCallerFactory(appRouter);

const createContext = cache(async (): Promise<Context> => {
  const supabase = await createServerSupabase();
  // We use getUser() here, not getSession(). getUser() verifies the JWT
  // against Supabase before trusting it — getSession() only decodes the
  // cookie and could in principle be tricked by a forged-but-well-formed
  // JWT. The trade-off is one round-trip per RSC render. React's cache()
  // wrapper ensures it's at most one call per request even when multiple
  // nested RSCs use this caller.
  //
  // Per CLAUDE.md the documented pattern is to fetch via client-side
  // React Query (which already goes through the verified API route).
  // The few RSC pages that still call api.* here pay the verification
  // cost. Migrate them to client-side fetching to reclaim the latency.
  const { data: { user } } = await supabase.auth.getUser();
  return {
    db,
    user: user ? { id: user.id, email: user.email ?? null, isAnonymous: user.is_anonymous ?? false } : null,
  };
});

export const api = createCaller(createContext);
