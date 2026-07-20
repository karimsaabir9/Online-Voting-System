"use client"

import { useState } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CandidateProfileDialog } from "./candidate-profile-dialog"

type Candidate = {
  id: string
  fullName: string
  photoUrl: string | null
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
  status: "active" | "withdrawn"
}

export function CandidateCard({ candidate }: { candidate: Candidate }) {
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
        <Avatar className="size-20">
          <AvatarImage src={candidate.photoUrl ?? undefined} alt={candidate.fullName} />
          <AvatarFallback>{candidate.fullName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <p className="flex items-center justify-center gap-2 font-semibold">
            {candidate.fullName}
            {candidate.status === "withdrawn" && <Badge variant="outline">Withdrawn</Badge>}
          </p>
          {candidate.politicalParty && (
            <p className="text-muted-foreground text-sm">{candidate.politicalParty}</p>
          )}
          {candidate.position && (
            <p className="text-muted-foreground text-sm">{candidate.position}</p>
          )}
        </div>
        {candidate.biography && (
          <p className="text-muted-foreground line-clamp-3 text-sm">{candidate.biography}</p>
        )}
        <Button variant="outline" size="sm" onClick={() => setIsProfileOpen(true)}>
          View full profile
        </Button>
      </CardContent>
      <CandidateProfileDialog
        candidate={candidate}
        open={isProfileOpen}
        onOpenChange={setIsProfileOpen}
      />
    </Card>
  )
}
