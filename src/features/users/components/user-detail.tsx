"use client"

import * as React from "react"
import { toast } from "sonner"

import { trpc } from "@/lib/trpc/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function UserDetail({ userId }: { userId: string }) {
  const [pendingRoleChange, setPendingRoleChange] = React.useState<"admin" | "voter" | null>(
    null
  )
  const utils = trpc.useUtils()

  const { data, isLoading } = trpc.users.getById.useQuery({ id: userId })

  const suspendMutation = trpc.users.suspend.useMutation({
    onSuccess: async () => {
      await utils.users.getById.invalidate({ id: userId })
      toast.success("User suspended")
    },
    onError: (error) => toast.error(error.message),
  })

  const activateMutation = trpc.users.activate.useMutation({
    onSuccess: async () => {
      await utils.users.getById.invalidate({ id: userId })
      toast.success("User activated")
    },
    onError: (error) => toast.error(error.message),
  })

  const setRoleMutation = trpc.users.setRole.useMutation({
    onSuccess: async () => {
      await utils.users.getById.invalidate({ id: userId })
      toast.success("Role updated")
      setPendingRoleChange(null)
    },
    onError: (error) => {
      toast.error(error.message)
      setPendingRoleChange(null)
    },
  })

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading user…</p>
  }

  if (!data) {
    return <p className="text-muted-foreground text-sm">User not found.</p>
  }

  const { user, votingHistory } = data

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {user.name}
            <Badge variant={user.role === "admin" ? "default" : "outline"}>
              {user.role === "admin" ? "Admin" : "Voter"}
            </Badge>
            <Badge variant={user.status === "active" ? "default" : "destructive"}>
              {user.status === "active" ? "Active" : "Suspended"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">{user.email}</p>
          <div className="flex flex-wrap gap-2">
            {user.status === "active" ? (
              <Button
                variant="outline"
                disabled={suspendMutation.isPending}
                onClick={() => suspendMutation.mutate({ id: user.id })}
              >
                {suspendMutation.isPending ? "Suspending…" : "Suspend"}
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={activateMutation.isPending}
                onClick={() => activateMutation.mutate({ id: user.id })}
              >
                {activateMutation.isPending ? "Activating…" : "Activate"}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setPendingRoleChange(user.role === "admin" ? "voter" : "admin")}
            >
              {user.role === "admin" ? "Demote to voter" : "Promote to admin"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Voting history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {votingHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">No votes cast yet.</p>
          ) : (
            votingHistory.map((vote) => (
              <div key={vote.electionId} className="flex items-center justify-between text-sm">
                <span>{vote.electionTitle}</span>
                <span className="text-muted-foreground text-xs">
                  {vote.votedAt.toLocaleString()}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog
        open={pendingRoleChange !== null}
        onOpenChange={(open) => !open && setPendingRoleChange(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingRoleChange === "admin" ? "Promote to admin?" : "Demote to voter?"}
            </DialogTitle>
            <DialogDescription>
              {pendingRoleChange === "admin"
                ? `${user.name} will gain full admin access to manage elections, candidates, and other users.`
                : `${user.name} will lose admin access and become a regular voter.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRoleChange(null)}>
              Cancel
            </Button>
            <Button
              disabled={setRoleMutation.isPending}
              onClick={() =>
                pendingRoleChange &&
                setRoleMutation.mutate({ id: user.id, role: pendingRoleChange })
              }
            >
              {setRoleMutation.isPending ? "Updating…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
