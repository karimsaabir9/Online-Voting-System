import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { elections, candidates, votes } from "@/server/db/schema";
import { getEffectiveStatus } from "@/lib/election-status";

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
        candidate: { columns: { id: true, fullName: true } },
      },
    });

    return rows;
  }),
});
