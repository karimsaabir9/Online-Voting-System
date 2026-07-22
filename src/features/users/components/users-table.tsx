"use client"

import * as React from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { toast } from "sonner"

import { trpc } from "@/lib/trpc/client"
import { authClient } from "@/lib/auth-client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const ROLE_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "admin", label: "Admin" },
  { value: "voter", label: "Voter" },
] as const

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
] as const

export function UsersTable() {
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState("")
  const [role, setRole] = React.useState<(typeof ROLE_OPTIONS)[number]["value"]>("all")
  const [status, setStatus] = React.useState<(typeof STATUS_OPTIONS)[number]["value"]>("all")
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null)
  const pageSize = 10

  const { data: session } = authClient.useSession()
  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.users.list.useQuery({
    page,
    pageSize,
    search: search.trim() || undefined,
    role,
    status,
  })

  const deleteMutation = trpc.users.remove.useMutation({
    onSuccess: async () => {
      await utils.users.list.invalidate()
      toast.success("User deleted")
      setPendingDeleteId(null)
    },
    onError: (error) => {
      toast.error(error.message)
      setPendingDeleteId(null)
    },
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1
  const pendingDeleteUser = data?.items.find((item) => item.id === pendingDeleteId)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            placeholder="Search by name or email…"
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <Select
          value={role}
          onValueChange={(value) => {
            setRole(value as (typeof ROLE_OPTIONS)[number]["value"])
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as (typeof STATUS_OPTIONS)[number]["value"])
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Loading users…</p>}

      {!isLoading && (!data || data.items.length === 0) && (
        <p className="text-muted-foreground text-sm">No users match your filters.</p>
      )}

      {!isLoading && data && data.items.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => {
                const isSelf = item.id === session?.user.id

                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link
                        href={`/admin/users/${item.id}`}
                        className="font-medium hover:underline"
                      >
                        {item.name}
                      </Link>
                    </TableCell>
                    <TableCell>{item.email}</TableCell>
                    <TableCell>
                      <Badge variant={item.role === "admin" ? "default" : "outline"}>
                        {item.role === "admin" ? "Admin" : "Voter"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.status === "active" ? "default" : "destructive"}>
                        {item.status === "active" ? "Active" : "Suspended"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isSelf}
                        title={isSelf ? "You cannot delete your own account" : undefined}
                        onClick={() => setPendingDeleteId(item.id)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
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
                    className={
                      page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      )}

      <Dialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete user?</DialogTitle>
            <DialogDescription>
              {pendingDeleteUser
                ? `This permanently deletes "${pendingDeleteUser.name}" (${pendingDeleteUser.email}). This cannot be undone.`
                : "This permanently deletes the user. This cannot be undone."}
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
