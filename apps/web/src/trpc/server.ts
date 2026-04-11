import "server-only";
import { cache } from "react";
import { createCallerFactory, createTRPCContext } from "@bakery/api/trpc";
import { appRouter } from "@bakery/api";

/**
 * Server-side tRPC caller for React Server Components.
 *
 * Usage in an RSC:
 *   const recipes = await api.recipes.getAll()
 */
const createCaller = createCallerFactory(appRouter);

export const api = createCaller(cache(createTRPCContext));
