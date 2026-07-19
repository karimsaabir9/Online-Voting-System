import { redirect } from "next/navigation"

import { getServerSession } from "@/server/auth/get-session"
import { ChangePasswordForm } from "@/features/auth/components/change-password-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function SettingsPage() {
  const session = await getServerSession()

  if (!session || session.user.status !== "active") {
    redirect("/login")
  }

  return (
    <div className="mx-auto w-full max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Update the password for {session.user.email}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  )
}
