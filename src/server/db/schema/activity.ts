import { pgTable, text, timestamp, uuid, jsonb, index } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    description: text("description"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("activity_logs_user_id_idx").on(table.userId)]
);
