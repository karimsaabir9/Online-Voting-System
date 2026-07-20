import Link from "next/link"
import { redirect } from "next/navigation"
import { Vote } from "lucide-react"

import { getServerSession } from "@/server/auth/get-session"

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession()

  if (session && session.user.status === "active") {
    redirect(
      session.user.role === "admin" ? "/admin/dashboard" : "/voter/dashboard"
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <Vote className="size-5" />
        Online Voting System
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
