export type ElectionForStatus = {
  status: "draft" | "upcoming" | "active" | "ended" | "closed";
  startDate: Date;
  endDate: Date;
};

export type EffectiveElectionStatus = "draft" | "upcoming" | "active" | "ended" | "closed";

/**
 * Only "draft" and "closed" ever reflect a real admin action — everything
 * else is derived from the current time against the election's own dates,
 * so a published election's displayed status never goes stale without a
 * cron job rewriting rows.
 */
export function getEffectiveStatus(
  election: ElectionForStatus,
  now: Date = new Date()
): EffectiveElectionStatus {
  if (election.status === "draft") return "draft";
  if (election.status === "closed") return "closed";

  if (now < election.startDate) return "upcoming";
  if (now > election.endDate) return "ended";
  return "active";
}
