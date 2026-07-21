import { z } from "zod";
import { eq, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, adminProcedure } from "@/server/api/trpc";
import { elections } from "@/server/db/schema";
import { createElectionSchema, updateElectionSchema } from "@/schemas/election";
import { computeElectionResults } from "@/server/results";
import { getPostgresErrorCode, POSTGRES_ERROR_CODES } from "@/lib/db-errors";
import { logActivity } from "@/server/activity-log";

function toWriteValues(input: {
  title: string;
  description?: string;
  category?: string;
  bannerUrl?: string;
  startDate: string;
  endDate: string;
  visibility: "public" | "private";
  maxVotesAllowed?: number;
  rules?: string;
  instructions?: string;
}) {
  return {
    title: input.title,
    description: input.description || null,
    category: input.category || null,
    bannerUrl: input.bannerUrl || null,
    startDate: new Date(input.startDate),
    endDate: new Date(input.endDate),
    visibility: input.visibility,
    maxVotesAllowed: input.maxVotesAllowed ?? null,
    rules: input.rules || null,
    instructions: input.instructions || null,
  };
}

export const electionsRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.pageSize;

      const [items, totalRow] = await Promise.all([
        ctx.db.query.elections.findMany({
          orderBy: (fields, { desc }) => [desc(fields.createdAt)],
          limit: input.pageSize,
          offset,
          with: { candidates: { columns: { id: true } } },
        }),
        ctx.db.select({ total: count() }).from(elections),
      ]);

      return {
        items: items.map(({ candidates, ...election }) => ({
          ...election,
          candidateCount: candidates.length,
        })),
        total: totalRow[0].total,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  getById: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const election = await ctx.db.query.elections.findFirst({
        where: eq(elections.id, input.id),
      });

      if (!election) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
      }

      return election;
    }),

  create: adminProcedure.input(createElectionSchema).mutation(async ({ ctx, input }) => {
    const [election] = await ctx.db
      .insert(elections)
      .values({
        ...toWriteValues(input),
        createdBy: ctx.session.user.id,
      })
      .returning();

    await logActivity(ctx.db, {
      userId: ctx.session.user.id,
      action: "election.created",
      description: `Created election "${election.title}"`,
    });

    return election;
  }),

  update: adminProcedure.input(updateElectionSchema).mutation(async ({ ctx, input }) => {
    const [election] = await ctx.db
      .update(elections)
      .set(toWriteValues(input))
      .where(eq(elections.id, input.id))
      .returning();

    if (!election) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
    }

    return election;
  }),

  publish: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const election = await ctx.db.query.elections.findFirst({
        where: eq(elections.id, input.id),
      });

      if (!election) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
      }

      if (election.status !== "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only draft elections can be published",
        });
      }

      const now = new Date();
      const nextStatus =
        now < election.startDate ? "upcoming" : now > election.endDate ? "ended" : "active";

      const [updated] = await ctx.db
        .update(elections)
        .set({ status: nextStatus })
        .where(eq(elections.id, input.id))
        .returning();

      await logActivity(ctx.db, {
        userId: ctx.session.user.id,
        action: "election.published",
        description: `Published election "${updated.title}"`,
      });

      return updated;
    }),

  close: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const election = await ctx.db.query.elections.findFirst({
        where: eq(elections.id, input.id),
      });

      if (!election) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
      }

      if (election.status === "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Draft elections cannot be closed — delete or publish instead",
        });
      }

      const [updated] = await ctx.db
        .update(elections)
        .set({ status: "closed" })
        .where(eq(elections.id, input.id))
        .returning();

      await logActivity(ctx.db, {
        userId: ctx.session.user.id,
        action: "election.closed",
        description: `Closed election "${updated.title}"`,
      });

      return updated;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const [deleted] = await ctx.db
          .delete(elections)
          .where(eq(elections.id, input.id))
          .returning();

        if (!deleted) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
        }

        await logActivity(ctx.db, {
          userId: ctx.session.user.id,
          action: "election.deleted",
          description: `Deleted election "${deleted.title}"`,
        });

        return deleted;
      } catch (error) {
        if (getPostgresErrorCode(error) === POSTGRES_ERROR_CODES.RESTRICT_VIOLATION) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Cannot delete an election that already has votes",
          });
        }
        throw error;
      }
    }),

  getResults: adminProcedure
    .input(z.object({ electionId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const results = await computeElectionResults(ctx.db, input.electionId);

      if (!results) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
      }

      return results;
    }),

  publishResults: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [election] = await ctx.db
        .update(elections)
        .set({ resultsPublished: true })
        .where(eq(elections.id, input.id))
        .returning();

      if (!election) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
      }

      return election;
    }),

  hideResults: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [election] = await ctx.db
        .update(elections)
        .set({ resultsPublished: false })
        .where(eq(elections.id, input.id))
        .returning();

      if (!election) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
      }

      return election;
    }),
});
