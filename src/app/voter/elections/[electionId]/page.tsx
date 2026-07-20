"use client"

import { useParams } from "next/navigation"

import { trpc } from "@/lib/trpc/client"
import { CandidateCard } from "@/features/voting/components/candidate-card"
import { VoteForm } from "@/features/voting/components/vote-form"
import { VoteConfirmationCard } from "@/features/voting/components/vote-confirmation-card"
import { Badge } from "@/components/ui/badge"
import type { EffectiveElectionStatus } from "@/lib/election-status"

const STATUS_LABELS: Record<EffectiveElectionStatus, string> = {
  draft: "Draft",
  upcoming: "Upcoming",
  active: "Active",
  ended: "Ended",
  closed: "Closed",
}

export default function VoterElectionDetailPage() {
  const params = useParams<{ electionId: string }>()
  const electionId = params.electionId

  const { data, isLoading, error } = trpc.voting.getElection.useQuery({ electionId })

  if (isLoading) {
    return <p className="text-muted-foreground p-6 text-sm">Loading election…</p>
  }

  if (error || !data) {
    return <p className="text-muted-foreground p-6 text-sm">Election not found.</p>
  }

  const { election, candidates, votedCandidateId, votedAt } = data
  const votedCandidate = candidates.find((c) => c.id === votedCandidateId)

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {election.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={election.bannerUrl}
          alt=""
          className="aspect-[3/1] w-full rounded-xl object-cover"
        />
      )}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{election.title}</h1>
        <Badge variant={election.effectiveStatus === "active" ? "default" : "outline"}>
          {STATUS_LABELS[election.effectiveStatus]}
        </Badge>
      </div>
      {election.description && <p className="text-muted-foreground">{election.description}</p>}
      {election.instructions && (
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">Instructions</p>
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">
            {election.instructions}
          </p>
        </div>
      )}
      {election.rules && (
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">Rules</p>
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">{election.rules}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {candidates.map((candidate) => (
          <CandidateCard key={candidate.id} candidate={candidate} />
        ))}
      </div>

      {votedCandidate && votedAt ? (
        <VoteConfirmationCard candidateName={votedCandidate.fullName} votedAt={votedAt} />
      ) : election.effectiveStatus === "active" ? (
        <VoteForm
          electionId={election.id}
          candidates={candidates.filter((c) => c.status === "active")}
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          This election is not currently open for voting.
        </p>
      )}
    </div>
  )
}
