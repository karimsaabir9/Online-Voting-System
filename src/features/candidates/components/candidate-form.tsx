"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import {
  createCandidateSchema,
  candidateStatusValues,
  type CreateCandidateInput,
} from "@/schemas/candidate"
import { trpc } from "@/lib/trpc/client"
import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

type CandidateFormProps = {
  electionId: string
  candidate?: {
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
  onSuccess?: () => void
  onCancel?: () => void
}

export function CandidateForm({ electionId, candidate, onSuccess, onCancel }: CandidateFormProps) {
  const router = useRouter()
  const utils = trpc.useUtils()

  const form = useForm<CreateCandidateInput>({
    resolver: zodResolver(createCandidateSchema),
    defaultValues: {
      electionId,
      fullName: candidate?.fullName ?? "",
      photoUrl: candidate?.photoUrl ?? "",
      biography: candidate?.biography ?? "",
      politicalParty: candidate?.politicalParty ?? "",
      position: candidate?.position ?? "",
      manifesto: candidate?.manifesto ?? "",
      education: candidate?.education ?? "",
      experience: candidate?.experience ?? "",
      campaignMessage: candidate?.campaignMessage ?? "",
      socialLinks: {
        website: candidate?.socialLinks?.website ?? "",
        twitter: candidate?.socialLinks?.twitter ?? "",
        facebook: candidate?.socialLinks?.facebook ?? "",
        instagram: candidate?.socialLinks?.instagram ?? "",
        linkedin: candidate?.socialLinks?.linkedin ?? "",
      },
      status: candidate?.status ?? "active",
    },
  })

  const createMutation = trpc.candidates.create.useMutation({
    onSuccess: async () => {
      await utils.candidates.list.invalidate({ electionId })
      toast.success("Candidate created")
      if (onSuccess) {
        onSuccess()
      } else {
        router.push(`/admin/elections/${electionId}/candidates`)
      }
    },
    onError: (error) => toast.error(error.message),
  })

  const updateMutation = trpc.candidates.update.useMutation({
    onSuccess: async () => {
      await utils.candidates.list.invalidate({ electionId })
      if (candidate) await utils.candidates.getById.invalidate({ id: candidate.id })
      toast.success("Candidate updated")
      router.refresh()
    },
    onError: (error) => toast.error(error.message),
  })

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  function onSubmit(values: CreateCandidateInput) {
    if (candidate) {
      updateMutation.mutate({ ...values, id: candidate.id })
    } else {
      createMutation.mutate(values)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="photoUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Photo</FormLabel>
              <FormControl>
                <ImageUpload
                  folder="candidates/photos"
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="politicalParty"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Political party</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="position"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Position running for</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="biography"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Biography</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="manifesto"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Manifesto</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="education"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Education</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="experience"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Experience</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="campaignMessage"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Campaign message</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="socialLinks.website"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Website</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="socialLinks.twitter"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Twitter</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="socialLinks.facebook"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Facebook</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="socialLinks.instagram"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Instagram</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="socialLinks.linkedin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>LinkedIn</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {candidateStatusValues.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value === "active" ? "Active" : "Withdrawn"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : candidate ? "Save changes" : "Add candidate"}
          </Button>
        </div>
      </form>
    </Form>
  )
}
