"use client"

import { toast } from "sonner"

import { trpc } from "@/lib/trpc/client"
import { Button } from "@/components/ui/button"

export function PublishResultsControl({
  electionId,
  resultsPublished,
}: {
  electionId: string
  resultsPublished: boolean
}) {
  const utils = trpc.useUtils()

  const publishMutation = trpc.elections.publishResults.useMutation({
    onSuccess: async () => {
      await utils.elections.getResults.invalidate({ electionId })
      toast.success("Results published")
    },
    onError: (error) => toast.error(error.message),
  })

  const hideMutation = trpc.elections.hideResults.useMutation({
    onSuccess: async () => {
      await utils.elections.getResults.invalidate({ electionId })
      toast.success("Results hidden")
    },
    onError: (error) => toast.error(error.message),
  })

  const isPending = publishMutation.isPending || hideMutation.isPending

  if (resultsPublished) {
    return (
      <Button
        variant="outline"
        disabled={isPending}
        onClick={() => hideMutation.mutate({ id: electionId })}
      >
        {hideMutation.isPending ? "Hiding…" : "Hide results"}
      </Button>
    )
  }

  return (
    <Button disabled={isPending} onClick={() => publishMutation.mutate({ id: electionId })}>
      {publishMutation.isPending ? "Publishing…" : "Publish results"}
    </Button>
  )
}
