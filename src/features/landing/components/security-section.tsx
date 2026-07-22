import { Activity, Fingerprint, Lock, ShieldCheck } from "lucide-react"

const POINTS = [
  {
    icon: Lock,
    title: "Server-side validation",
    description:
      "Every vote is validated on the server — never trusted from the client — so results can't be tampered with.",
  },
  {
    icon: Fingerprint,
    title: "One vote, guaranteed",
    description:
      "A database-level constraint makes it structurally impossible to cast more than one vote per election.",
  },
  {
    icon: Activity,
    title: "Full activity trail",
    description:
      "Every election action is logged, giving administrators a clear, auditable history at all times.",
  },
  {
    icon: ShieldCheck,
    title: "Role-based access control",
    description:
      "Strict separation between admin and voter permissions, enforced at every layer of the application.",
  },
] as const

export function SecuritySection() {
  return (
    <section id="security" className="border-t px-6 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:items-center">
        <div className="space-y-4">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Security &amp; transparency, built in
          </h2>
          <p className="text-muted-foreground text-lg">
            Elections only matter if people trust the outcome. Every layer of this platform
            is designed to make results verifiable and tamper-resistant — not just fast.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {POINTS.map((point) => (
            <div key={point.title} className="space-y-2">
              <point.icon className="text-primary size-6" />
              <h3 className="font-semibold">{point.title}</h3>
              <p className="text-muted-foreground text-sm">{point.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
