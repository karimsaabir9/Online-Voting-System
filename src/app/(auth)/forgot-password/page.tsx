import Link from "next/link"

import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot password</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a reset link.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ForgotPasswordForm />
        <div className="text-center text-sm">
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            Back to login
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
