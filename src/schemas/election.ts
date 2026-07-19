import { z } from "zod";

export const electionVisibilityValues = ["public", "private"] as const;

export const electionFieldsSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().max(5000).optional(),
  category: z.string().max(100).optional(),
  bannerUrl: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  visibility: z.enum(electionVisibilityValues),
  maxVotesAllowed: z.number().int().positive().optional(),
  rules: z.string().max(5000).optional(),
  instructions: z.string().max(5000).optional(),
});

function withDateOrderCheck<T extends z.ZodType<{ startDate: string; endDate: string }>>(
  schema: T
) {
  return schema.refine((data) => new Date(data.endDate) > new Date(data.startDate), {
    message: "End date must be after start date",
    path: ["endDate"],
  });
}

export const createElectionSchema = withDateOrderCheck(electionFieldsSchema);
export type CreateElectionInput = z.infer<typeof createElectionSchema>;

export const updateElectionSchema = withDateOrderCheck(
  electionFieldsSchema.extend({ id: z.uuid() })
);
export type UpdateElectionInput = z.infer<typeof updateElectionSchema>;
