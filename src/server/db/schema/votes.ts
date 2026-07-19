import { pgTable, text, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { elections } from "./elections";
import { candidates } from "./candidates";

export const votes = pgTable(
  "votes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "restrict" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    ipAddress: text("ip_address"),
    deviceInfo: text("device_info"),
    votedAt: timestamp("voted_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("votes_election_user_unique").on(
      table.electionId,
      table.userId
    ),
    index("votes_election_id_idx").on(table.electionId),
    index("votes_user_id_idx").on(table.userId),
  ]
);
