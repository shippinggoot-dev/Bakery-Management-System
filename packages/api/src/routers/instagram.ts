import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { instagramConnections, instagramPosts, encryptToken, decryptToken } from "@bakery/db";

const GRAPH = "https://graph.facebook.com/v20.0";

async function graphGet<T>(path: string, token: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH}${path}${sep}access_token=${token}`);
  const data = await res.json() as Record<string, unknown>;
  if (data.error) throw new Error((data.error as { message?: string }).message ?? "Instagram API error");
  return data as T;
}

async function graphPost<T>(path: string, token: string, body: Record<string, string>): Promise<T> {
  const params = new URLSearchParams({ ...body, access_token: token });
  const res = await fetch(`${GRAPH}${path}`, { method: "POST", body: params });
  const data = await res.json() as Record<string, unknown>;
  if (data.error) throw new Error((data.error as { message?: string }).message ?? "Instagram API error");
  return data as T;
}

/** Refresh a long-lived token if it expires within 7 days. Returns the (possibly new) token. */
async function maybeRefreshToken(
  token: string,
  expiresAt: Date | null,
): Promise<{ token: string; expiresAt: Date | null; refreshed: boolean }> {
  if (!expiresAt) return { token, expiresAt, refreshed: false };
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (expiresAt.getTime() - Date.now() > sevenDays) return { token, expiresAt, refreshed: false };

  const data = await graphGet<{ access_token: string; expires_in: number }>(
    `/refresh_access_token?grant_type=ig_refresh_token`,
    token,
  );
  const newExpires = new Date(Date.now() + data.expires_in * 1000);
  return { token: data.access_token, expiresAt: newExpires, refreshed: true };
}

export const instagramRouter = createTRPCRouter({

  getConnection: protectedProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.query.instagramConnections.findFirst({
      where: eq(instagramConnections.ownerId, ctx.user.id),
    });
    if (!row) return { connected: false as const };
    return {
      connected:   true as const,
      igUserId:    row.igUserId,
      igUsername:  row.igUsername,
      pageName:    row.pageName,
      expiresAt:   row.tokenExpiresAt,
    };
  }),

  /** Called by the OAuth callback API route after token exchange. */
  saveConnection: protectedProcedure
    .input(z.object({
      igUserId:       z.string(),
      igUsername:     z.string().nullable(),
      pageId:         z.string().nullable(),
      pageName:       z.string().nullable(),
      accessToken:    z.string(),
      tokenExpiresAt: z.date().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const encryptedAccessToken = encryptToken(input.accessToken);
      await ctx.db
        .insert(instagramConnections)
        .values({
          ownerId:        ctx.user.id,
          igUserId:       input.igUserId,
          igUsername:     input.igUsername,
          pageId:         input.pageId,
          pageName:       input.pageName,
          accessToken:    encryptedAccessToken,
          tokenExpiresAt: input.tokenExpiresAt,
        })
        .onConflictDoUpdate({
          target: instagramConnections.ownerId,
          set: {
            igUserId:       input.igUserId,
            igUsername:     input.igUsername,
            pageId:         input.pageId,
            pageName:       input.pageName,
            accessToken:    encryptedAccessToken,
            tokenExpiresAt: input.tokenExpiresAt,
            updatedAt:      new Date(),
          },
        });
    }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .delete(instagramConnections)
      .where(eq(instagramConnections.ownerId, ctx.user.id));
  }),

  createPost: protectedProcedure
    .input(z.object({
      imageUrl: z.string().url(),
      caption:  z.string().max(2200),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await ctx.db.query.instagramConnections.findFirst({
        where: eq(instagramConnections.ownerId, ctx.user.id),
      });
      if (!conn) throw new TRPCError({ code: "BAD_REQUEST", message: "Instagram not connected." });

      // Refresh token if close to expiry. The DB stores the token encrypted;
      // maybeRefreshToken needs the plaintext to call Meta's refresh API.
      const { token, expiresAt, refreshed } = await maybeRefreshToken(
        decryptToken(conn.accessToken),
        conn.tokenExpiresAt,
      );
      if (refreshed) {
        await ctx.db
          .update(instagramConnections)
          .set({ accessToken: encryptToken(token), tokenExpiresAt: expiresAt, updatedAt: new Date() })
          .where(eq(instagramConnections.ownerId, ctx.user.id));
      }

      let igMediaId: string | null = null;
      let errorMessage: string | null = null;
      let status = "posted";

      try {
        // Step 1: create media container
        const container = await graphPost<{ id: string }>(
          `/${conn.igUserId}/media`,
          token,
          { image_url: input.imageUrl, caption: input.caption },
        );

        // Step 2: publish it
        const published = await graphPost<{ id: string }>(
          `/${conn.igUserId}/media_publish`,
          token,
          { creation_id: container.id },
        );
        igMediaId = published.id;
      } catch (err) {
        status = "failed";
        errorMessage = err instanceof Error ? err.message : "Unknown error";
      }

      await ctx.db.insert(instagramPosts).values({
        ownerId:      ctx.user.id,
        igMediaId,
        caption:      input.caption,
        imageUrl:     input.imageUrl,
        status,
        errorMessage,
        postedAt:     status === "posted" ? new Date() : null,
      });

      if (status === "failed") {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: errorMessage ?? "Post failed." });
      }

      return { igMediaId };
    }),

  getPosts: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.instagramPosts.findMany({
      where: eq(instagramPosts.ownerId, ctx.user.id),
      orderBy: [desc(instagramPosts.createdAt)],
      limit: 20,
    });
  }),
});
