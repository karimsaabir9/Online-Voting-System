import { CandidateForm } from "@/features/candidates/components/candidate-form"

export default async function NewCandidatePage({
  params,
}: {
  params: Promise<{ electionId: string }>
}) {
  const { electionId } = await params

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">New candidate</h1>
      <CandidateForm electionId={electionId} />
    </div>
  )
}
