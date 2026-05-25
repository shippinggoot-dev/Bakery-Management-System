import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { emailSettings, encryptToken, decryptToken } from "@bakery/db";

/** Mask an API key — show first 6 and last 4 chars only. */
function maskKey(key: string): string {
  if (key.length <= 10) return "••••••••••••";
  return `${key.slice(0, 6)}••••••••••••${key.slice(-4)}`;
}

export const emailSettingsRouter = createTRPCRouter({

  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.query.emailSettings.findFirst({
      where: eq(emailSettings.ownerId, ctx.user.id),
    });
    if (!row) return null;
    return {
      fromName:          row.fromName,
      fromEmail:         row.fromEmail,
      keyPreview:        row.resendApiKey ? maskKey(decryptToken(row.resendApiKey)) : null,
      hasKey:            !!row.resendApiKey,
      sendConfirmations: row.sendConfirmations,
      sendStatusUpdates: row.sendStatusUpdates,
    };
  }),

  upsert: protectedProcedure
    .input(z.object({
      fromName:          z.string().max(80).optional().nullable(),
      fromEmail:         z.string().email("Enter a valid email address").optional().nullable(),
      resendApiKey:      z.string().min(10).optional().nullable(),
      sendConfirmations: z.boolean().optional(),
      sendStatusUpdates: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.emailSettings.findFirst({
        where: eq(emailSettings.ownerId, ctx.user.id),
      });

      const values = {
        fromName:          input.fromName ?? null,
        fromEmail:         input.fromEmail ?? null,
        sendConfirmations: input.sendConfirmations ?? false,
        sendStatusUpdates: input.sendStatusUpdates ?? false,
        updatedAt:         new Date(),
        // Only update the key if a new non-masked value was provided
        ...(input.resendApiKey && !input.resendApiKey.includes("•")
          ? { resendApiKey: encryptToken(input.resendApiKey) }
          : {}),
      };

      if (existing) {
        await ctx.db
          .update(emailSettings)
          .set(values)
          .where(eq(emailSettings.ownerId, ctx.user.id));
      } else {
        await ctx.db.insert(emailSettings).values({
          ...values,
          ownerId: ctx.user.id,
          ...(input.resendApiKey ? { resendApiKey: encryptToken(input.resendApiKey) } : {}),
        });
      }

      return { ok: true };
    }),

  /** Clear the stored Resend API key. */
  removeKey: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(emailSettings)
      .set({ resendApiKey: null, updatedAt: new Date() })
      .where(eq(emailSettings.ownerId, ctx.user.id));
    return { ok: true };
  }),
});
