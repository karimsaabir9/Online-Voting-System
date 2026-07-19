import { z } from "zod";
import { eq, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, adminProcedure } from "@/server/api/trpc";
import { candidates } from "@/server/db/schema";
import { createCandidateSchema, updateCandidateSchema } from "@/schemas/candidate";

const POSTGRES_FK_RESTRICT_CODE = "23503";

function toWriteValues(input: {
  fullName: string;
  photoUrl?: string;
  biography?: string;
  politicalParty?: string;
  position?: string;
  manifesto?: string;
  education?: string;
  experience?: string;
  campaignMessage?: string;
  socialLinks?: Record<string, string | undefined>;
  status: "active" | "withdrawn";
}) {
  return {
    fullName: input.fullName,
    photoUrl: input.photoUrl || null,
    biography: input.biography || null,
    politicalParty: input.politicalParty || null,
    position: input.position || null,
    manifesto: input.manifesto || null,
    education: input.education || null,
    experience: input.experience || null,
    campaignMessage: input.campaignMessage || null,
    socialLinks: input.socialLinks ?? null,
    status: input.status,
  };
}

export const candidatesRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z.object({
        electionId: z.uuid(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.pageSize;

      const [items, totalRow] = await Promise.all([
        ctx.db.query.candidates.findMany({
          where: eq(candidates.electionId, input.electionId),
          orderBy: (fields, { desc }) => [desc(fields.createdAt)],
          limit: input.pageSize,
          offset,
        }),
        ctx.db
          .select({ total: count() })
          .from(candidates)
          .where(eq(candidates.electionId, input.electionId)),
      ]);

      return {
        items,
        total: totalRow[0].total,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  getById: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });

      if (!candidate) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found" });
      }

      return candidate;
    }),

  create: adminProcedure.input(createCandidateSchema).mutation(async ({ ctx, input }) => {
    const [candidate] = await ctx.db
      .insert(candidates)
      .values({
        electionId: input.electionId,
        ...toWriteValues(input),
      })
      .returning();

    return candidate;
  }),

  update: adminProcedure.input(updateCandidateSchema).mutation(async ({ ctx, input }) => {
    const [candidate] = await ctx.db
      .update(candidates)
      .set(toWriteValues(input))
      .where(eq(candidates.id, input.id))
      .returning();

    if (!candidate) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found" });
    }

    return candidate;
  }),

  delete: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const [deleted] = await ctx.db
          .delete(candidates)
          .where(eq(candidates.id, input.id))
          .returning();

        if (!deleted) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found" });
        }

        return deleted;
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === POSTGRES_FK_RESTRICT_CODE
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Cannot delete a candidate that already has votes",
          });
        }
        throw error;
      }
    }),
});
