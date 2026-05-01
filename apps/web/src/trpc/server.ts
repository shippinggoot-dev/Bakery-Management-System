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
  // getSession() reads from the cookie — no Supabase network round-trip.
  // getUser() validates the JWT remotely and adds 200-500 ms per request.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  return {
    db,
    user: user ? { id: user.id, email: user.email ?? null, isAnonymous: user.is_anonymous ?? false } : null,
  };
});

export const api = createCaller(createContext);
