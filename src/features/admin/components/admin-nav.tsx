"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, Vote } from "lucide-react"

import { ThemeToggle } from "@/components/shared/theme-toggle"
import { UserMenu } from "@/components/shared/user-menu"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/elections", label: "Elections" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/votes", label: "Votes" },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3 sm:gap-6">
        <Link
          href="/admin/dashboard"
          className="flex shrink-0 items-center gap-2 font-semibold"
        >
          <Vote className="size-5 shrink-0" />
          <span className="hidden sm:inline">Online Voting System</span>
        </Link>
        <nav className="hidden items-center gap-4 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={cn(
                "text-sm font-medium whitespace-nowrap",
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
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <ThemeToggle />
        <UserMenu />
        <Sheet>
          <SheetTrigger
            render={
              <Button variant="outline" size="icon" className="md:hidden">
                <Menu className="size-4" />
                <span className="sr-only">Open navigation menu</span>
              </Button>
            }
          />
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4">
              {NAV_LINKS.map((link) => (
                <SheetClose
                  key={link.label}
                  render={
                    <Link
                      href={link.href}
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm font-medium",
                        pathname.startsWith(link.href)
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    />
                  }
                >
                  {link.label}
                </SheetClose>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
