import { Trophy } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { VoteShareChart } from "./vote-share-chart"

export type ResultsPanelCandidate = {
  id: string
  fullName: string
  voteCount: number
  percentage: number
  rank: number
  isWinner: boolean
}

export type ResultsPanelData = {
  candidates: ResultsPanelCandidate[]
  totalVotes: number
  totalActiveVoters: number
  turnoutPercentage: number
}

export function ResultsPanel({ data }: { data: ResultsPanelData }) {
  const winners = data.candidates.filter((candidate) => candidate.isWinner)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Total Votes
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data.totalVotes}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Turnout
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {data.turnoutPercentage.toFixed(1)}%
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              {winners.length > 1 ? "Winners" : "Winner"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold">
            {winners.length > 0 ? winners.map((winner) => winner.fullName).join(", ") : "—"}
          </CardContent>
        </Card>
      </div>

      {data.totalVotes > 0 && (
        <VoteShareChart
          data={data.candidates.map((candidate) => ({
            name: candidate.fullName,
            votes: candidate.voteCount,
          }))}
        />
      )}

      <div className="space-y-3">
        {data.candidates.map((candidate) => (
          <div key={candidate.id} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium">
                {candidate.fullName}
                {candidate.isWinner && (
                  <Badge variant="default" className="gap-1">
                    <Trophy className="size-3" />
                    Winner
                  </Badge>
                )}
              </span>
              <span className="text-muted-foreground">
                {candidate.voteCount} votes ({candidate.percentage.toFixed(1)}%)
              </span>
            </div>
            <Progress value={candidate.percentage} />
          </div>
        ))}
      </div>
    </div>
  )
}
