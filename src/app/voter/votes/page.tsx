"use client"

import Link from "next/link"

import { trpc } from "@/lib/trpc/client"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function MyVotesPage() {
  const { data, isLoading } = trpc.voting.myVotes.useQuery()

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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
