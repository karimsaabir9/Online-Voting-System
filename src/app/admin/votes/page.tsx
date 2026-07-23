import { VotesTable } from "@/features/votes/components/votes-table"

export default function AdminVotesPage() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Votes</h1>
      <VotesTable />
    </div>
  )
}
