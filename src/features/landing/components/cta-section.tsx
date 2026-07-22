import Link from "next/link"
import { Mail } from "lucide-react"

import { Button } from "@/components/ui/button"

export function CtaSection() {
  return (
    <section className="border-t px-6 py-20 sm:py-28">
      <div className="bg-muted/30 mx-auto flex max-w-4xl flex-col items-center gap-6 rounded-2xl border p-10 text-center sm:p-16">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Ready to run your next election?
        </h2>
        <p className="text-muted-foreground max-w-xl text-lg">
          Create an account and set up your first election in minutes — no paperwork, no
          hassle.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button size="lg" render={<Link href="/register" />} nativeButton={false}>
            Create your account
          </Button>
          <Button
            size="lg"
            variant="outline"
            render={<a href="mailto:support@example.com" />}
            nativeButton={false}
          >
            <Mail className="size-4" />
            Contact us
          </Button>
        </div>
      </div>
    </section>
  )
}
