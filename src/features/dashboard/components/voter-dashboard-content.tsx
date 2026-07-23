"use client"

import Link from "next/link"
import { Calendar, CheckCircle2, History, Trophy, Vote } from "lucide-react"

import { trpc } from "@/lib/trpc/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

function formatClosingTime(endDate: Date): string {
  const diffMs = endDate.getTime() - Date.now()

  if (diffMs <= 0) {
    return "Closed"
  }

  const minutes = Math.max(1, Math.round(diffMs / (60 * 1000)))
  if (minutes < 60) {
    return `Closes in ${minutes} minute${minutes === 1 ? "" : "s"}`
  }

  const hours = Math.round(diffMs / (60 * 60 * 1000))
  if (hours < 24) {
    return `Closes in ${hours} hour${hours === 1 ? "" : "s"}`
  }

  const days = Math.round(diffMs / (24 * 60 * 60 * 1000))
  return `Closes in ${days} day${days === 1 ? "" : "s"}`
}

export function VoterDashboardContent() {
  const { data, isLoading } = trpc.voting.dashboard.useQuery()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!data) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="size-4" />
              Elections Voted In
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data.votedCount}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
              <Vote className="size-4" />
              Open for Voting
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {data.openElections.length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
              <Trophy className="size-4" />
              Results Available
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {data.recentPublishedResults.length}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="size-4" />
              Open for Voting
            </CardTitle>
            <CardDescription>Cast your vote before these elections close.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.openElections.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No elections are open for voting right now. Check back soon.
              </p>
            ) : (
              <div className="divide-y">
                {data.openElections.map((election) => (
                  <div
                    key={election.id}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{election.title}</p>
                      <Tooltip>
                        <TooltipTrigger render={<p className="text-muted-foreground w-fit text-xs" />}>
                          {formatClosingTime(election.endDate)}
                        </TooltipTrigger>
                        <TooltipContent>{election.endDate.toLocaleString()}</TooltipContent>
                      </Tooltip>
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
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                render={<Link href="/voter/elections" />}
                nativeButton={false}
              >
                <Vote className="size-4" />
                Browse elections
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                render={<Link href="/voter/votes" />}
                nativeButton={false}
              >
                <History className="size-4" />
                Voting history
              </Button>
            </CardContent>
          </Card>

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
      </div>
    </div>
  )
}
