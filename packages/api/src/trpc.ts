import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { db, queryMetrics } from "@bakery/db";

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

/** Slow-query threshold in milliseconds. Above this we persist a row. */
const SLOW_QUERY_MS = 1500;

/**
 * Skip persistence for the diagnostics router itself — otherwise viewing
 * the diagnostics page would generate metric rows about looking at metrics.
 */
const SELF_REFERENTIAL_PREFIXES = ["diagnostics."];

/**
 * Times every procedure and writes a row to query_metrics for slow or
 * failed calls. Successful fast calls are not persisted (client-side
 * recorder captures those). Always non-blocking — a logging failure
 * must never break the actual procedure response.
 */
const timingMiddleware = t.middleware(async ({ ctx, path, next }) => {
  const start = Date.now();
  let status: "success" | "error" = "success";
  let errorMessage: string | null = null;

  try {
    const result = await next();
    if (!result.ok) {
      status = "error";
      errorMessage = result.error.message ?? null;
    }
    return result;
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const duration = Date.now() - start;
    const shouldPersist =
      (status === "error" || duration >= SLOW_QUERY_MS) &&
      !SELF_REFERENTIAL_PREFIXES.some((p) => path.startsWith(p));

    if (shouldPersist) {
      // Fire-and-forget — never await, never throw.
      void ctx.db
        .insert(queryMetrics)
        .values({
          procedure:    path,
          durationMs:   duration,
          status,
          errorMessage: errorMessage?.slice(0, 1000) ?? null,
          userId:       ctx.user?.id ?? null,
        })
        .catch(() => {
          // Swallow — diagnostics must never break the request.
        });
    }
  }
});

/** Open to anyone — use only for auth-related or truly public endpoints. */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Protected procedure — rejects the call with UNAUTHORIZED if there
 * is no authenticated user in context. Anonymous demo users ARE allowed
 * through here; they can write to their own tenant data freely. Use
 * `nonAnonymousProcedure` instead for anything that triggers a paid
 * third-party API call (AI, Instagram publish, Shopify writes, email send).
 */
export const protectedProcedure = t.procedure.use(timingMiddleware).use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to do that.",
    });
  }
  // Re-expose ctx.user as non-null for downstream resolver inference
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/**
 * Stricter variant of `protectedProcedure` that also rejects anonymous
 * demo users. Use for mutations that:
 *   - call paid third-party APIs (Claude, Resend, Meta Graph, Shopify Admin)
 *   - save third-party API credentials
 *   - send communications on the user's behalf
 *
 * Without this gate an attacker can rotate IPs, mint fresh anonymous
 * Supabase sessions (each with its own free quota), and drain paid-API
 * budget. Anonymous users still get the full demo experience for
 * data-only features via `protectedProcedure`.
 */
export const nonAnonymousProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.isAnonymous) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Create an account to use this feature.",
    });
  }
  return next();
});
