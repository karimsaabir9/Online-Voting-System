import { z } from "zod";
import { eq, and, or, ilike, count, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, adminProcedure } from "@/server/api/trpc";
import { user, votes } from "@/server/db/schema";
import type { db as dbType } from "@/server/db";
import { getPostgresErrorCode, POSTGRES_ERROR_CODES } from "@/lib/db-errors";

type Database = typeof dbType;

async function assertNotLastActiveAdmin(db: Database, excludeUserId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(user)
    .where(and(eq(user.role, "admin"), eq(user.status, "active"), ne(user.id, excludeUserId)));

  if (row.value === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot remove the last active admin",
    });
  }
}

export const usersRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(10),
        search: z.string().trim().min(1).optional(),
        role: z.enum(["all", "admin", "voter"]).default("all"),
        status: z.enum(["all", "active", "suspended"]).default("all"),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.pageSize;

      const conditions = [];
      if (input.search) {
        conditions.push(
          or(
            ilike(user.name, `%${input.search}%`),
            ilike(user.email, `%${input.search}%`)
          )!
        );
      }
      if (input.role !== "all") {
        conditions.push(eq(user.role, input.role));
      }
      if (input.status !== "all") {
        conditions.push(eq(user.status, input.status));
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, totalRow] = await Promise.all([
        ctx.db.query.user.findMany({
          where: whereClause,
          orderBy: (fields, { desc }) => [desc(fields.createdAt)],
          limit: input.pageSize,
          offset,
          columns: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            createdAt: true,
          },
        }),
        ctx.db.select({ total: count() }).from(user).where(whereClause),
      ]);

      return {
        items,
        total: totalRow[0].total,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  getById: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const targetUser = await ctx.db.query.user.findFirst({
        where: eq(user.id, input.id),
        columns: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
        },
      });

      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const votingHistory = await ctx.db.query.votes.findMany({
        where: eq(votes.userId, input.id),
        orderBy: (fields, { desc }) => [desc(fields.votedAt)],
        columns: { votedAt: true },
        with: { election: { columns: { id: true, title: true } } },
      });

      return {
        user: targetUser,
        votingHistory: votingHistory.map((vote) => ({
          electionId: vote.election.id,
          electionTitle: vote.election.title,
          votedAt: vote.votedAt,
        })),
      };
    }),

  suspend: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot suspend your own account",
        });
      }

      const target = await ctx.db.query.user.findFirst({ where: eq(user.id, input.id) });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (target.role === "admin") {
        await assertNotLastActiveAdmin(ctx.db, input.id);
      }

      const [updated] = await ctx.db
        .update(user)
        .set({ status: "suspended" })
        .where(eq(user.id, input.id))
        .returning();

      return updated;
    }),

  activate: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(user)
        .set({ status: "active" })
        .where(eq(user.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      return updated;
    }),

  setRole: adminProcedure
    .input(z.object({ id: z.uuid(), role: z.enum(["admin", "voter"]) }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot change your own role",
        });
      }

      const target = await ctx.db.query.user.findFirst({ where: eq(user.id, input.id) });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (target.role === "admin" && input.role === "voter") {
        await assertNotLastActiveAdmin(ctx.db, input.id);
      }

      const [updated] = await ctx.db
        .update(user)
        .set({ role: input.role })
        .where(eq(user.id, input.id))
        .returning();

      return updated;
    }),

  remove: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot delete your own account",
        });
      }

      const target = await ctx.db.query.user.findFirst({ where: eq(user.id, input.id) });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (target.role === "admin") {
        await assertNotLastActiveAdmin(ctx.db, input.id);
      }

      try {
        const [deleted] = await ctx.db.delete(user).where(eq(user.id, input.id)).returning();

        if (!deleted) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }

        return deleted;
      } catch (error) {
        if (getPostgresErrorCode(error) === POSTGRES_ERROR_CODES.RESTRICT_VIOLATION) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Cannot delete a user who has cast votes or created elections. Suspend the account instead.",
          });
        }
        throw error;
      }
    }),
});
