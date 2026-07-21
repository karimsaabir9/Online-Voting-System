import { redirect } from "next/navigation"

import { getServerSession } from "@/server/auth/get-session"
import { AdminNav } from "@/features/admin/components/admin-nav"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }
  if (session.user.status !== "active") {
    redirect("/suspended")
  }
  if (session.user.role !== "admin") {
    redirect("/voter/dashboard")
  }

  return (
    <div className="flex flex-1 flex-col">
      <AdminNav />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}
