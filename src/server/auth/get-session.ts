import { headers } from "next/headers";

import { auth } from "@/server/auth/config";

export async function getServerSession() {
  return auth.api.getSession({ headers: await headers() });
}
