import { CheckCircle2 } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function VoteConfirmationCard({
  candidateName,
  votedAt,
}: {
  candidateName: string
  votedAt: Date
}) {
  return (
    <Card className="border-green-600/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-green-600" />
          Vote recorded
        </CardTitle>
        <CardDescription>
          You voted for <span className="font-medium">{candidateName}</span> on{" "}
          {votedAt.toLocaleString()}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">Votes cannot be changed once cast.</p>
      </CardContent>
    </Card>
  )
}
