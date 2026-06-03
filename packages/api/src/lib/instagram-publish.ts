/**
 * Shared publish helper used by both the tRPC instagram router (instant posts,
 * publish-draft-now) and the cron worker (scheduled drafts).
 *
 * Encapsulates: connection lookup, token refresh, two-step Graph API publish
 * (create container → publish), and the historical post-log insert.
 *
 * Returns a result object instead of throwing — callers decide whether to
 * surface a failure as an error (tRPC) or as a retry (cron).
 */

import { eq } from "drizzle-orm";
import {
  db,
  instagramConnections,
  instagramPosts,
  decryptToken,
  encryptToken,
} from "@bakery/db";
import { assertSupabaseImageUrl, assertImageMagicBytes } from "./image-validation";

const GRAPH = "https://graph.facebook.com/v20.0";

/**
 * Meta Graph API accepts the access token either as a URL query parameter
 * or via the `Authorization: Bearer` header. We use the header so the
 * token never appears in:
 *   - server access logs at Meta or intermediate proxies
 *   - browser referrer headers from any redirect chain
 *   - URL-logging telemetry on either end
 */
async function graphGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json() as Record<string, unknown>;
  if (data.error) throw new Error((data.error as { message?: string }).message ?? "Instagram API error");
  return data as T;
}

async function graphPost<T>(path: string, token: string, body: Record<string, string>): Promise<T> {
  const params = new URLSearchParams(body);
  const res = await fetch(`${GRAPH}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: params,
  });
  const data = await res.json() as Record<string, unknown>;
  if (data.error) throw new Error((data.error as { message?: string }).message ?? "Instagram API error");
  return data as T;
}

/**
 * Refresh a long-lived token if it expires within 7 days. Persists the new
 * token (encrypted) back to the connections table when refreshed.
 */
async function refreshTokenIfStale(
  ownerId: string,
  token: string,
  expiresAt: Date | null,
): Promise<string> {
  if (!expiresAt) return token;
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (expiresAt.getTime() - Date.now() > sevenDays) return token;

  const data = await graphGet<{ access_token: string; expires_in: number }>(
    `/refresh_access_token?grant_type=ig_refresh_token`,
    token,
  );
  const newExpires = new Date(Date.now() + data.expires_in * 1000);
  await db
    .update(instagramConnections)
    .set({
      accessToken:    encryptToken(data.access_token),
      tokenExpiresAt: newExpires,
      updatedAt:      new Date(),
    })
    .where(eq(instagramConnections.ownerId, ownerId));
  return data.access_token;
}

export interface PublishResult {
  status:       "posted" | "failed";
  igMediaId:    string | null;
  errorMessage: string | null;
}

export async function publishToInstagram({
  ownerId,
  imageUrl,
  caption,
}: {
  ownerId:  string;
  imageUrl: string;
  caption:  string;
}): Promise<PublishResult> {
  // Validate the image URL before any external API call. Belt and braces:
  // the router already runs assertSupabaseImageUrl on save, but a draft
  // could have been created before that check existed, and the magic-byte
  // sniff catches files that pass the host check but aren't real images.
  try {
    const url = assertSupabaseImageUrl(imageUrl);
    await assertImageMagicBytes(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Image validation failed.";
    return { status: "failed", igMediaId: null, errorMessage: msg };
  }

  const conn = await db.query.instagramConnections.findFirst({
    where: eq(instagramConnections.ownerId, ownerId),
  });
  if (!conn) {
    return { status: "failed", igMediaId: null, errorMessage: "Instagram not connected." };
  }

  let token: string;
  try {
    token = await refreshTokenIfStale(ownerId, decryptToken(conn.accessToken), conn.tokenExpiresAt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token refresh failed.";
    return { status: "failed", igMediaId: null, errorMessage: msg };
  }

  let igMediaId:    string | null = null;
  let errorMessage: string | null = null;
  let status: "posted" | "failed" = "posted";

  try {
    const container = await graphPost<{ id: string }>(
      `/${conn.igUserId}/media`,
      token,
      { image_url: imageUrl, caption },
    );
    const published = await graphPost<{ id: string }>(
      `/${conn.igUserId}/media_publish`,
      token,
      { creation_id: container.id },
    );
    igMediaId = published.id;
  } catch (err) {
    status       = "failed";
    errorMessage = err instanceof Error ? err.message : "Unknown error";
  }

  // Always log to instagram_posts — successful or failed — so the user's
  // recent-posts history shows the attempt.
  await db.insert(instagramPosts).values({
    ownerId,
    igMediaId,
    caption,
    imageUrl,
    status:       status === "posted" ? "posted" : "failed",
    errorMessage,
    postedAt:     status === "posted" ? new Date() : null,
  });

  return { status, igMediaId, errorMessage };
}
