"use client"

import * as React from "react"
import Link from "next/link"
import { MoreHorizontal } from "lucide-react"
import { toast } from "sonner"

import { trpc } from "@/lib/trpc/client"
import { ElectionStatusBadge } from "./election-status-badge"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

export function ElectionsTable() {
  const [page, setPage] = React.useState(1)
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null)
  const pageSize = 10

  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.elections.list.useQuery({ page, pageSize })

  const deleteMutation = trpc.elections.delete.useMutation({
    onSuccess: async () => {
      await utils.elections.list.invalidate()
      toast.success("Election deleted")
      setPendingDeleteId(null)
    },
    onError: (error) => {
      toast.error(error.message)
      setPendingDeleteId(null)
    },
  })

  const publishMutation = trpc.elections.publish.useMutation({
    onSuccess: async () => {
      await utils.elections.list.invalidate()
      toast.success("Election published")
    },
    onError: (error) => toast.error(error.message),
  })

  const closeMutation = trpc.elections.close.useMutation({
    onSuccess: async () => {
      await utils.elections.list.invalidate()
      toast.success("Election closed")
    },
    onError: (error) => toast.error(error.message),
  })

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading elections…</p>
  }

  if (!data || data.items.length === 0) {
    return <p className="text-muted-foreground text-sm">No elections yet.</p>
  }

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize))

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
            <TableHead>Candidates</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((election) => (
            <TableRow key={election.id}>
              <TableCell>
                <Link href={`/admin/elections/${election.id}`} className="font-medium hover:underline">
                  {election.title}
                </Link>
              </TableCell>
              <TableCell>
                <ElectionStatusBadge election={election} />
              </TableCell>
              <TableCell>{election.startDate.toLocaleDateString()}</TableCell>
              <TableCell>{election.endDate.toLocaleDateString()}</TableCell>
              <TableCell>{election.candidateCount}</TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="ghost" size="icon-sm">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      render={<Link href={`/admin/elections/${election.id}`}>Edit</Link>}
                    />
                    {election.status === "draft" && (
                      <DropdownMenuItem onClick={() => publishMutation.mutate({ id: election.id })}>
                        Publish
                      </DropdownMenuItem>
                    )}
                    {election.status !== "draft" && election.status !== "closed" && (
                      <DropdownMenuItem onClick={() => closeMutation.mutate({ id: election.id })}>
                        Close
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setPendingDeleteId(election.id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="text-muted-foreground px-2 text-sm">
                Page {page} of {totalPages}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <Dialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete election?</DialogTitle>
            <DialogDescription>
              This permanently deletes the election and all of its candidates. This cannot be undone.
            </DialogDescription>
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
