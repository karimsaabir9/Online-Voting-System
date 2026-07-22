import Link from "next/link"
import { redirect } from "next/navigation"
import { Vote } from "lucide-react"

import { ThemeToggle } from "@/components/shared/theme-toggle"
import { HealthStatus } from "@/features/dashboard/components/health-status"
import { Button } from "@/components/ui/button"
import { getServerSession } from "@/server/auth/get-session"

export default async function Home() {
  const session = await getServerSession()

  if (session && session.user.status === "active") {
    redirect(
      session.user.role === "admin" ? "/admin/dashboard" : "/voter/dashboard"
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2 font-semibold">
          <Vote className="size-5" />
          Online Voting System
        </div>
        <div className="flex items-center gap-2">
          <Button render={<Link href="/login" />} nativeButton={false} variant="outline">
            Log in
          </Button>
          <Button render={<Link href="/register" />} nativeButton={false}>
            Register
          </Button>
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Secure, transparent voting — online.
        </h1>
        <p className="text-muted-foreground max-w-md text-sm">
          Register as a voter or log in to view active elections and cast
          your vote.
        </p>
        <HealthStatus />
      </main>
    </div>
  );
}
