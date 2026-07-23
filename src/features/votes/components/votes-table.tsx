"use client"

import * as React from "react"
import { CheckCircle2, Search } from "lucide-react"

import { trpc } from "@/lib/trpc/client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

export function VotesTable() {
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState("")
  const [electionId, setElectionId] = React.useState("all")
  const [dateFrom, setDateFrom] = React.useState("")
  const [dateTo, setDateTo] = React.useState("")
  const pageSize = 10

  const { data: electionOptions } = trpc.votes.electionOptions.useQuery()
  const { data, isLoading } = trpc.votes.list.useQuery({
    page,
    pageSize,
    search: search.trim() || undefined,
    electionId,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="relative flex-1 sm:min-w-56">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            placeholder="Search by voter, email, or candidate…"
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <Select
          value={electionId}
          onValueChange={(value) => {
            setElectionId(value ?? "all")
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All elections</SelectItem>
            {electionOptions?.map((election) => (
              <SelectItem key={election.id} value={election.id}>
                {election.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="votes-date-from" className="text-muted-foreground text-xs">
              From
            </Label>
            <Input
              id="votes-date-from"
              type="date"
              className="w-full sm:w-36"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="votes-date-to" className="text-muted-foreground text-xs">
              To
            </Label>
            <Input
              id="votes-date-to"
              type="date"
              className="w-full sm:w-36"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(1)
              }}
            />
          </div>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Loading votes…</p>}

      {!isLoading && (!data || data.items.length === 0) && (
        <p className="text-muted-foreground text-sm">No votes match your filters.</p>
      )}

      {!isLoading && data && data.items.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Voter</TableHead>
                <TableHead>Candidate</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Election</TableHead>
                <TableHead>Voted at</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <p className="font-medium">{item.voterName}</p>
                    <p className="text-muted-foreground text-xs">{item.voterEmail}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar size="sm">
                        <AvatarImage
                          src={item.candidatePhotoUrl ?? undefined}
                          alt={item.candidateFullName}
                        />
                        <AvatarFallback>
                          {item.candidateFullName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span>{item.candidateFullName}</span>
                    </div>
                  </TableCell>
                  <TableCell>{item.candidateParty ?? "—"}</TableCell>
                  <TableCell>{item.candidatePosition ?? "—"}</TableCell>
                  <TableCell>{item.electionTitle}</TableCell>
                  <TableCell>{item.votedAt.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="size-3" />
                      Confirmed
                    </Badge>
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
    </div>
  )
}
