"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { trpc } from "@/lib/trpc/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function CandidatesTable({ electionId }: { electionId: string }) {
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null)
  const utils = trpc.useUtils()

  const { data, isLoading } = trpc.candidates.list.useQuery({ electionId, page: 1, pageSize: 50 })

  const deleteMutation = trpc.candidates.delete.useMutation({
    onSuccess: async () => {
      await utils.candidates.list.invalidate({ electionId })
      toast.success("Candidate deleted")
      setPendingDeleteId(null)
    },
    onError: (error) => {
      toast.error(error.message)
      setPendingDeleteId(null)
    },
  })

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading candidates…</p>
  }

  if (!data || data.items.length === 0) {
    return <p className="text-muted-foreground text-sm">No candidates yet.</p>
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Party</TableHead>
            <TableHead>Position</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((candidate) => (
            <TableRow key={candidate.id}>
              <TableCell>
                <Link
                  href={`/admin/elections/${electionId}/candidates/${candidate.id}`}
                  className="font-medium hover:underline"
                >
                  {candidate.fullName}
                </Link>
              </TableCell>
              <TableCell>{candidate.politicalParty ?? "—"}</TableCell>
              <TableCell>{candidate.position ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={candidate.status === "active" ? "default" : "outline"}>
                  {candidate.status === "active" ? "Active" : "Withdrawn"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <Link href={`/admin/elections/${electionId}/candidates/${candidate.id}`} />
                  }
                >
                  Edit
                </Button>{" "}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setPendingDeleteId(candidate.id)}
                >
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete candidate?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => pendingDeleteId && deleteMutation.mutate({ id: pendingDeleteId })}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
