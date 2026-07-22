import Link from "next/link"
import { ShieldCheck, Vote } from "lucide-react"

import { Button } from "@/components/ui/button"

export function HeroSection() {
  return (
    <section className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-20 text-center sm:py-28">
      <div className="bg-muted text-muted-foreground inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium">
        <ShieldCheck className="size-3.5" />
        Trusted, secure, and transparent elections
      </div>
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl md:text-6xl">
        Vote with confidence, anywhere.
      </h1>
      <p className="text-muted-foreground max-w-2xl text-lg text-balance">
        A modern online voting platform built for organizations that need secure,
        auditable, and effortless elections — from campus clubs to company boards.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" render={<Link href="/register" />} nativeButton={false}>
          <Vote className="size-4" />
          Get started free
        </Button>
        <Button
          size="lg"
          variant="outline"
          render={<a href="#how-it-works" />}
          nativeButton={false}
        >
          See how it works
        </Button>
      </div>
    </section>
  )
}
