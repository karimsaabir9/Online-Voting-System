import { ShieldAlert } from "lucide-react"

import { getServerSession } from "@/server/auth/get-session"
import { LogoutButton } from "@/features/auth/components/logout-button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function SuspendedPage() {
  const session = await getServerSession()

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-destructive" />
            Account suspended
          </CardTitle>
          <CardDescription>
            {session?.user.email
              ? `The account for ${session.user.email} has been suspended.`
              : "This account has been suspended."}{" "}
            Please contact an administrator if you believe this is a mistake.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  )
}
