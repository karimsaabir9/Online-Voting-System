import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import Link from "next/link"
import { Users } from "lucide-react"

import { db } from "@/server/db"
import { elections } from "@/server/db/schema"
import { ElectionForm } from "@/features/elections/components/election-form"
import { ElectionStatusBadge } from "@/features/elections/components/election-status-badge"
import { AdminResultsSection } from "@/features/results/components/admin-results-section"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
    <div className="mx-auto w-full max-w-3xl space-y-8 p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{election.title}</h1>
            <ElectionStatusBadge election={election} />
          </div>
          <p className="text-muted-foreground text-sm">
            Manage this election&apos;s details and view its results.
          </p>
        </div>
        <Button
          variant="outline"
          render={<Link href={`/admin/elections/${election.id}/candidates`} />}
          nativeButton={false}
        >
          <Users className="size-4" />
          Manage candidates
        </Button>
      </div>

      <Tabs defaultValue="details">
        <TabsList variant="line" className="h-auto w-full justify-start border-b p-0">
          <TabsTrigger value="details" className="gap-1.5 px-3 py-2">
            Details
          </TabsTrigger>
          <TabsTrigger value="results" className="gap-1.5 px-3 py-2">
            Results
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Election details</CardTitle>
              <CardDescription>
                Update the information voters see for this election.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ElectionForm election={election} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="mt-6">
          <AdminResultsSection electionId={election.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
