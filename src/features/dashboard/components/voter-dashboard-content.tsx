"use client"

import Link from "next/link"
import { Calendar, CheckCircle2, Trophy } from "lucide-react"

import { trpc } from "@/lib/trpc/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function VoterDashboardContent() {
  const { data, isLoading } = trpc.voting.dashboard.useQuery()

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>
  }

  if (!data) {
    return null
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="size-4" />
            Elections Voted In
          </CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">{data.votedCount}</CardContent>
      </Card>

      {data.openElections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="size-4" />
              Open for Voting
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.openElections.map((election) => (
              <div key={election.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{election.title}</p>
                  <p className="text-muted-foreground text-xs">
                    Closes {election.endDate.toLocaleString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  render={<Link href={`/voter/elections/${election.id}`} />}
                  nativeButton={false}
                >
                  Vote now
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data.recentPublishedResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="size-4" />
              Recently Published Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentPublishedResults.map((election) => (
              <Link
                key={election.id}
                href={`/voter/elections/${election.id}`}
                className="block text-sm hover:underline"
              >
                {election.title}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
