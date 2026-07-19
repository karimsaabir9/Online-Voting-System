import { redirect } from "next/navigation"

import { getServerSession } from "@/server/auth/get-session"

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
    redirect("/login?error=suspended")
  }
  if (session.user.role !== "admin") {
    redirect("/voter/dashboard")
  }

  return <>{children}</>
}
