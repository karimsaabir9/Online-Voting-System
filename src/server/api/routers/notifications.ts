import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { notifications } from "@/server/db/schema";

export const notificationsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.notifications.findMany({
      where: eq(notifications.userId, ctx.session.user.id),
      orderBy: (fields, { desc }) => [desc(fields.createdAt)],
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        message: row.message,
        isRead: row.isRead,
        createdAt: row.createdAt,
        electionId: (row.metadata as { electionId?: string } | null)?.electionId ?? null,
      })),
      unreadCount: rows.filter((row) => !row.isRead).length,
    };
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(eq(notifications.id, input.id), eq(notifications.userId, ctx.session.user.id))
        )
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found" });
      }

      return updated;
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(eq(notifications.userId, ctx.session.user.id), eq(notifications.isRead, false))
      );

    return { success: true };
  }),
});
