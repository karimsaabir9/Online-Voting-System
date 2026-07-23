import { z } from "zod";
import { and, count, desc, eq, gte, ilike, lte, or } from "drizzle-orm";

import { createTRPCRouter, adminProcedure } from "@/server/api/trpc";
import { candidates, elections, user, votes } from "@/server/db/schema";

export const votesRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(10),
        search: z.string().trim().min(1).optional(),
        electionId: z.union([z.literal("all"), z.uuid()]).default("all"),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.pageSize;

      const conditions = [];
      if (input.search) {
        conditions.push(
          or(
            ilike(user.name, `%${input.search}%`),
            ilike(user.email, `%${input.search}%`),
            ilike(candidates.fullName, `%${input.search}%`)
          )!
        );
      }
      if (input.electionId !== "all") {
        conditions.push(eq(votes.electionId, input.electionId));
      }
      if (input.dateFrom) {
        conditions.push(gte(votes.votedAt, new Date(`${input.dateFrom}T00:00:00.000Z`)));
      }
      if (input.dateTo) {
        conditions.push(lte(votes.votedAt, new Date(`${input.dateTo}T23:59:59.999Z`)));
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const baseQuery = ctx.db
        .select({
          id: votes.id,
          votedAt: votes.votedAt,
          voterName: user.name,
          voterEmail: user.email,
          candidateFullName: candidates.fullName,
          candidatePhotoUrl: candidates.photoUrl,
          candidateParty: candidates.politicalParty,
          candidatePosition: candidates.position,
          electionTitle: elections.title,
        })
        .from(votes)
        .innerJoin(user, eq(votes.userId, user.id))
        .innerJoin(candidates, eq(votes.candidateId, candidates.id))
        .innerJoin(elections, eq(votes.electionId, elections.id))
        .where(whereClause);

      const countQuery = ctx.db
        .select({ total: count() })
        .from(votes)
        .innerJoin(user, eq(votes.userId, user.id))
        .innerJoin(candidates, eq(votes.candidateId, candidates.id))
        .innerJoin(elections, eq(votes.electionId, elections.id))
        .where(whereClause);

      const [items, totalRow] = await Promise.all([
        baseQuery.orderBy(desc(votes.votedAt)).limit(input.pageSize).offset(offset),
        countQuery,
      ]);

      return {
        items,
        total: totalRow[0].total,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  electionOptions: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({ id: elections.id, title: elections.title })
      .from(elections)
      .orderBy(desc(elections.startDate));
  }),
});
