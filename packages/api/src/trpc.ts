import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { db } from "@bakery/db";

/** Minimal user shape passed through tRPC context. */
export type TRPCUser = { id: string; email: string | null; isAnonymous: boolean };

export type Context = {
  db: typeof db;
  user: TRPCUser | null;
};

/**
 * Default context factory — always produces no user.
 * Real context (with user) is created per-request in the route handler
 * and the server-side RSC caller. This exists only as a type anchor.
 */
export const createTRPCContext = async (): Promise<Context> => {
  return { db, user: null };
};

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

/** Open to anyone — use only for auth-related or truly public endpoints. */
export const publicProcedure = t.procedure;

/**
 * Protected procedure — rejects the call with UNAUTHORIZED if there
 * is no authenticated user in context. All data-access procedures use this.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to do that.",
    });
  }
  // Re-expose ctx.user as non-null for downstream resolver inference
  return next({ ctx: { ...ctx, user: ctx.user } });
});
