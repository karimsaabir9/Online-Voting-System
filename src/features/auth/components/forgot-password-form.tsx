"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { forgotPasswordSchema, type ForgotPasswordInput } from "@/schemas/auth"
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

export function ForgotPasswordForm() {
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  })

  async function onSubmit(values: ForgotPasswordInput) {
    setIsSubmitting(true)

    const { error } = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: "/reset-password",
    })

    setIsSubmitting(false)

    if (error) {
      toast.error(error.message ?? "Could not send reset email")
      return
    }

    setIsSubmitted(true)
  }

  if (isSubmitted) {
    return (
      <p className="text-muted-foreground text-sm">
        If an account exists for that email, a password reset link has been
        sent.
      </p>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </Form>
  )
}
