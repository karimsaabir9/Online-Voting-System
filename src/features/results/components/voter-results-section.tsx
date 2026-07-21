"use client"

import { trpc } from "@/lib/trpc/client"
import { ResultsPanel } from "@/features/results/components/results-panel"

export function VoterResultsSection({ electionId }: { electionId: string }) {
  const { data, isLoading } = trpc.voting.getResults.useQuery({ electionId })

  if (isLoading || !data || !data.published) {
    return null
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Results</h2>
      <ResultsPanel data={data.results} />
    </div>
  )
}
