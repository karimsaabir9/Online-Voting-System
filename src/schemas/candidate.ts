import { z } from "zod";

export const candidateStatusValues = ["active", "withdrawn"] as const;

export const socialLinksSchema = z.object({
  website: z.string().optional(),
  twitter: z.string().optional(),
  facebook: z.string().optional(),
  instagram: z.string().optional(),
  linkedin: z.string().optional(),
});

export const candidateFieldsSchema = z.object({
  electionId: z.uuid(),
  fullName: z.string().min(2, "Full name must be at least 2 characters").max(200),
  photoUrl: z.string().optional(),
  biography: z.string().max(5000).optional(),
  politicalParty: z.string().max(200).optional(),
  position: z.string().max(200).optional(),
  manifesto: z.string().max(5000).optional(),
  education: z.string().max(5000).optional(),
  experience: z.string().max(5000).optional(),
  campaignMessage: z.string().max(2000).optional(),
  socialLinks: socialLinksSchema.optional(),
  status: z.enum(candidateStatusValues),
});

export const createCandidateSchema = candidateFieldsSchema;
export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;

export const updateCandidateSchema = candidateFieldsSchema.extend({ id: z.uuid() });
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;
