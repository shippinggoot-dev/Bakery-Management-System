import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@bakery/api";
import { db } from "@bakery/db";
import { createServerClient } from "@supabase/ssr";
import type { Context } from "@bakery/api/trpc";

/**
 * Build a Supabase server client from a plain Request object.
 * Cookies are read-only here — the middleware handles refreshing them.
 */
function supabaseFromRequest(req: Request) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookiePairs = cookieHeader.split(";").map((c) => {
    const eq = c.indexOf("=");
    return {
      name: c.slice(0, eq).trim(),
      value: c.slice(eq + 1).trim(),
    };
  });

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookiePairs,
        setAll: () => {}, // read-only in API routes; middleware refreshes cookies
      },
    }
  );
}

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async (): Promise<Context> => {
      const supabase = supabaseFromRequest(req);
      // getUser() validates the JWT against Supabase — never trust getSession() alone
      const { data: { user } } = await supabase.auth.getUser();
      return {
        db,
        user: user ? { id: user.id, email: user.email ?? null } : null,
      };
    },
    onError:
      process.env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(`tRPC error on ${path ?? "<no-path>"}:`, error);
          }
        : undefined,
  });

export { handler as GET, handler as POST };
