import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { redirect } from "next/navigation"

import { getServerSession } from "@/server/auth/get-session"
import { ChangePasswordForm } from "@/features/auth/components/change-password-form"
import { ProfileForm } from "@/features/auth/components/profile-form"
import { ChangeEmailForm } from "@/features/auth/components/change-email-form"
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

  const dashboardHref =
    session.user.role === "admin" ? "/admin/dashboard" : "/voter/dashboard"

  return (
    <div className="mx-auto w-full max-w-md space-y-6 p-6">
      <Link
        href={dashboardHref}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium"
      >
        <ChevronLeft className="size-4" />
        Back to dashboard
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your name and avatar.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm name={session.user.name} image={session.user.image ?? null} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Email address</CardTitle>
          <CardDescription>
            Change the email for {session.user.email}. You&apos;ll need to confirm from
            your current address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangeEmailForm />
        </CardContent>
      </Card>
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
