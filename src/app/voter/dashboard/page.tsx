import { getServerSession } from "@/server/auth/get-session"
import { LogoutButton } from "@/features/auth/components/logout-button"

export default async function VoterDashboardPage() {
  const session = await getServerSession()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Voter dashboard</h1>
      <p className="text-muted-foreground">
        Signed in as {session?.user.name} ({session?.user.email})
      </p>
      <LogoutButton />
    </div>
  )
}
