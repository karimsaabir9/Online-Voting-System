import { redirect } from "next/navigation"

import { getServerSession } from "@/server/auth/get-session"
import { VoterNav } from "@/features/voting/components/voter-nav"

export default async function VoterLayout({
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
  if (session.user.role !== "voter") {
    redirect("/admin/dashboard")
  }

  return (
    <div className="flex flex-1 flex-col">
      <VoterNav />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}
