import { createTRPCRouter } from "@/server/api/trpc";
import { healthRouter } from "@/server/api/routers/health";
import { uploadsRouter } from "@/server/api/routers/uploads";
import { electionsRouter } from "@/server/api/routers/elections";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  uploads: uploadsRouter,
  elections: electionsRouter,
});

export type AppRouter = typeof appRouter;
