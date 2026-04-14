import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Build a Supabase client that can read/write cookies on this response
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write cookies onto the request so subsequent middleware sees them
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Recreate response so the refreshed cookies are on the reply
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Validate existing session (server-side JWT check).
  // If there is no session, create an anonymous one so the visitor can use
  // the site in demo mode — their data is isolated by owner_id and cleaned
  // up automatically after 7 days.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    await supabase.auth.signInAnonymously();
  }

  // Consent gate — real (non-anonymous) users must accept terms before
  // accessing the app. Skip the check on the consent, login, and auth pages.
  const { pathname } = request.nextUrl;
  const isExempt = pathname === "/consent" ||
    pathname === "/login" ||
    pathname.startsWith("/auth");

  if (!isExempt && user && !user.is_anonymous) {
    const consented = user.user_metadata?.consent_accepted === true;
    if (!consented) {
      const url = request.nextUrl.clone();
      url.pathname = "/consent";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on every route EXCEPT:
     *   - _next/static  (static files)
     *   - _next/image   (Next.js image optimisation)
     *   - favicon.ico
     *   - Any file with an extension (png, svg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
