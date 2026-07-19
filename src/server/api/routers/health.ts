import { sql } from "drizzle-orm";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

export const healthRouter = createTRPCRouter({
  ping: publicProcedure.query(async ({ ctx }) => {
    const result = await ctx.db.execute(sql`select 1 as ok`);
    return {
      status: "ok" as const,
      db: result.rows.length > 0,
      timestamp: new Date().toISOString(),
    };
  }),
});
