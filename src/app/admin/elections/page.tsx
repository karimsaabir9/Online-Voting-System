import Link from "next/link"
import { Plus } from "lucide-react"

import { ElectionsTable } from "@/features/elections/components/elections-table"
import { Button } from "@/components/ui/button"

export default function AdminElectionsPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Elections</h1>
        <Button render={<Link href="/admin/elections/new" />} nativeButton={false}>
          <Plus className="size-4" />
          New Election
        </Button>
      </div>
      <ElectionsTable />
    </div>
  )
}
