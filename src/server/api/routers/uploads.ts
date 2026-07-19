import { z } from "zod";

import { createTRPCRouter, adminProcedure } from "@/server/api/trpc";
import { getUploadSignature } from "@/lib/cloudinary";

export const uploadsRouter = createTRPCRouter({
  getSignature: adminProcedure
    .input(
      z.object({
        folder: z.enum(["elections/banners", "candidates/photos"]),
      })
    )
    .query(({ input }) => {
      return getUploadSignature(input.folder);
    }),
});
