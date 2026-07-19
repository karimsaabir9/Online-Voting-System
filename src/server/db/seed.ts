import { config } from "dotenv";

config({ path: ".env.local" });

/**
 * The imports below are deliberately dynamic (loaded inside `main`, after
 * `config()` has run) rather than static top-level imports. `tsx` transpiles
 * this file to CommonJS, and empirically its transform hoists static
 * `import` statements ahead of the `config({ path: ".env.local" })` call
 * once `src/server/auth/config` (which itself imports `db`) is anywhere in
 * the static import graph — reproduced with both the `@/` alias and a plain
 * relative import, so it isn't alias-resolution specific. The net effect is
 * that `./index` (and therefore `DATABASE_URL`) got evaluated before
 * `.env.local` had been loaded, regardless of source order. Deferring every
 * import until inside the async `main()` function guarantees `config()` has
 * already run by the time any of these modules are evaluated.
 */
async function main() {
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be set in .env.local"
    );
  }

  const { eq } = await import("drizzle-orm");
  const { db } = await import("./index");
  const { user } = await import("./schema");
  const { auth } = await import("@/server/auth/config");

  const existing = await db.query.user.findFirst({
    where: eq(user.email, email),
  });

  if (existing) {
    console.log(`Admin user ${email} already exists — skipping.`);
    return;
  }

  await auth.api.signUpEmail({
    body: { email, password, name: "Admin" },
  });

  await db
    .update(user)
    .set({ role: "admin", status: "active", emailVerified: true })
    .where(eq(user.email, email));

  console.log(`Admin user ${email} created.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
