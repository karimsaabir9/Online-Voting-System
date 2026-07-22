import Link from "next/link"
import { CheckCircle2, ChevronLeft, Mail, Shield, User as UserIcon, XCircle } from "lucide-react"
import { redirect } from "next/navigation"

import { getServerSession } from "@/server/auth/get-session"
import { ChangePasswordForm } from "@/features/auth/components/change-password-form"
import { ProfileForm } from "@/features/auth/components/profile-form"
import { ChangeEmailForm } from "@/features/auth/components/change-email-form"
import { ResendVerificationButton } from "@/features/auth/components/resend-verification-button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type SettingsTab = "profile" | "email" | "security"

const VALID_TABS: SettingsTab[] = ["profile", "email", "security"]

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const session = await getServerSession()

  if (!session || session.user.status !== "active") {
    redirect("/login")
  }

  const { tab } = await searchParams
  const activeTab: SettingsTab = VALID_TABS.includes(tab as SettingsTab)
    ? (tab as SettingsTab)
    : "profile"

  const { user } = session
  const dashboardHref = user.role === "admin" ? "/admin/dashboard" : "/voter/dashboard"
  const initials =
    user.name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U"

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 p-6 sm:p-8">
      <div className="space-y-6">
        <Link
          href={dashboardHref}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium transition-colors"
        >
          <ChevronLeft className="size-4" />
          Back to dashboard
        </Link>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm">
            Manage your profile, email, and account security.
          </p>
        </div>
      </div>

      <Separator />

      <Tabs defaultValue={activeTab}>
        <TabsList variant="line" className="h-auto w-full justify-start border-b p-0">
          <TabsTrigger value="profile" className="gap-1.5 px-3 py-2">
            <UserIcon className="size-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-1.5 px-3 py-2">
            <Mail className="size-4" />
            Email
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5 px-3 py-2">
            <Shield className="size-4" />
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6 space-y-6">
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <Avatar size="lg" className="size-16">
                <AvatarImage src={user.image ?? undefined} alt={user.name} />
                <AvatarFallback className="text-lg font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold">{user.name}</p>
                  <Badge variant={user.role === "admin" ? "default" : "outline"}>
                    {user.role === "admin" ? "Admin" : "Voter"}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-sm">{user.email}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Edit profile</CardTitle>
              <CardDescription>Update your profile picture and name.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm name={user.name} image={user.image ?? null} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Email address</CardTitle>
              <CardDescription>The email associated with your account.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium">{user.email}</span>
                {user.emailVerified ? (
                  <Badge variant="default" className="gap-1 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3.5" />
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="size-3.5" />
                    Not verified
                  </Badge>
                )}
              </div>
              {!user.emailVerified && <ResendVerificationButton email={user.email} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Change email</CardTitle>
              <CardDescription>
                Change the email for {user.email}. You&apos;ll need to confirm from your
                current address.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChangeEmailForm />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Change password</CardTitle>
              <CardDescription>Update the password for {user.email}.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
