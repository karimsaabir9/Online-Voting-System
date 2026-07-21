"use client"

import * as React from "react"
import { Search } from "lucide-react"

import { trpc } from "@/lib/trpc/client"
import { ElectionCard } from "@/features/voting/components/election-card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { EffectiveElectionStatus } from "@/lib/election-status"

function groupByStatus<T extends { effectiveStatus: EffectiveElectionStatus }>(items: T[]) {
  return {
    active: items.filter((e) => e.effectiveStatus === "active"),
    upcoming: items.filter((e) => e.effectiveStatus === "upcoming"),
    past: items.filter((e) => e.effectiveStatus === "ended" || e.effectiveStatus === "closed"),
  }
}

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "upcoming", label: "Upcoming" },
  { value: "active", label: "Active" },
  { value: "ended", label: "Ended" },
  { value: "closed", label: "Closed" },
] as const

export default function VoterElectionsPage() {
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState<(typeof STATUS_OPTIONS)[number]["value"]>("all")

  const { data, isLoading } = trpc.voting.listElections.useQuery()

  if (isLoading) {
    return <p className="text-muted-foreground p-6 text-sm">Loading elections…</p>
  }

  if (!data || data.length === 0) {
    return <p className="text-muted-foreground p-6 text-sm">No elections available yet.</p>
  }

  const filtered = data.filter((election) => {
    const matchesSearch = election.title.toLowerCase().includes(search.trim().toLowerCase())
    const matchesStatus = status === "all" || election.effectiveStatus === status
    return matchesSearch && matchesStatus
  })

  const { active, upcoming, past } = groupByStatus(filtered)

  return (
    <div className="space-y-8 p-6">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            placeholder="Search by title…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as (typeof STATUS_OPTIONS)[number]["value"])}
        >
          <SelectTrigger className="w-full sm:w-48">
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

      {filtered.length === 0 && (
        <p className="text-muted-foreground text-sm">No elections match your filters.</p>
      )}

      {active.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Active Elections</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((election) => (
              <ElectionCard key={election.id} election={election} />
            ))}
          </div>
        </section>
      )}
      {upcoming.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Upcoming Elections</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((election) => (
              <ElectionCard key={election.id} election={election} />
            ))}
          </div>
        </section>
      )}
      {past.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Past Elections</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((election) => (
              <ElectionCard key={election.id} election={election} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
