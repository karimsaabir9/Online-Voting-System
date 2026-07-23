import { z } from "zod";
import { eq, and, notInArray, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { elections, candidates, votes } from "@/server/db/schema";
import { getEffectiveStatus } from "@/lib/election-status";
import { getClientIp } from "@/lib/request-info";
import { computeElectionResults } from "@/server/results";
import { getPostgresErrorCode, POSTGRES_ERROR_CODES } from "@/lib/db-errors";
import { logActivity } from "@/server/activity-log";
import { effectiveStatusCondition } from "@/server/election-status-sql";

export const votingRouter = createTRPCRouter({
  listElections: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.elections.findMany({
      where: (fields, { and, eq, ne }) =>
        and(eq(fields.visibility, "public"), ne(fields.status, "draft")),
      orderBy: (fields, { desc }) => [desc(fields.startDate)],
    });

    return rows.map((election) => ({
      ...election,
      effectiveStatus: getEffectiveStatus(election),
    }));
  }),

  getElection: protectedProcedure
    .input(z.object({ electionId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const election = await ctx.db.query.elections.findFirst({
        where: eq(elections.id, input.electionId),
      });

      if (!election || election.visibility !== "public" || election.status === "draft") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
      }

      const electionCandidates = await ctx.db.query.candidates.findMany({
        where: eq(candidates.electionId, input.electionId),
      });

      const existingVote = await ctx.db.query.votes.findFirst({
        where: and(
          eq(votes.electionId, input.electionId),
          eq(votes.userId, ctx.session.user.id)
        ),
      });

      return {
        election: { ...election, effectiveStatus: getEffectiveStatus(election) },
        candidates: electionCandidates,
        votedCandidateId: existingVote?.candidateId ?? null,
        votedAt: existingVote?.votedAt ?? null,
      };
    }),

  myVotes: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.votes.findMany({
      where: eq(votes.userId, ctx.session.user.id),
      orderBy: (fields, { desc }) => [desc(fields.votedAt)],
      with: {
        election: { columns: { id: true, title: true } },
        candidate: {
          columns: {
            id: true,
            fullName: true,
            photoUrl: true,
            politicalParty: true,
            position: true,
          },
        },
      },
    });

    return rows;
  }),

  castVote: protectedProcedure
    .input(z.object({ electionId: z.uuid(), candidateId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const election = await ctx.db.query.elections.findFirst({
        where: eq(elections.id, input.electionId),
      });

      if (!election || election.visibility !== "public") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
      }

      if (getEffectiveStatus(election) !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This election is not currently open for voting",
        });
      }

      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.candidateId),
      });

      if (
        !candidate ||
        candidate.electionId !== input.electionId ||
        candidate.status !== "active"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid candidate for this election",
        });
      }

      const existingVote = await ctx.db.query.votes.findFirst({
        where: and(
          eq(votes.electionId, input.electionId),
          eq(votes.userId, ctx.session.user.id)
        ),
      });

      if (existingVote) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You have already voted in this election",
        });
      }

      try {
        const [vote] = await ctx.db
          .insert(votes)
          .values({
            electionId: input.electionId,
            candidateId: input.candidateId,
            userId: ctx.session.user.id,
            ipAddress: getClientIp(ctx.headers),
            deviceInfo: ctx.headers.get("user-agent"),
          })
          .returning();

        await logActivity(ctx.db, {
          userId: null,
          action: "vote.cast",
          description: `A vote was cast in "${election.title}"`,
        });

        return vote;
      } catch (error) {
        if (getPostgresErrorCode(error) === POSTGRES_ERROR_CODES.UNIQUE_VIOLATION) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "You have already voted in this election",
          });
        }
        throw error;
      }
    }),

  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const now = new Date();

    const votedRows = await ctx.db
      .select({ electionId: votes.electionId })
      .from(votes)
      .where(eq(votes.userId, userId));
    const votedIds = votedRows.map((row) => row.electionId);

    const openElectionsConditions = [
      eq(elections.visibility, "public"),
      effectiveStatusCondition("active", now),
    ];
    if (votedIds.length > 0) {
      openElectionsConditions.push(notInArray(elections.id, votedIds));
    }

    const [openElections, recentPublishedResults] = await Promise.all([
      ctx.db.query.elections.findMany({
        where: and(...openElectionsConditions),
        orderBy: (fields, { asc }) => [asc(fields.endDate)],
      }),
      votedIds.length > 0
        ? ctx.db.query.elections.findMany({
            where: and(inArray(elections.id, votedIds), eq(elections.resultsPublished, true)),
            orderBy: (fields, { desc }) => [desc(fields.updatedAt)],
            limit: 5,
          })
        : Promise.resolve([]),
    ]);

    return {
      openElections: openElections.map((election) => ({
        id: election.id,
        title: election.title,
        endDate: election.endDate,
      })),
      votedCount: votedIds.length,
      recentPublishedResults: recentPublishedResults.map((election) => ({
        id: election.id,
        title: election.title,
      })),
    };
  }),

  getResults: protectedProcedure
    .input(z.object({ electionId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const election = await ctx.db.query.elections.findFirst({
        where: eq(elections.id, input.electionId),
      });

      if (
        !election ||
        election.visibility !== "public" ||
        election.status === "draft" ||
        !election.resultsPublished
      ) {
        return { published: false as const };
      }

      const results = await computeElectionResults(ctx.db, input.electionId);

      if (!results) {
        return { published: false as const };
      }

      return { published: true as const, results };
    }),
});
