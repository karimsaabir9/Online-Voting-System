"use client"

import { CheckCircle2, XCircle, Loader2 } from "lucide-react"

import { trpc } from "@/lib/trpc/client"
import { Badge } from "@/components/ui/badge"

export function HealthStatus() {
  const { data, isLoading, isError } = trpc.health.ping.useQuery()

  if (isLoading) {
    return (
      <Badge variant="outline" className="gap-1.5">
        <Loader2 className="size-3.5 animate-spin" />
        Checking database connection…
      </Badge>
    )
  }

  if (isError || !data?.db) {
    return (
      <Badge variant="destructive" className="gap-1.5">
        <XCircle className="size-3.5" />
        Database unreachable
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="gap-1.5 border-green-600/40 text-green-700 dark:text-green-400">
      <CheckCircle2 className="size-3.5" />
      Connected to database — {new Date(data.timestamp).toLocaleTimeString()}
    </Badge>
  )
}
