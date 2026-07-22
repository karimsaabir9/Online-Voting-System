"use client"

import Link from "next/link"

import { trpc } from "@/lib/trpc/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function VoterNotificationsPage() {
  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.notifications.list.useQuery()

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => utils.notifications.list.invalidate(),
  })

  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => utils.notifications.list.invalidate(),
  })

  if (isLoading) {
    return <p className="text-muted-foreground p-6 text-sm">Loading notifications…</p>
  }

  const items = data?.items ?? []
  const unreadCount = data?.unreadCount ?? 0

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={markAllReadMutation.isPending}
            onClick={() => markAllReadMutation.mutate()}
          >
            Mark all as read
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No notifications yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((notification) => (
            <Link
              key={notification.id}
              href={
                notification.electionId
                  ? `/voter/elections/${notification.electionId}`
                  : "/voter/notifications"
              }
              onClick={() => {
                if (!notification.isRead) {
                  markReadMutation.mutate({ id: notification.id })
                }
              }}
              className={cn(
                "block rounded-lg border p-4",
                !notification.isRead && "bg-accent/50"
              )}
            >
              <p className="font-medium">{notification.title}</p>
              <p className="text-muted-foreground text-sm">{notification.message}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {notification.createdAt.toLocaleString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
