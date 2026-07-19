"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { resetPasswordSchema, type ResetPasswordInput } from "@/schemas/auth"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

export function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  })

  async function onSubmit(values: ResetPasswordInput) {
    if (!token) {
      toast.error("Reset link is invalid or expired")
      return
    }

    setIsSubmitting(true)

    const { error } = await authClient.resetPassword({
      newPassword: values.password,
      token,
    })

    setIsSubmitting(false)

    if (error) {
      toast.error(error.message ?? "Could not reset password")
      return
    }

    toast.success("Password reset — log in with your new password")
    router.push("/login")
  }

  if (!token) {
    return (
      <p className="text-destructive text-sm">
        This reset link is invalid or has expired. Request a new one from
        the forgot password page.
      </p>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm new password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Resetting…" : "Reset password"}
        </Button>
      </form>
    </Form>
  )
}
