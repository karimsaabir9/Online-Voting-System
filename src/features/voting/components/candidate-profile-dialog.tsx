"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"

type Candidate = {
  fullName: string
  biography: string | null
  politicalParty: string | null
  position: string | null
  manifesto: string | null
  education: string | null
  experience: string | null
  campaignMessage: string | null
  socialLinks: {
    website?: string
    twitter?: string
    facebook?: string
    instagram?: string
    linkedin?: string
  } | null
}

type CandidateProfileDialogProps = {
  candidate: Candidate
  open: boolean
  onOpenChange: (open: boolean) => void
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-muted-foreground text-sm whitespace-pre-wrap">{value}</p>
    </div>
  )
}

export function CandidateProfileDialog({
  candidate,
  open,
  onOpenChange,
}: CandidateProfileDialogProps) {
  const socialEntries = candidate.socialLinks
    ? Object.entries(candidate.socialLinks).filter(([, url]) => url)
    : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{candidate.fullName}</DialogTitle>
          <DialogDescription>
            {[candidate.politicalParty, candidate.position].filter(Boolean).join(" · ")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Biography" value={candidate.biography} />
          <Field label="Manifesto" value={candidate.manifesto} />
          <Field label="Education" value={candidate.education} />
          <Field label="Experience" value={candidate.experience} />
          <Field label="Campaign message" value={candidate.campaignMessage} />
          {socialEntries.length > 0 && (
            <>
              <Separator />
              <div className="flex flex-wrap gap-3">
                {socialEntries.map(([platform, url]) => (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary text-sm capitalize underline underline-offset-4"
                  >
                    {platform}
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
