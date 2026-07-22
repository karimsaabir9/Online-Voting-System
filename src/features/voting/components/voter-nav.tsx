"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Vote } from "lucide-react"

import { ThemeToggle } from "@/components/shared/theme-toggle"
import { LogoutButton } from "@/features/auth/components/logout-button"
import { NotificationBell } from "@/features/notifications/components/notification-bell"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { href: "/voter/dashboard", label: "Dashboard" },
  { href: "/voter/elections", label: "Elections" },
  { href: "/voter/votes", label: "My Votes" },
  { href: "/settings", label: "Settings" },
]

export function VoterNav() {
  const pathname = usePathname()

  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      <div className="flex items-center gap-6">
        <Link href="/voter/dashboard" className="flex items-center gap-2 font-semibold">
          <Vote className="size-5" />
          Online Voting System
        </Link>
        <nav className="flex items-center gap-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium",
                pathname.startsWith(link.href)
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <NotificationBell />
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  )
}
