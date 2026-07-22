import { ElectionsTable } from "@/features/elections/components/elections-table"
import { CreateElectionDialog } from "@/features/elections/components/create-election-dialog"

export default function AdminElectionsPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Elections</h1>
        <CreateElectionDialog />
      </div>
      <ElectionsTable />
    </div>
  )
}
