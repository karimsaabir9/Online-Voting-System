import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const FAQS = [
  {
    question: "Who can create and manage elections?",
    answer:
      "Only administrators can create, publish, and manage elections and candidates. Voters can browse open elections and cast ballots, but cannot modify election data.",
  },
  {
    question: "Can I change my vote after submitting it?",
    answer:
      "No. Once a vote is cast, it is permanent and cannot be changed or withdrawn — this is enforced at the database level to preserve election integrity.",
  },
  {
    question: "How do I know the results are accurate?",
    answer:
      "Results are calculated automatically from the recorded votes using a single, consistent tallying process — the same numbers are shown to administrators and voters alike, with no manual intervention.",
  },
  {
    question: "Is my vote anonymous to other voters?",
    answer:
      "Yes. Only you can see which candidate you voted for. Administrators can confirm whether you participated in an election, but never which candidate you chose.",
  },
  {
    question: "What happens if an election is closed early?",
    answer:
      "Administrators can close an election at any time. Once closed, no further votes can be cast, and the election moves straight to the results stage.",
  },
] as const

export function FaqSection() {
  return (
    <section id="faq" className="border-t px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl space-y-12">
        <div className="space-y-3 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Frequently asked questions
          </h2>
          <p className="text-muted-foreground text-lg">
            Everything you need to know before you get started.
          </p>
        </div>
        <Accordion>
          {FAQS.map((faq) => (
            <AccordionItem key={faq.question} value={faq.question}>
              <AccordionTrigger>{faq.question}</AccordionTrigger>
              <AccordionContent>{faq.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
