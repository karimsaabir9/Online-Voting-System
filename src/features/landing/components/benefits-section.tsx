import { Clock, Globe, Leaf, TrendingUp } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const BENEFITS = [
  {
    icon: Clock,
    title: "Save time and cost",
    description:
      "No printing, no physical ballot boxes, no manual counting — results in seconds, not days.",
  },
  {
    icon: Globe,
    title: "Vote from anywhere",
    description: "Voters can participate from any device, anywhere — no need to be physically present.",
  },
  {
    icon: TrendingUp,
    title: "Higher participation",
    description: "Removing friction from voting consistently leads to stronger voter turnout.",
  },
  {
    icon: Leaf,
    title: "Environmentally friendly",
    description: "Fully digital elections mean zero paper waste and a smaller environmental footprint.",
  },
] as const

export function BenefitsSection() {
  return (
    <section className="bg-muted/30 border-t px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl space-y-12">
        <div className="mx-auto max-w-2xl space-y-3 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Why organizations choose us
          </h2>
          <p className="text-muted-foreground text-lg">
            A better way to run elections — for administrators and voters alike.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((benefit) => (
            <Card key={benefit.title} className="bg-background">
              <CardHeader>
                <benefit.icon className="text-primary size-6" />
                <CardTitle className="text-base">{benefit.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {benefit.description}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
