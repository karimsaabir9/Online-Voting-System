import { createTRPCRouter } from "@/server/api/trpc";
import { healthRouter } from "@/server/api/routers/health";
import { uploadsRouter } from "@/server/api/routers/uploads";
import { electionsRouter } from "@/server/api/routers/elections";
import { candidatesRouter } from "@/server/api/routers/candidates";
import { votingRouter } from "@/server/api/routers/voting";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  uploads: uploadsRouter,
  elections: electionsRouter,
  candidates: candidatesRouter,
  voting: votingRouter,
});

export type AppRouter = typeof appRouter;
