import { pgEnum, pgTable, text, timestamp, uuid, jsonb, index } from "drizzle-orm/pg-core";

import { elections } from "./elections";

export const candidateStatusEnum = pgEnum("candidate_status", [
  "active",
  "withdrawn",
]);

export type SocialLinks = {
  website?: string;
  twitter?: string;
  facebook?: string;
  instagram?: string;
  linkedin?: string;
};

export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    photoUrl: text("photo_url"),
    biography: text("biography"),
    politicalParty: text("political_party"),
    position: text("position"),
    manifesto: text("manifesto"),
    education: text("education"),
    experience: text("experience"),
    campaignMessage: text("campaign_message"),
    socialLinks: jsonb("social_links").$type<SocialLinks>(),
    status: candidateStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("candidates_election_id_idx").on(table.electionId)]
);
