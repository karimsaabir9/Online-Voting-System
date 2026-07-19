import { initTRPC } from "@trpc/server";
import superjson from "superjson";

import { db } from "@/server/db";

/**
 * Session will be added here in the Auth phase — kept as a documented
 * placeholder now so routers written later don't need a context shape change.
 */
export async function createTRPCContext(opts: { headers: Headers }) {
  return {
    db,
    headers: opts.headers,
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
