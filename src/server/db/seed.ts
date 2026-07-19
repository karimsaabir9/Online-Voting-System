import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * Full implementation lands in the Auth phase, once Better Auth is wired up
 * and can hash the admin password correctly. For now this only validates the
 * env vars it will need, so the wiring is visibly ready but not silently
 * incomplete.
 */
async function main() {
  if (!process.env.ADMIN_SEED_EMAIL || !process.env.ADMIN_SEED_PASSWORD) {
    throw new Error(
      "ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be set in .env.local"
    );
  }

  console.log(
    "Admin seeding is not implemented yet — it lands in the Auth phase, once Better Auth can hash the password."
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
