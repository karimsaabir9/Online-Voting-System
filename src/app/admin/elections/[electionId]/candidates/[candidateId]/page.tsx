import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"

import { db } from "@/server/db"
import { candidates } from "@/server/db/schema"
import { CandidateForm } from "@/features/candidates/components/candidate-form"

export default async function EditCandidatePage({
  params,
}: {
  params: Promise<{ electionId: string; candidateId: string }>
}) {
  const { electionId, candidateId } = await params

  const candidate = await db.query.candidates.findFirst({
    where: eq(candidates.id, candidateId),
  })

  if (!candidate || candidate.electionId !== electionId) {
    notFound()
  }

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{candidate.fullName}</h1>
      <CandidateForm electionId={electionId} candidate={candidate} />
    </div>
  )
}
