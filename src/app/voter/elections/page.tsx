"use client"

import { trpc } from "@/lib/trpc/client"
import { ElectionCard } from "@/features/voting/components/election-card"
import type { EffectiveElectionStatus } from "@/lib/election-status"

function groupByStatus<T extends { effectiveStatus: EffectiveElectionStatus }>(items: T[]) {
  return {
    active: items.filter((e) => e.effectiveStatus === "active"),
    upcoming: items.filter((e) => e.effectiveStatus === "upcoming"),
    past: items.filter((e) => e.effectiveStatus === "ended" || e.effectiveStatus === "closed"),
  }
}

export default function VoterElectionsPage() {
  const { data, isLoading } = trpc.voting.listElections.useQuery()

  if (isLoading) {
    return <p className="text-muted-foreground p-6 text-sm">Loading elections…</p>
  }

  if (!data || data.length === 0) {
    return <p className="text-muted-foreground p-6 text-sm">No elections available yet.</p>
  }

  const { active, upcoming, past } = groupByStatus(data)

  return (
    <div className="space-y-8 p-6">
      {active.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Active Elections</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((election) => (
              <ElectionCard key={election.id} election={election} />
            ))}
          </div>
        </section>
      )}
      {upcoming.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Upcoming Elections</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((election) => (
              <ElectionCard key={election.id} election={election} />
            ))}
          </div>
        </section>
      )}
      {past.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Past Elections</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((election) => (
              <ElectionCard key={election.id} election={election} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
