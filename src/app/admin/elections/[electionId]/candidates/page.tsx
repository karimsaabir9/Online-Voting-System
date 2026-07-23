import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { db } from "@/server/db"
import { elections } from "@/server/db/schema"
import { ElectionStatusBadge } from "@/features/elections/components/election-status-badge"
import { CandidatesTable } from "@/features/candidates/components/candidates-table"
import { CreateCandidateDialog } from "@/features/candidates/components/create-candidate-dialog"

export default async function ElectionCandidatesPage({
  params,
}: {
  params: Promise<{ electionId: string }>
}) {
  const { electionId } = await params

  const election = await db.query.elections.findFirst({
    where: eq(elections.id, electionId),
  })

  if (!election) {
    notFound()
  }

  return (
    <div className="max-w-4xl space-y-6 p-6">
      <div className="space-y-2">
        <Link
          href={`/admin/elections/${election.id}`}
          className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          Back to {election.title}
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Candidates</h1>
            <ElectionStatusBadge election={election} />
          </div>
          <CreateCandidateDialog electionId={election.id} />
        </div>
      </div>

      <CandidatesTable electionId={election.id} />
    </div>
  )
}
