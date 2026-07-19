import { createTRPCRouter } from "@/server/api/trpc";
import { healthRouter } from "@/server/api/routers/health";
import { uploadsRouter } from "@/server/api/routers/uploads";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  uploads: uploadsRouter,
});

export type AppRouter = typeof appRouter;
