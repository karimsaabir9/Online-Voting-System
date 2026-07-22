import { CheckCircle2, ListChecks, UserPlus, Vote } from "lucide-react"

const STEPS = [
  {
    icon: UserPlus,
    title: "Create your account",
    description:
      "Register with your email and verify it to get started — takes less than a minute.",
  },
  {
    icon: ListChecks,
    title: "Browse open elections",
    description:
      "See every election you're eligible for, with candidate profiles and clear instructions.",
  },
  {
    icon: Vote,
    title: "Cast your vote",
    description: "Choose your candidate and submit — your vote is recorded securely and immutably.",
  },
  {
    icon: CheckCircle2,
    title: "See the results",
    description: "Once results are published, view rankings, turnout, and the outcome instantly.",
  },
] as const

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="bg-muted/30 border-t px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl space-y-12">
        <div className="mx-auto max-w-2xl space-y-3 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">How it works</h2>
          <p className="text-muted-foreground text-lg">
            From registration to results, in four simple steps.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <div key={step.title} className="space-y-3 text-center">
              <div className="bg-primary text-primary-foreground mx-auto flex size-14 items-center justify-center rounded-full">
                <step.icon className="size-6" />
              </div>
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                Step {index + 1}
              </p>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="text-muted-foreground text-sm">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
