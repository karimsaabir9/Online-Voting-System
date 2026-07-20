import { Badge } from "@/components/ui/badge"
import {
  getEffectiveStatus,
  type ElectionForStatus,
  type EffectiveElectionStatus,
} from "@/lib/election-status"

const STATUS_LABELS: Record<EffectiveElectionStatus, string> = {
  draft: "Draft",
  upcoming: "Upcoming",
  active: "Active",
  ended: "Ended",
  closed: "Closed",
}

const STATUS_VARIANTS: Record<
  EffectiveElectionStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "outline",
  upcoming: "secondary",
  active: "default",
  ended: "outline",
  closed: "destructive",
}

export function ElectionStatusBadge({ election }: { election: ElectionForStatus }) {
  const status = getEffectiveStatus(election)

  return <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
}
