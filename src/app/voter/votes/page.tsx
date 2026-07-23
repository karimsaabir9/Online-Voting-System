"use client"

import { useState } from "react"
import Link from "next/link"
import { FileCheck2 } from "lucide-react"
import type { inferRouterOutputs } from "@trpc/server"

import { trpc } from "@/lib/trpc/client"
import type { AppRouter } from "@/server/api/root"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { VoteConfirmationModal } from "@/features/voting/components/vote-confirmation-modal"

type Vote = inferRouterOutputs<AppRouter>["voting"]["myVotes"][number]

export default function MyVotesPage() {
  const { data, isLoading } = trpc.voting.myVotes.useQuery()
  const [selectedVote, setSelectedVote] = useState<Vote | null>(null)

  if (isLoading) {
    return <p className="text-muted-foreground p-6 text-sm">Loading your voting history…</p>
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-muted-foreground p-6 text-sm">
        You haven&apos;t voted in any elections yet.
      </p>
    )
  }

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">My Votes</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Election</TableHead>
            <TableHead>Candidate</TableHead>
            <TableHead>Voted at</TableHead>
            <TableHead className="text-right">Vote Confirmation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((vote) => (
            <TableRow key={vote.id}>
              <TableCell>
                <Link href={`/voter/elections/${vote.election.id}`} className="hover:underline">
                  {vote.election.title}
                </Link>
              </TableCell>
              <TableCell>{vote.candidate.fullName}</TableCell>
              <TableCell>{vote.votedAt.toLocaleString()}</TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedVote(vote)}
                >
                  <FileCheck2 />
                  View Confirmation
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectedVote && (
        <VoteConfirmationModal
          vote={selectedVote}
          open={selectedVote !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedVote(null)
          }}
        />
      )}
    </div>
  )
}
