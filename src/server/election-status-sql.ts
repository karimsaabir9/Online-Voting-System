import { and, eq, gt, gte, lt, lte, ne, type SQL } from "drizzle-orm";

import { elections } from "@/server/db/schema";
import type { EffectiveElectionStatus } from "@/lib/election-status";

/**
 * Mirrors getEffectiveStatus()'s logic in SQL so filtering/counting can
 * happen at the database layer instead of loading every row into app code.
 * Keep in sync with src/lib/election-status.ts if that logic ever changes.
 */
export function effectiveStatusCondition(
  status: EffectiveElectionStatus,
  now: Date
): SQL {
  switch (status) {
    case "draft":
      return eq(elections.status, "draft");
    case "closed":
      return eq(elections.status, "closed");
    case "upcoming":
      return and(
        ne(elections.status, "draft"),
        ne(elections.status, "closed"),
        gt(elections.startDate, now)
      )!;
    case "active":
      return and(
        ne(elections.status, "draft"),
        ne(elections.status, "closed"),
        lte(elections.startDate, now),
        gte(elections.endDate, now)
      )!;
    case "ended":
      return and(
        ne(elections.status, "draft"),
        ne(elections.status, "closed"),
        lt(elections.endDate, now)
      )!;
  }
}
