import { NextResponse, type NextRequest } from "next/server";

import { getServerSession } from "@/server/auth/get-session";
import { computeElectionResults } from "@/server/results";
import { db } from "@/server/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ electionId: string }> }
) {
  const session = await getServerSession();

  if (!session || session.user.status !== "active" || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { electionId } = await params;
  const results = await computeElectionResults(db, electionId);

  if (!results) {
    return NextResponse.json({ error: "Election not found" }, { status: 404 });
  }

  const header = "Candidate,Votes,Percentage,Rank,Winner\n";
  const rows = results.candidates
    .map((candidate) =>
      [
        `"${candidate.fullName.replace(/"/g, '""')}"`,
        candidate.voteCount,
        `${candidate.percentage.toFixed(2)}%`,
        candidate.rank,
        candidate.isWinner ? "Yes" : "No",
      ].join(",")
    )
    .join("\n");

  const csv = header + rows + "\n";
  const filename = `${results.election.title.replace(/[^a-z0-9]+/gi, "-")}-results.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
