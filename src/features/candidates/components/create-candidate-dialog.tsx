"use client"

import * as React from "react"
import { Plus } from "lucide-react"

import { CandidateForm } from "@/features/candidates/components/candidate-form"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function CreateCandidateDialog({ electionId }: { electionId: string }) {
  const [open, setOpen] = React.useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" />
        Add candidate
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New candidate</DialogTitle>
          <DialogDescription>
            Fill in the details below to add a candidate to this election.
          </DialogDescription>
        </DialogHeader>
        <CandidateForm
          electionId={electionId}
          onSuccess={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
