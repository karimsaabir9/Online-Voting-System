"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import {
  createElectionSchema,
  electionVisibilityValues,
  type CreateElectionInput,
} from "@/schemas/election"
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

type ElectionFormProps = {
  election?: {
    id: string
    title: string
    description: string | null
    category: string | null
    bannerUrl: string | null
    startDate: Date
    endDate: Date
    visibility: "public" | "private"
    maxVotesAllowed: number | null
    rules: string | null
    instructions: string | null
  }
  onSuccess?: () => void
  onCancel?: () => void
}

function toDatetimeLocal(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function ElectionForm({ election, onSuccess, onCancel }: ElectionFormProps) {
  const router = useRouter()
  const utils = trpc.useUtils()

  const form = useForm<CreateElectionInput>({
    resolver: zodResolver(createElectionSchema),
    defaultValues: {
      title: election?.title ?? "",
      description: election?.description ?? "",
      category: election?.category ?? "",
      bannerUrl: election?.bannerUrl ?? "",
      startDate: election ? toDatetimeLocal(election.startDate) : "",
      endDate: election ? toDatetimeLocal(election.endDate) : "",
      visibility: election?.visibility ?? "public",
      maxVotesAllowed: election?.maxVotesAllowed ?? undefined,
      rules: election?.rules ?? "",
      instructions: election?.instructions ?? "",
    },
  })

  const createMutation = trpc.elections.create.useMutation({
    onSuccess: async () => {
      await utils.elections.list.invalidate()
      toast.success("Election created")
      if (onSuccess) {
        onSuccess()
      } else {
        router.push("/admin/elections")
      }
    },
    onError: (error) => toast.error(error.message),
  })

  const updateMutation = trpc.elections.update.useMutation({
    onSuccess: async () => {
      await utils.elections.list.invalidate()
      if (election) await utils.elections.getById.invalidate({ id: election.id })
      toast.success("Election updated")
      router.refresh()
    },
    onError: (error) => toast.error(error.message),
  })

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  function onSubmit(values: CreateElectionInput) {
    if (election) {
      updateMutation.mutate({ ...values, id: election.id })
    } else {
      createMutation.mutate(values)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bannerUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Banner image</FormLabel>
              <FormControl>
                <ImageUpload
                  folder="elections/banners"
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
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start date</FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End date</FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="visibility"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Visibility</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select visibility" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {electionVisibilityValues.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value === "public" ? "Public" : "Private"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="maxVotesAllowed"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Max votes allowed (optional)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="rules"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Rules</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="instructions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Instructions</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
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
            {isSubmitting ? "Saving…" : election ? "Save changes" : "Create election"}
          </Button>
        </div>
      </form>
    </Form>
  )
}
