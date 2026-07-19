import { relations } from "drizzle-orm";

import { user, session, account } from "./auth";
import { elections } from "./elections";
import { candidates } from "./candidates";
import { votes } from "./votes";
import { auditLogs } from "./audit";
import { notifications } from "./notifications";
import { activityLogs } from "./activity";

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  createdElections: many(elections),
  votes: many(votes),
  auditLogs: many(auditLogs),
  notifications: many(notifications),
  activityLogs: many(activityLogs),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const electionsRelations = relations(elections, ({ one, many }) => ({
  creator: one(user, {
    fields: [elections.createdBy],
    references: [user.id],
  }),
  candidates: many(candidates),
  votes: many(votes),
}));

export const candidatesRelations = relations(candidates, ({ one, many }) => ({
  election: one(elections, {
    fields: [candidates.electionId],
    references: [elections.id],
  }),
  votes: many(votes),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  election: one(elections, {
    fields: [votes.electionId],
    references: [elections.id],
  }),
  candidate: one(candidates, {
    fields: [votes.candidateId],
    references: [candidates.id],
  }),
  user: one(user, {
    fields: [votes.userId],
    references: [user.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(user, {
    fields: [auditLogs.actorId],
    references: [user.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(user, {
    fields: [notifications.userId],
    references: [user.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(user, {
    fields: [activityLogs.userId],
    references: [user.id],
  }),
}));
