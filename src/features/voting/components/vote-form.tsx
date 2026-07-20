"use client"

import { useState } from "react"
import { toast } from "sonner"

import { trpc } from "@/lib/trpc/client"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

type VoteFormCandidate = {
  id: string
  fullName: string
  politicalParty: string | null
}

type VoteFormProps = {
  electionId: string
  candidates: VoteFormCandidate[]
}

export function VoteForm({ electionId, candidates }: VoteFormProps) {
  const utils = trpc.useUtils()
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)

  const castVoteMutation = trpc.voting.castVote.useMutation({
    onSuccess: async () => {
      await utils.voting.getElection.invalidate({ electionId })
      await utils.voting.myVotes.invalidate()
      toast.success("Your vote has been recorded")
    },
    onError: (error) => toast.error(error.message),
  })

  function handleSubmit() {
    if (!selectedCandidateId) {
      toast.error("Select a candidate to vote for")
      return
    }
    castVoteMutation.mutate({ electionId, candidateId: selectedCandidateId })
  }

  if (candidates.length === 0) {
    return <p className="text-muted-foreground text-sm">No candidates are available to vote for yet.</p>
  }

  return (
    <div className="space-y-4">
      <RadioGroup
        value={selectedCandidateId ?? undefined}
        onValueChange={setSelectedCandidateId}
      >
        {candidates.map((candidate) => (
          <div key={candidate.id} className="flex items-center gap-3 rounded-lg border p-3">
            <RadioGroupItem value={candidate.id} id={`candidate-${candidate.id}`} />
            <Label htmlFor={`candidate-${candidate.id}`} className="flex-1 cursor-pointer">
              <span className="font-medium">{candidate.fullName}</span>
              {candidate.politicalParty && (
                <span className="text-muted-foreground ml-2 text-sm">
                  {candidate.politicalParty}
                </span>
              )}
            </Label>
          </div>
        ))}
      </RadioGroup>
      <Button
        onClick={handleSubmit}
        disabled={castVoteMutation.isPending || !selectedCandidateId}
      >
        {castVoteMutation.isPending ? "Submitting…" : "Cast Vote"}
      </Button>
    </div>
  )
}
