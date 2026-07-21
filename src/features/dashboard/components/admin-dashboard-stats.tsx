"use client"

import Link from "next/link"
import { AlertCircle, TrendingUp, Users, Vote } from "lucide-react"

import { trpc } from "@/lib/trpc/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function AdminDashboardStats() {
  const { data, isLoading } = trpc.elections.dashboardStats.useQuery()

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading dashboard…</p>
  }

  if (!data) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
              <Vote className="size-4" />
              Total Elections
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data.totalElections}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="size-4" />
              Active Elections
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data.activeElections}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
              <Vote className="size-4" />
              Total Votes Cast
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data.totalVotesCast}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
              <Users className="size-4" />
              Total Voters
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data.totalVoters}</CardContent>
        </Card>
      </div>

      {(data.endingSoon.length > 0 || data.resultsNotPublished.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="size-4" />
              Needs Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.endingSoon.map((election) => (
              <Link
                key={election.id}
                href={`/admin/elections/${election.id}`}
                className="block text-sm hover:underline"
              >
                &quot;{election.title}&quot; ends {election.endDate.toLocaleString()}
              </Link>
            ))}
            {data.resultsNotPublished.map((election) => (
              <Link
                key={election.id}
                href={`/admin/elections/${election.id}`}
                className="block text-sm hover:underline"
              >
                &quot;{election.title}&quot; has ended — results not yet published
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.recentActivity.length === 0 ? (
            <p className="text-muted-foreground text-sm">No activity yet.</p>
          ) : (
            data.recentActivity.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between text-sm">
                <span>{entry.description}</span>
                <span className="text-muted-foreground text-xs">
                  {entry.createdAt.toLocaleString()}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
