import { ElectionForm } from "@/features/elections/components/election-form"

export default function NewElectionPage() {
  return (
    <div className="max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">New election</h1>
      <ElectionForm />
    </div>
  )
}
