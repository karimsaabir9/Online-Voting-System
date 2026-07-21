"use client"

import { trpc } from "@/lib/trpc/client"
import { ResultsPanel } from "./results-panel"
import { PublishResultsControl } from "./publish-results-control"
import { Button } from "@/components/ui/button"

export function AdminResultsSection({ electionId }: { electionId: string }) {
  const { data, isLoading } = trpc.elections.getResults.useQuery({ electionId })

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading results…</p>
  }

  if (!data) {
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Results</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<a href={`/api/admin/elections/${electionId}/export`} />}
          >
            Export CSV
          </Button>
          <PublishResultsControl
            electionId={electionId}
            resultsPublished={data.election.resultsPublished}
          />
        </div>
      </div>
      <ResultsPanel data={data} />
    </div>
  )
}
