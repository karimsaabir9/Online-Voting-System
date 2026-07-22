"use client"

import { useState } from "react"
import { toast } from "sonner"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"

type ResendVerificationButtonProps = {
  email: string
}

export function ResendVerificationButton({ email }: ResendVerificationButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleResend() {
    setIsSubmitting(true)

    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/verify-email?verified=true",
    })

    setIsSubmitting(false)

    if (error) {
      toast.error(error.message ?? "Could not send verification email")
      return
    }

    setSent(true)
    toast.success("Verification email sent")
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isSubmitting || sent}
      onClick={handleResend}
    >
      {sent ? "Verification email sent" : isSubmitting ? "Sending…" : "Resend verification email"}
    </Button>
  )
}
