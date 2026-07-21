import type { db as dbType } from "@/server/db";
import { activityLogs } from "@/server/db/schema";

type Database = typeof dbType;

export async function logActivity(
  db: Database,
  input: { userId: string | null; action: string; description: string }
) {
  await db.insert(activityLogs).values(input);
}
