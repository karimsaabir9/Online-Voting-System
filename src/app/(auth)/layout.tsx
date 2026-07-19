import Link from "next/link"
import { Vote } from "lucide-react"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <Vote className="size-5" />
        Online Voting System
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
