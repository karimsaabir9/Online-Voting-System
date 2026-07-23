"use client"

import { useState } from "react"
import {
  CalendarClock,
  CheckCircle2,
  Download,
  Fingerprint,
  Landmark,
  Loader2,
  Vote as VoteIcon,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { generateVoteConfirmationPdf } from "@/features/voting/lib/generate-vote-confirmation-pdf"

type VoteConfirmationModalProps = {
  vote: {
    id: string
    votedAt: Date
    election: { title: string }
    candidate: {
      fullName: string
      photoUrl: string | null
      politicalParty: string | null
      position: string | null
    }
  }
  open: boolean
  onOpenChange: (open: boolean) => void
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-sm font-medium break-words text-foreground">{value}</p>
      </div>
    </div>
  )
}

export function VoteConfirmationModal({ vote, open, onOpenChange }: VoteConfirmationModalProps) {
  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      await generateVoteConfirmationPdf({
        confirmationId: vote.id,
        candidateFullName: vote.candidate.fullName,
        candidatePhotoUrl: vote.candidate.photoUrl,
        politicalParty: vote.candidate.politicalParty,
        position: vote.candidate.position,
        electionTitle: vote.election.title,
        votedAt: vote.votedAt,
      })
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <Avatar size="lg" className="size-20">
            <AvatarImage
              src={vote.candidate.photoUrl ?? undefined}
              alt={vote.candidate.fullName}
            />
            <AvatarFallback className="text-lg">
              {vote.candidate.fullName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <DialogTitle className="text-lg">{vote.candidate.fullName}</DialogTitle>
          <DialogDescription>
            {[vote.candidate.politicalParty, vote.candidate.position]
              .filter(Boolean)
              .join(" · ") || "Candidate"}
          </DialogDescription>
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="size-3" />
            Vote Confirmed
          </Badge>
        </DialogHeader>

        <Separator />

        <div className="space-y-4">
          <DetailRow icon={VoteIcon} label="Election" value={vote.election.title} />
          <DetailRow
            icon={Landmark}
            label="Position contested"
            value={vote.candidate.position ?? "Not specified"}
          />
          <DetailRow
            icon={CalendarClock}
            label="Date & time cast"
            value={vote.votedAt.toLocaleString(undefined, {
              dateStyle: "long",
              timeStyle: "short",
            })}
          />
          <DetailRow icon={Fingerprint} label="Vote confirmation ID" value={vote.id} />
        </div>

        <Separator />

        <Button
          onClick={handleDownload}
          disabled={isDownloading}
          className="w-full"
        >
          {isDownloading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Download />
          )}
          Download PDF
        </Button>
      </DialogContent>
    </Dialog>
  )
}
