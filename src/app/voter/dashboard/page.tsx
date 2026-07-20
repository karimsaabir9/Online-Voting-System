import Link from "next/link"
import { History, Vote } from "lucide-react"

import { getServerSession } from "@/server/auth/get-session"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default async function VoterDashboardPage() {
  const session = await getServerSession()

  return (
    <div className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {session?.user.name}</h1>
        <p className="text-muted-foreground text-sm">{session?.user.email}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Vote className="size-5" />
              Elections
            </CardTitle>
            <CardDescription>Browse active and upcoming elections.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link href="/voter/elections" />}>Browse elections</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="size-5" />
              My Votes
            </CardTitle>
            <CardDescription>Review the elections you&apos;ve voted in.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" render={<Link href="/voter/votes" />}>
              View voting history
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
