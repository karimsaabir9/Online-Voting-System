import { UserDetail } from "@/features/users/components/user-detail"

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <UserDetail userId={userId} />
    </div>
  )
}
