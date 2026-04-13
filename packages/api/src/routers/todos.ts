import { z } from "zod";
import { eq, and, asc, desc } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { todos } from "@bakery/db";

const priorityOrder = { high: 0, medium: 1, low: 2 } as const;

export const todosRouter = createTRPCRouter({

  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.todos.findMany({
      where: eq(todos.ownerId, ctx.user.id),
      orderBy: [asc(todos.completed), desc(todos.createdAt)],
    });
    // Sort active items by priority client-side after fetching
    return rows.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const pa = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1;
      const pb = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1;
      return pa - pb;
    });
  }),

  create: protectedProcedure
    .input(z.object({
      title:       z.string().min(1).max(300),
      description: z.string().max(1000).optional(),
      dueDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      priority:    z.enum(["low", "medium", "high"]).default("medium"),
    }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db.insert(todos).values({
        ownerId:     ctx.user.id,
        title:       input.title.trim(),
        description: input.description?.trim() || null,
        dueDate:     input.dueDate || null,
        priority:    input.priority,
      }).returning();
      return row!;
    }),

  update: protectedProcedure
    .input(z.object({
      id:          z.string().uuid(),
      title:       z.string().min(1).max(300).optional(),
      description: z.string().max(1000).optional(),
      dueDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      priority:    z.enum(["low", "medium", "high"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      await ctx.db.update(todos)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(todos.id, id), eq(todos.ownerId, ctx.user.id)));
    }),

  toggle: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.todos.findFirst({
        where: and(eq(todos.id, input.id), eq(todos.ownerId, ctx.user.id)),
        columns: { completed: true },
      });
      if (!row) return;
      await ctx.db.update(todos)
        .set({ completed: !row.completed, updatedAt: new Date() })
        .where(and(eq(todos.id, input.id), eq(todos.ownerId, ctx.user.id)));
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(todos)
        .where(and(eq(todos.id, input.id), eq(todos.ownerId, ctx.user.id)));
    }),
});
