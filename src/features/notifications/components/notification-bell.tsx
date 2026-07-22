"use client"

import Link from "next/link"
import { Bell } from "lucide-react"

import { trpc } from "@/lib/trpc/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export function NotificationBell() {
  const utils = trpc.useUtils()
  const { data } = trpc.notifications.list.useQuery()

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => utils.notifications.list.invalidate(),
  })

  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => utils.notifications.list.invalidate(),
  })

  const items = data?.items ?? []
  const unreadCount = data?.unreadCount ?? 0
  const recent = items.slice(0, 5)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="icon" className="relative">
            <Bell className="size-4" />
            {unreadCount > 0 && (
              <span className="bg-destructive absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full text-[10px] font-medium text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
            <span className="sr-only">Notifications</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-1.5 py-1">
          <span className="text-sm font-medium">Notifications</span>
          {unreadCount > 0 && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs"
              onClick={() => markAllReadMutation.mutate()}
            >
              Mark all as read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {recent.length === 0 ? (
          <p className="text-muted-foreground px-1.5 py-4 text-center text-sm">
            No notifications yet.
          </p>
        ) : (
          recent.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              render={
                <Link
                  href={
                    notification.electionId
                      ? `/voter/elections/${notification.electionId}`
                      : "/voter/notifications"
                  }
                />
              }
              onClick={() => {
                if (!notification.isRead) {
                  markReadMutation.mutate({ id: notification.id })
                }
              }}
              className={cn(
                "flex-col items-start gap-0.5",
                !notification.isRead && "bg-accent/50"
              )}
            >
              <span className="text-sm font-medium">{notification.title}</span>
              <span className="text-muted-foreground text-xs">{notification.message}</span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={<Link href="/voter/notifications" />}
          className="justify-center text-sm"
        >
          View all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
