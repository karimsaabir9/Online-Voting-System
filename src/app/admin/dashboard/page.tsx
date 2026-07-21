import { getServerSession } from "@/server/auth/get-session"
import { AdminDashboardStats } from "@/features/dashboard/components/admin-dashboard-stats"

export default async function AdminDashboardPage() {
  const session = await getServerSession()

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Signed in as {session?.user.name} ({session?.user.email})
        </p>
      </div>
      <AdminDashboardStats />
    </div>
  )
}
