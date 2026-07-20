import { eq, and, count } from "drizzle-orm";

import type { db as dbType } from "@/server/db";
import { elections, candidates, votes, user } from "@/server/db/schema";

type Database = typeof dbType;

export type ElectionResults = {
  election: {
    id: string;
    title: string;
    resultsPublished: boolean;
  };
  candidates: Array<{
    id: string;
    fullName: string;
    photoUrl: string | null;
    voteCount: number;
    percentage: number;
    rank: number;
    isWinner: boolean;
  }>;
  totalVotes: number;
  totalActiveVoters: number;
  turnoutPercentage: number;
};

/**
 * The one place vote-tallying math lives. Rank is plain sequential order in
 * the sorted list (not competition-ranking with skipped numbers) — ties are
 * communicated via `isWinner`, not the numeric rank, so this stays simple.
 */
export async function computeElectionResults(
  db: Database,
  electionId: string
): Promise<ElectionResults | null> {
  const election = await db.query.elections.findFirst({
    where: eq(elections.id, electionId),
  });

  if (!election) {
    return null;
  }

  const electionCandidates = await db.query.candidates.findMany({
    where: eq(candidates.electionId, electionId),
  });

  const voteCounts = await db
    .select({ candidateId: votes.candidateId, voteCount: count() })
    .from(votes)
    .where(eq(votes.electionId, electionId))
    .groupBy(votes.candidateId);

  const voteCountByCandidateId = new Map(
    voteCounts.map((row) => [row.candidateId, row.voteCount])
  );

  const totalVotes = voteCounts.reduce((sum, row) => sum + row.voteCount, 0);

  const withCounts = electionCandidates.map((candidate) => ({
    id: candidate.id,
    fullName: candidate.fullName,
    photoUrl: candidate.photoUrl,
    voteCount: voteCountByCandidateId.get(candidate.id) ?? 0,
  }));

  const sorted = [...withCounts].sort((a, b) => b.voteCount - a.voteCount);
  const topVoteCount = sorted[0]?.voteCount ?? 0;

  const rankedCandidates = sorted.map((candidate, index) => ({
    ...candidate,
    percentage: totalVotes > 0 ? (candidate.voteCount / totalVotes) * 100 : 0,
    rank: index + 1,
    isWinner: totalVotes > 0 && candidate.voteCount === topVoteCount,
  }));

  const [{ totalActiveVoters }] = await db
    .select({ totalActiveVoters: count() })
    .from(user)
    .where(and(eq(user.role, "voter"), eq(user.status, "active")));

  return {
    election: {
      id: election.id,
      title: election.title,
      resultsPublished: election.resultsPublished,
    },
    candidates: rankedCandidates,
    totalVotes,
    totalActiveVoters,
    turnoutPercentage:
      totalActiveVoters > 0 ? (totalVotes / totalActiveVoters) * 100 : 0,
  };
}
