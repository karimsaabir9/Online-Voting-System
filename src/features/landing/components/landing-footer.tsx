import Link from "next/link"
import { Vote } from "lucide-react"

const FOOTER_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#security", label: "Security" },
  { href: "#faq", label: "FAQ" },
]

export function LandingFooter() {
  return (
    <footer className="border-t px-6 py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Vote className="size-5" />
            Online Voting System
          </Link>
          <p className="text-muted-foreground max-w-xs text-sm">
            Secure, transparent, and effortless elections for any organization.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-8 gap-y-2">
          {FOOTER_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="text-muted-foreground mx-auto mt-8 max-w-6xl border-t pt-6 text-xs">
        © {new Date().getFullYear()} Online Voting System. All rights reserved.
      </div>
    </footer>
  )
}
