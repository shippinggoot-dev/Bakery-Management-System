import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { db } from "@bakery/db";
import { instagramConnections } from "@bakery/db";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v20.0";
const APP_ID     = process.env.META_APP_ID!;
const APP_SECRET = process.env.META_APP_SECRET!;

function redirectWithError(origin: string, msg: string) {
  return NextResponse.redirect(`${origin}/settings?instagram_error=${encodeURIComponent(msg)}`);
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code  = searchParams.get("code");
  const error = searchParams.get("error_description");

  if (error || !code) {
    return redirectWithError(origin, error ?? "Instagram authorisation cancelled.");
  }

  // Verify the user is logged in
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const redirectUri = `${origin}/api/instagram/callback`;

  try {
    // 1. Exchange code → short-lived token
    const tokenRes = await fetch(
      `${GRAPH}/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`,
      { method: "GET" },
    );
    const tokenData = await tokenRes.json() as { access_token?: string; error?: { message: string } };
    if (!tokenData.access_token) {
      throw new Error(tokenData.error?.message ?? "Token exchange failed.");
    }
    const shortToken = tokenData.access_token;

    // 2. Exchange → long-lived token (60-day)
    const llRes = await fetch(
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${shortToken}`,
    );
    const llData = await llRes.json() as { access_token?: string; expires_in?: number; error?: { message: string } };
    if (!llData.access_token) {
      throw new Error(llData.error?.message ?? "Long-lived token exchange failed.");
    }
    const longToken  = llData.access_token;
    const expiresAt  = llData.expires_in
      ? new Date(Date.now() + llData.expires_in * 1000)
      : null;

    // 3. Get the user's Facebook Pages
    const pagesRes = await fetch(`${GRAPH}/me/accounts?access_token=${longToken}`);
    const pagesData = await pagesRes.json() as {
      data?: { id: string; name: string; access_token: string }[];
      error?: { message: string };
    };
    if (pagesData.error) throw new Error(pagesData.error.message);
    const pages = pagesData.data ?? [];
    if (pages.length === 0) {
      throw new Error("No Facebook Pages found. Make sure your Instagram account is linked to a Facebook Page.");
    }
    const page = pages[0]!;

    // 4. Get the Instagram Business Account for that page
    const igRes = await fetch(
      `${GRAPH}/${page.id}?fields=instagram_business_account,name&access_token=${page.access_token}`,
    );
    const igData = await igRes.json() as {
      instagram_business_account?: { id: string };
      error?: { message: string };
    };
    if (igData.error) throw new Error(igData.error.message);
    if (!igData.instagram_business_account) {
      throw new Error("No Instagram Business Account found on your Facebook Page. Make sure your Instagram account is set to Business or Creator.");
    }
    const igUserId = igData.instagram_business_account.id;

    // 5. Fetch the IG username
    const userRes = await fetch(`${GRAPH}/${igUserId}?fields=username&access_token=${longToken}`);
    const userData = await userRes.json() as { username?: string; error?: { message: string } };
    const igUsername = userData.username ?? null;

    // 6. Upsert connection in DB
    await db
      .insert(instagramConnections)
      .values({
        ownerId:        user.id,
        igUserId,
        igUsername,
        pageId:         page.id,
        pageName:       page.name,
        accessToken:    longToken,
        tokenExpiresAt: expiresAt,
      })
      .onConflictDoUpdate({
        target: instagramConnections.ownerId,
        set: {
          igUserId,
          igUsername,
          pageId:         page.id,
          pageName:       page.name,
          accessToken:    longToken,
          tokenExpiresAt: expiresAt,
          updatedAt:      new Date(),
        },
      });

    return NextResponse.redirect(`${origin}/settings?instagram=connected`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed.";
    return redirectWithError(origin, msg);
  }
}
