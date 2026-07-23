import Link from "next/link"
import { CheckCircle2, MailCheck } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string; error?: string }>
}) {
  const { verified, error } = await searchParams

  if (verified === "true" && !error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-green-600" />
            Email verified
          </CardTitle>
          <CardDescription>
            Your email has been verified. You can now log in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/login" />} nativeButton={false} className="w-full">
            Go to login
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailCheck className="size-5" />
          Check your email
        </CardTitle>
        <CardDescription>
          We sent a verification link to your email address. Click it to
          activate your account, then log in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          Don&apos;t see it? Check your spam or junk folder — verification emails
          can sometimes land there.
        </p>
      </CardContent>
    </Card>
  )
}
