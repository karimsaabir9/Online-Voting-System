import { BarChart3, Bell, LayoutDashboard, ShieldCheck, UserCircle, Vote } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: "Role-based dashboards",
    description:
      "Separate, purpose-built dashboards for administrators and voters, each showing exactly what they need.",
  },
  {
    icon: Vote,
    title: "Effortless election management",
    description:
      "Create, schedule, and publish elections in minutes, with full control over visibility and voting rules.",
  },
  {
    icon: UserCircle,
    title: "Rich candidate profiles",
    description:
      "Give every candidate a complete profile — photo, biography, platform, and campaign links — for informed voting.",
  },
  {
    icon: ShieldCheck,
    title: "One person, one vote",
    description:
      "Every vote is validated and enforced server-side, guaranteeing exactly one ballot per voter, per election.",
  },
  {
    icon: BarChart3,
    title: "Real-time results",
    description:
      "Automatic tallying, rankings, and turnout analytics — published the moment an election closes.",
  },
  {
    icon: Bell,
    title: "Instant notifications",
    description:
      "Voters are notified the moment results are published for elections they participated in.",
  },
] as const

export function FeaturesSection() {
  return (
    <section id="features" className="border-t px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl space-y-12">
        <div className="mx-auto max-w-2xl space-y-3 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Everything an election needs
          </h2>
          <p className="text-muted-foreground text-lg">
            Purpose-built tools for running fair, transparent, and stress-free elections.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <div className="bg-primary/10 text-primary mb-2 flex size-10 items-center justify-center rounded-lg">
                  <feature.icon className="size-5" />
                </div>
                <CardTitle>{feature.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {feature.description}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
