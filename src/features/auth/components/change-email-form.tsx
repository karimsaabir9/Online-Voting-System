"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { changeEmailSchema, type ChangeEmailInput } from "@/schemas/auth"
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

export function ChangeEmailForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const form = useForm<ChangeEmailInput>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { newEmail: "" },
  })

  async function onSubmit(values: ChangeEmailInput) {
    setIsSubmitting(true)

    const { error } = await authClient.changeEmail({ newEmail: values.newEmail })

    setIsSubmitting(false)

    if (error) {
      toast.error(error.message ?? "Could not request email change")
      return
    }

    setSent(true)
    form.reset()
  }

  if (sent) {
    return (
      <p className="text-muted-foreground text-sm">
        Check your current email address for a confirmation link to finish changing your
        email.
      </p>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="newEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New email address</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Requesting…" : "Change email"}
        </Button>
      </form>
    </Form>
  )
}
