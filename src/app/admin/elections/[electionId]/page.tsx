import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"

import { db } from "@/server/db"
import { elections } from "@/server/db/schema"
import { ElectionForm } from "@/features/elections/components/election-form"
import { ElectionStatusBadge } from "@/features/elections/components/election-status-badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function EditElectionPage({
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
    <div className="max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{election.title}</h1>
          <ElectionStatusBadge election={election} />
        </div>
        <Button
          variant="outline"
          render={<Link href={`/admin/elections/${election.id}/candidates/new`} />}
        >
          Manage candidates
        </Button>
      </div>
      <ElectionForm election={election} />
    </div>
  )
}
