import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { EffectiveElectionStatus } from "@/lib/election-status"

type ElectionCardProps = {
  election: {
    id: string
    title: string
    description: string | null
    category: string | null
    bannerUrl: string | null
    startDate: Date
    endDate: Date
    effectiveStatus: EffectiveElectionStatus
  }
}

const STATUS_LABELS: Record<EffectiveElectionStatus, string> = {
  draft: "Draft",
  upcoming: "Upcoming",
  active: "Active",
  ended: "Ended",
  closed: "Closed",
}

export function ElectionCard({ election }: ElectionCardProps) {
  return (
    <Link href={`/voter/elections/${election.id}`}>
      <Card className="h-full transition-colors hover:bg-muted/50">
        {election.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={election.bannerUrl}
            alt=""
            className="aspect-video w-full rounded-t-xl object-cover"
          />
        )}
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{election.title}</CardTitle>
            <Badge variant={election.effectiveStatus === "active" ? "default" : "outline"}>
              {STATUS_LABELS[election.effectiveStatus]}
            </Badge>
          </div>
          {election.category && <CardDescription>{election.category}</CardDescription>}
        </CardHeader>
        <CardContent>
          {election.description && (
            <p className="text-muted-foreground line-clamp-2 text-sm">{election.description}</p>
          )}
          <p className="text-muted-foreground mt-2 text-xs">
            {election.startDate.toLocaleDateString()} – {election.endDate.toLocaleDateString()}
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
