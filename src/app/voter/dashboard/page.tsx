import { getServerSession } from "@/server/auth/get-session"
import { VoterDashboardContent } from "@/features/dashboard/components/voter-dashboard-content"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export default async function VoterDashboardPage() {
  const session = await getServerSession()

  const name = session?.user.name ?? ""
  const initials =
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U"

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 space-y-8 p-6 sm:p-8">
      <div className="flex items-center gap-4">
        <Avatar size="lg" className="size-16">
          <AvatarImage src={session?.user.image ?? undefined} alt={name} />
          <AvatarFallback className="text-lg font-semibold">{initials}</AvatarFallback>
        </Avatar>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome, {session?.user.name}</h1>
          <p className="text-muted-foreground text-sm">{session?.user.email}</p>
        </div>
      </div>
      <VoterDashboardContent />
    </div>
  )
}
