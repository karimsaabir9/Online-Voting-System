import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { getUploadSignature } from "@/lib/cloudinary";

const ADMIN_ONLY_FOLDERS = ["elections/banners", "candidates/photos"] as const;

export const uploadsRouter = createTRPCRouter({
  getSignature: protectedProcedure
    .input(
      z.object({
        folder: z.enum(["elections/banners", "candidates/photos", "users/avatars"]),
      })
    )
    .query(({ ctx, input }) => {
      if (
        ADMIN_ONLY_FOLDERS.includes(input.folder as (typeof ADMIN_ONLY_FOLDERS)[number]) &&
        ctx.session.user.role !== "admin"
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return getUploadSignature(input.folder);
    }),
});
