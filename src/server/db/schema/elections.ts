import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  uuid,
  index,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const electionStatusEnum = pgEnum("election_status", [
  "draft",
  "upcoming",
  "active",
  "ended",
  "closed",
]);

export const electionVisibilityEnum = pgEnum("election_visibility", [
  "public",
  "private",
]);

export const elections = pgTable(
  "elections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category"),
    bannerUrl: text("banner_url"),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
    status: electionStatusEnum("status").notNull().default("draft"),
    visibility: electionVisibilityEnum("visibility").notNull().default("public"),
    maxVotesAllowed: integer("max_votes_allowed"),
    rules: text("rules"),
    instructions: text("instructions"),
    resultsPublished: boolean("results_published").notNull().default(false),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("elections_status_idx").on(table.status),
    index("elections_date_range_idx").on(table.startDate, table.endDate),
  ]
);
