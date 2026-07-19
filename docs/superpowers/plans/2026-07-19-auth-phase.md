# Auth Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement registration, login, logout, session management, protected routes, role-based authorization (admin/voter), forgot/reset password, in-app change password, and a working admin seed script for the Online Voting System.

**Architecture:** Better Auth (Drizzle adapter, over the `user`/`session`/`account`/`verification` tables already created in the Foundation phase) provides the session/credential layer. Three defense-in-depth checks gate protected areas: an edge middleware (UX fast-path, cookie presence only), server-side layout guards (the real boundary, checks role + status), and tRPC `protectedProcedure`/`adminProcedure` (the data-access gate). Forms use React Hook Form + Zod against the existing `src/components/ui/form.tsx`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Better Auth, Drizzle ORM, Neon Postgres, tRPC, TanStack Query, React Hook Form, Zod, shadcn/ui (base-nova/Base UI), Resend, Tailwind CSS, Lucide React.

## Global Constraints

- Email verification is **required** before login — `emailAndPassword.requireEmailVerification: true`.
- Sessions last **30 days, rolling** (`expiresIn: 60*60*24*30`, `updateAge: 60*60*24`).
- Minimum password length is **8 characters**.
- Better Auth's built-in **rate limiting is enabled** with library defaults.
- Registration only ever creates **`voter`** role accounts; `admin` only comes from the seed script.
- Suspended users (`status: "suspended"`) are blocked at the protected-layout and `protectedProcedure` boundary, not via a Better Auth internal hook.
- IDs are Postgres-generated (`advanced.database.generateId: false`) — never let Better Auth generate its own.
- **No test framework exists in this project** (not part of the approved tech stack). Every "verify" step in this plan uses `tsc --noEmit`, `pnpm build`, curl/node scripts against the running dev server, or browser automation — never `jest`/`vitest`. This replaces the classic red/green unit-test cycle referenced in the general planning process.
- **Git commit messages must NOT include `Co-Authored-By: Claude` or "Generated with Claude Code" or any AI-attribution trailer.** This overrides any default tooling behavior.
- Path alias `@/*` maps to `src/*` (already configured in `tsconfig.json`).
- File naming: kebab-case for files, PascalCase for exported components.

## Operational Notes (environment-specific, learned in the Foundation phase)

- Keep `pnpm dev` running in the background throughout; restart it after any `.env.local` change (env vars are read at process start).
- `.env.local` must have real values for `DATABASE_URL` (already set), and this phase additionally requires `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL=http://localhost:3000` before the server can boot (Task 3 is where these become required — `src/lib/resend.ts` already requires `RESEND_API_KEY` to be set, from the Foundation phase).
- Generate a secret with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
- New pnpm installs may hit `[ERR_PNPM_IGNORED_BUILDS]` for native postinstall scripts — add the package to `allowBuilds` in `pnpm-workspace.yaml` (set to `true`) and re-run `pnpm install`, same pattern used for `sharp`/`esbuild` in Foundation.
- Windows/Git Bash: use `curl.exe` or plain `curl` from Git Bash (both work); use a cookie jar file (`-c cookies.txt -b cookies.txt`) to carry the session cookie between curl calls when verifying auth flows.

---

### Task 1: Zod validation schemas

**Files:**
- Create: `src/schemas/auth.ts`

**Interfaces:**
- Produces: `loginSchema`, `LoginInput`, `registerSchema`, `RegisterInput`, `forgotPasswordSchema`, `ForgotPasswordInput`, `resetPasswordSchema`, `ResetPasswordInput`, `changePasswordSchema`, `ChangePasswordInput` — all exported from `@/schemas/auth`.

- [ ] **Step 1: Write the schemas**

```ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address"),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 3: Commit**

```bash
git add src/schemas/auth.ts
git commit -m "Add auth validation schemas"
```

---

### Task 2: Auth email templates and send helpers

**Files:**
- Create: `src/features/auth/emails/verify-email-template.tsx`
- Create: `src/features/auth/emails/reset-password-template.tsx`
- Create: `src/features/auth/emails/send-auth-emails.tsx`

**Interfaces:**
- Consumes: `sendEmail({ to, subject, react }): Promise<unknown>` from `@/lib/resend` (Foundation phase).
- Produces: `sendVerificationEmail(to: string, url: string, name: string): Promise<void>` and `sendPasswordResetEmail(to: string, url: string, name: string): Promise<void>` from `@/features/auth/emails/send-auth-emails`.

- [ ] **Step 1: Write the verify-email template**

```tsx
type VerifyEmailTemplateProps = {
  name: string;
  url: string;
};

export function VerifyEmailTemplate({ name, url }: VerifyEmailTemplateProps) {
  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20 }}>Verify your email</h1>
      <p>Hi {name},</p>
      <p>
        Thanks for registering for the Online Voting System. Please verify
        your email address to activate your account.
      </p>
      <a
        href={url}
        style={{
          display: "inline-block",
          padding: "10px 20px",
          background: "#111827",
          color: "#ffffff",
          textDecoration: "none",
          borderRadius: 6,
          marginTop: 12,
        }}
      >
        Verify email
      </a>
      <p style={{ color: "#6b7280", fontSize: 12, marginTop: 24 }}>
        If you didn&apos;t create this account, you can safely ignore this
        email.
      </p>
    </div>
  );
}
```

Save as `src/features/auth/emails/verify-email-template.tsx`.

- [ ] **Step 2: Write the reset-password template**

```tsx
type ResetPasswordTemplateProps = {
  name: string;
  url: string;
};

export function ResetPasswordTemplate({ name, url }: ResetPasswordTemplateProps) {
  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20 }}>Reset your password</h1>
      <p>Hi {name},</p>
      <p>
        We received a request to reset your Online Voting System password.
        Click the button below to choose a new one. This link expires in 1
        hour.
      </p>
      <a
        href={url}
        style={{
          display: "inline-block",
          padding: "10px 20px",
          background: "#111827",
          color: "#ffffff",
          textDecoration: "none",
          borderRadius: 6,
          marginTop: 12,
        }}
      >
        Reset password
      </a>
      <p style={{ color: "#6b7280", fontSize: 12, marginTop: 24 }}>
        If you didn&apos;t request this, you can safely ignore this email —
        your password will not change.
      </p>
    </div>
  );
}
```

Save as `src/features/auth/emails/reset-password-template.tsx`.

- [ ] **Step 3: Write the send helpers**

```tsx
import { sendEmail } from "@/lib/resend";
import { VerifyEmailTemplate } from "./verify-email-template";
import { ResetPasswordTemplate } from "./reset-password-template";

export async function sendVerificationEmail(
  to: string,
  url: string,
  name: string
) {
  await sendEmail({
    to,
    subject: "Verify your email — Online Voting System",
    react: <VerifyEmailTemplate name={name} url={url} />,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  url: string,
  name: string
) {
  await sendEmail({
    to,
    subject: "Reset your password — Online Voting System",
    react: <ResetPasswordTemplate name={name} url={url} />,
  });
}
```

Save as `src/features/auth/emails/send-auth-emails.tsx` (`.tsx` because `sendEmail`'s `react` field is JSX).

- [ ] **Step 4: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors). Note: this will only pass once `RESEND_API_KEY` is set in `.env.local`, because `@/lib/resend` throws at import time otherwise — `tsc` alone won't catch that (it's a runtime check), so this step only confirms types; runtime behavior is verified in Task 3 once the email-sending path is actually exercised.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/emails/
git commit -m "Add auth email templates and send helpers"
```

---

### Task 3: Install and configure Better Auth (server, route handler, client)

**Files:**
- Create: `src/server/auth/config.ts`
- Create: `src/app/api/auth/[...all]/route.ts`
- Create: `src/lib/auth-client.ts`
- Modify: `.env.local` (add `BETTER_AUTH_SECRET`, confirm `BETTER_AUTH_URL`)

**Interfaces:**
- Consumes: `db` from `@/server/db`, `user`/`session`/`account`/`verification` from `@/server/db/schema`, `sendVerificationEmail`/`sendPasswordResetEmail` from `@/features/auth/emails/send-auth-emails` (Task 2).
- Produces: `auth` (the `betterAuth()` instance) from `@/server/auth/config`; a working `/api/auth/*` route; `authClient` and re-exported `useSession`, `signIn`, `signUp`, `signOut`, `forgetPassword`, `resetPassword`, `changePassword` from `@/lib/auth-client`.

- [ ] **Step 1: Install better-auth**

Run: `pnpm add better-auth`

If it reports `[ERR_PNPM_IGNORED_BUILDS]` for any dependency, add that dependency to `allowBuilds` in `pnpm-workspace.yaml` (set to `true`) and re-run `pnpm install`.

- [ ] **Step 2: Generate and set BETTER_AUTH_SECRET**

Run: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

Copy the output into `.env.local` as `BETTER_AUTH_SECRET=<value>`. Confirm `.env.local` already has `BETTER_AUTH_URL=http://localhost:3000` (it does, from the Foundation phase's `.env.example`) and `RESEND_API_KEY` is set to a real key.

- [ ] **Step 3: Write the Better Auth server config**

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@/server/db";
import { user, session, account, verification } from "@/server/db/schema";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "@/features/auth/emails/send-auth-emails";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url, user.name);
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url, user.name);
    },
    autoSignInAfterVerification: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "voter",
        input: false,
      },
      status: {
        type: "string",
        defaultValue: "active",
        input: false,
      },
    },
  },
  advanced: {
    database: {
      generateId: false,
    },
  },
});
```

Save as `src/server/auth/config.ts`.

- [ ] **Step 4: Write the route handler**

```ts
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/server/auth/config";

export const { GET, POST } = toNextJsHandler(auth);
```

Save as `src/app/api/auth/[...all]/route.ts`.

- [ ] **Step 5: Write the client**

```ts
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFieldsClient } from "better-auth/client/plugins";

import type { auth } from "@/server/auth/config";

export const authClient = createAuthClient({
  plugins: [inferAdditionalFieldsClient<typeof auth>()],
});

export const {
  useSession,
  signIn,
  signUp,
  signOut,
  forgetPassword,
  resetPassword,
  changePassword,
} = authClient;
```

Save as `src/lib/auth-client.ts`.

- [ ] **Step 6: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors). If `drizzleAdapter` or `toNextJsHandler` import paths error, check `node_modules/better-auth/package.json` `exports` field for the exact subpath used by the installed version and adjust the import.

- [ ] **Step 7: Restart the dev server and verify session endpoint**

Run: `pnpm dev` (restart if already running, so it picks up the new env vars)

Run: `curl -s http://localhost:3000/api/auth/get-session`
Expected: `null` or `{"session":null,"user":null}` (no error, no 500).

- [ ] **Step 8: Verify sign-up creates an unverified user with no session**

Run:
```bash
curl -s -c /tmp/ovs-cookies.txt -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"task3-verify@example.com","password":"password123","name":"Task3 Verify"}'
```
Expected: a JSON response containing a `user` object with `email: "task3-verify@example.com"`. No `Set-Cookie` session token should be issued (check with `curl -s -i ...` and confirm no `better-auth.session_token` cookie), because `requireEmailVerification` is `true`.

Then confirm via a scratch script that the row landed correctly and no session was created:

```js
// scratch-verify-signup.mjs (temporary, delete after use)
import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const users = await sql`select email, role, status, email_verified from "user" where email = 'task3-verify@example.com'`;
console.log("user row:", users);
const sessions = await sql`select s.id from session s join "user" u on u.id = s.user_id where u.email = 'task3-verify@example.com'`;
console.log("session rows (should be empty):", sessions);
```

Run: `node scratch-verify-signup.mjs`
Expected: one user row with `role: "voter"`, `status: "active"`, `email_verified: false`; zero session rows.

Then delete the scratch script and the test user:
```bash
rm scratch-verify-signup.mjs
```
```js
// scratch-cleanup.mjs (temporary, delete after use)
import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
await sql`delete from "user" where email = 'task3-verify@example.com'`;
console.log("cleaned up");
```
Run: `node scratch-cleanup.mjs`, then `rm scratch-cleanup.mjs`.

Note: this also exercises the Resend email send path (`sendVerificationEmail`). If the response above is a 500 instead of the expected JSON, check the dev server log for a Resend error first (e.g. sandbox mode restricting the recipient address) — that confirms Task 2's wiring, not Task 3's, needs attention. Check https://resend.com/emails for the outbound email if delivery to arbitrary test addresses isn't available in your Resend account's current mode.

- [ ] **Step 9: Commit**

```bash
git add src/server/auth/config.ts src/app/api/auth/ src/lib/auth-client.ts pnpm-lock.yaml package.json pnpm-workspace.yaml
git commit -m "Configure Better Auth server, route handler, and client"
```

Do not commit `.env.local` (it's gitignored).

---

### Task 4: tRPC session context and protected procedures

**Files:**
- Modify: `src/server/api/trpc.ts`

**Interfaces:**
- Consumes: `auth` from `@/server/auth/config` (Task 3).
- Produces: `createTRPCContext` now returns `{ db, session, headers }` (was `{ db, headers }`); `protectedProcedure` and `adminProcedure` exported alongside the existing `createTRPCRouter`/`publicProcedure`.

- [ ] **Step 1: Update the context and add protected procedures**

Replace the full contents of `src/server/api/trpc.ts`:

```ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

import { db } from "@/server/db";
import { auth } from "@/server/auth/config";

export async function createTRPCContext(opts: { headers: Headers }) {
  const session = await auth.api.getSession({ headers: opts.headers });

  return {
    db,
    session,
    headers: opts.headers,
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session || ctx.session.user.status !== "active") {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.session.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return next({ ctx });
});
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 3: Verify the health router still works with the new context**

Run: `curl -s -X POST http://localhost:3000/api/trpc/health.ping -H "Content-Type: application/json" -d '{}'`
Expected: a 200 response with `result.data.status: "ok"` (same as the Foundation-phase health check — confirms `createTRPCContext` still resolves cleanly with the new session lookup added).

- [ ] **Step 4: Commit**

```bash
git add src/server/api/trpc.ts
git commit -m "Add session context and protected tRPC procedures"
```

---

### Task 5: Session helper, middleware, role-guarded layouts, placeholder dashboards, home page

**Files:**
- Create: `src/server/auth/get-session.ts`
- Create: `src/middleware.ts`
- Create: `src/features/auth/components/logout-button.tsx`
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/admin/dashboard/page.tsx`
- Create: `src/app/voter/layout.tsx`
- Create: `src/app/voter/dashboard/page.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `auth` from `@/server/auth/config` (Task 3), `authClient` from `@/lib/auth-client` (Task 3).
- Produces: `getServerSession(): Promise<Session | null>` from `@/server/auth/get-session`, used by every server-side guard/page in Tasks 5 and 11; `LogoutButton` component from `@/features/auth/components/logout-button`, used by both dashboard placeholders in this task.

- [ ] **Step 1: Write the server session helper**

```ts
import { headers } from "next/headers";

import { auth } from "@/server/auth/config";

export async function getServerSession() {
  return auth.api.getSession({ headers: await headers() });
}
```

Save as `src/server/auth/get-session.ts`.

- [ ] **Step 2: Write the middleware**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const AUTH_PAGES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

export function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  const isProtected =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/voter") ||
    pathname.startsWith("/settings");
  const isAuthPage = AUTH_PAGES.some((page) => pathname.startsWith(page));

  if (isProtected && !sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isAuthPage && sessionCookie) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/voter/:path*",
    "/settings/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ],
};
```

Save as `src/middleware.ts` (must be at `src/middleware.ts`, sibling to `src/app/`, since the project uses a `src/` dir).

- [ ] **Step 3: Write the logout button**

```tsx
"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"

export function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    await authClient.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <Button variant="outline" onClick={handleLogout}>
      <LogOut className="size-4" />
      Log out
    </Button>
  )
}
```

Save as `src/features/auth/components/logout-button.tsx`.

- [ ] **Step 4: Write the admin layout guard**

```tsx
import { redirect } from "next/navigation"

import { getServerSession } from "@/server/auth/get-session"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }
  if (session.user.status !== "active") {
    redirect("/login?error=suspended")
  }
  if (session.user.role !== "admin") {
    redirect("/voter/dashboard")
  }

  return <>{children}</>
}
```

Save as `src/app/admin/layout.tsx`.

- [ ] **Step 5: Write the admin dashboard placeholder**

```tsx
import { getServerSession } from "@/server/auth/get-session"
import { LogoutButton } from "@/features/auth/components/logout-button"

export default async function AdminDashboardPage() {
  const session = await getServerSession()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Admin dashboard</h1>
      <p className="text-muted-foreground">
        Signed in as {session?.user.name} ({session?.user.email})
      </p>
      <LogoutButton />
    </div>
  )
}
```

Save as `src/app/admin/dashboard/page.tsx`.

- [ ] **Step 6: Write the voter layout guard**

```tsx
import { redirect } from "next/navigation"

import { getServerSession } from "@/server/auth/get-session"

export default async function VoterLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }
  if (session.user.status !== "active") {
    redirect("/login?error=suspended")
  }
  if (session.user.role !== "voter") {
    redirect("/admin/dashboard")
  }

  return <>{children}</>
}
```

Save as `src/app/voter/layout.tsx`.

- [ ] **Step 7: Write the voter dashboard placeholder**

```tsx
import { getServerSession } from "@/server/auth/get-session"
import { LogoutButton } from "@/features/auth/components/logout-button"

export default async function VoterDashboardPage() {
  const session = await getServerSession()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Voter dashboard</h1>
      <p className="text-muted-foreground">
        Signed in as {session?.user.name} ({session?.user.email})
      </p>
      <LogoutButton />
    </div>
  )
}
```

Save as `src/app/voter/dashboard/page.tsx`.

- [ ] **Step 8: Update the home page to redirect signed-in users and link to auth pages**

Read the current `src/app/page.tsx` first (it's the Foundation-phase placeholder with `HealthStatus`), then replace its full contents:

```tsx
import Link from "next/link"
import { redirect } from "next/navigation"
import { Vote } from "lucide-react"

import { ThemeToggle } from "@/components/shared/theme-toggle"
import { HealthStatus } from "@/features/dashboard/components/health-status"
import { Button } from "@/components/ui/button"
import { getServerSession } from "@/server/auth/get-session"

export default async function Home() {
  const session = await getServerSession()

  if (session && session.user.status === "active") {
    redirect(
      session.user.role === "admin" ? "/admin/dashboard" : "/voter/dashboard"
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2 font-semibold">
          <Vote className="size-5" />
          Online Voting System
        </div>
        <div className="flex items-center gap-2">
          <Button render={<Link href="/login" />} variant="outline">
            Log in
          </Button>
          <Button render={<Link href="/register" />}>Register</Button>
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Foundation is up and running.
        </h1>
        <p className="text-muted-foreground max-w-md text-sm">
          Project scaffold, UI kit, and theming are wired. The rest of the
          system is built out phase by phase.
        </p>
        <HealthStatus />
      </main>
    </div>
  )
}
```

- [ ] **Step 9: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 10: Verify the middleware redirect with curl**

Run: `curl -s -i http://localhost:3000/admin/dashboard | head -5`
Expected: `HTTP/1.1 307` (or similar redirect status) with a `location: /login` header, since there's no session cookie.

Run: `curl -s -i http://localhost:3000/voter/dashboard | head -5`
Expected: same — redirected to `/login`.

- [ ] **Step 11: Commit**

```bash
git add src/server/auth/get-session.ts src/middleware.ts src/features/auth/components/logout-button.tsx src/app/admin/ src/app/voter/ src/app/page.tsx
git commit -m "Add route protection, role-guarded layouts, and placeholder dashboards"
```

---

### Task 6: Login page and form

**Files:**
- Create: `src/features/auth/components/login-form.tsx`
- Create: `src/app/(auth)/layout.tsx`
- Create: `src/app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: `loginSchema`, `LoginInput` (Task 1); `authClient` (Task 3).
- Produces: `LoginForm` component from `@/features/auth/components/login-form`; the `(auth)` route group layout, reused unmodified by Tasks 7–10.

- [ ] **Step 1: Write the shared auth pages layout**

```tsx
import Link from "next/link"
import { Vote } from "lucide-react"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <Vote className="size-5" />
        Online Voting System
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
```

Save as `src/app/(auth)/layout.tsx`.

- [ ] **Step 2: Write the login form**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { loginSchema, type LoginInput } from "@/schemas/auth"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

export function LoginForm() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  async function onSubmit(values: LoginInput) {
    setIsSubmitting(true)

    const { data, error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
    })

    setIsSubmitting(false)

    if (error) {
      toast.error(error.message ?? "Invalid email or password")
      return
    }

    toast.success("Logged in successfully")
    router.push(data.user.role === "admin" ? "/admin/dashboard" : "/voter/dashboard")
    router.refresh()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </Form>
  )
}
```

Save as `src/features/auth/components/login-form.tsx`.

- [ ] **Step 3: Write the login page**

```tsx
import Link from "next/link"

import { LoginForm } from "@/features/auth/components/login-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>
          Enter your email and password to access your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <LoginForm />
        <div className="flex justify-between text-sm">
          <Link href="/register" className="text-muted-foreground hover:text-foreground">
            Create an account
          </Link>
          <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground">
            Forgot password?
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
```

Save as `src/app/(auth)/login/page.tsx`.

- [ ] **Step 4: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors). If `data.user.role` errors as not existing on the type, re-check Task 3 Step 5 — the client must include the `inferAdditionalFieldsClient<typeof auth>()` plugin for `role`/`status` to be typed on `data.user`.

- [ ] **Step 5: Verify in the browser**

Navigate to `http://localhost:3000/login`. Confirm the form renders (email + password fields, "Log in" button, "Create an account" / "Forgot password?" links). Submitting with an unverified or nonexistent account should show a toast error, not a crash.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(auth\)/layout.tsx "src/app/(auth)/login" src/features/auth/components/login-form.tsx
git commit -m "Add login page and form"
```

---

### Task 7: Register page and form

**Files:**
- Create: `src/features/auth/components/register-form.tsx`
- Create: `src/app/(auth)/register/page.tsx`

**Interfaces:**
- Consumes: `registerSchema`, `RegisterInput` (Task 1); `authClient` (Task 3); `(auth)` layout (Task 6).
- Produces: `RegisterForm` component from `@/features/auth/components/register-form`.

- [ ] **Step 1: Write the register form**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { registerSchema, type RegisterInput } from "@/schemas/auth"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

export function RegisterForm() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  })

  async function onSubmit(values: RegisterInput) {
    setIsSubmitting(true)

    const { error } = await authClient.signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
      callbackURL: "/verify-email?verified=true",
    })

    setIsSubmitting(false)

    if (error) {
      toast.error(error.message ?? "Could not create account")
      return
    }

    toast.success("Account created — check your email to verify it")
    router.push("/verify-email")
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </Form>
  )
}
```

Save as `src/features/auth/components/register-form.tsx`.

- [ ] **Step 2: Write the register page**

```tsx
import Link from "next/link"

import { RegisterForm } from "@/features/auth/components/register-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>
          Register as a voter to participate in elections.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RegisterForm />
        <div className="text-center text-sm">
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            Already have an account? Log in
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
```

Save as `src/app/(auth)/register/page.tsx`.

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 4: Verify in the browser**

Navigate to `http://localhost:3000/register`. Fill in the form with a real, deliverable email address (one your Resend account can send to) and submit. Confirm a success toast appears and the page navigates to `/verify-email`. Check your inbox (or https://resend.com/emails) for the verification email; confirm the link points at `/api/auth/verify-email?...` on `localhost:3000`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/register" src/features/auth/components/register-form.tsx
git commit -m "Add register page and form"
```

---

### Task 8: Verify-email page

**Files:**
- Create: `src/app/(auth)/verify-email/page.tsx`

**Interfaces:**
- Consumes: `(auth)` layout (Task 6); the `callbackURL` set in Task 7's register form (`/verify-email?verified=true`).
- Produces: nothing consumed by later tasks (leaf page).

- [ ] **Step 1: Write the verify-email page**

```tsx
import Link from "next/link"
import { CheckCircle2, MailCheck } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string; error?: string }>
}) {
  const { verified, error } = await searchParams

  if (verified === "true" && !error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-green-600" />
            Email verified
          </CardTitle>
          <CardDescription>
            Your email has been verified. You can now log in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/login" />} className="w-full">
            Go to login
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailCheck className="size-5" />
          Check your email
        </CardTitle>
        <CardDescription>
          We sent a verification link to your email address. Click it to
          activate your account, then log in.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
```

Save as `src/app/(auth)/verify-email/page.tsx`.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 3: Verify in the browser end-to-end**

Using the account registered in Task 7: click the verification link from the email. Confirm the browser lands on `http://localhost:3000/verify-email?verified=true` showing "Email verified." Then go to `/login` and confirm you can now log in with that account (previously blocked pre-verification) and land on `/voter/dashboard`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(auth)/verify-email"
git commit -m "Add verify-email page"
```

---

### Task 9: Forgot-password page and form

**Files:**
- Create: `src/features/auth/components/forgot-password-form.tsx`
- Create: `src/app/(auth)/forgot-password/page.tsx`

**Interfaces:**
- Consumes: `forgotPasswordSchema`, `ForgotPasswordInput` (Task 1); `authClient` (Task 3); `(auth)` layout (Task 6).
- Produces: `ForgotPasswordForm` component from `@/features/auth/components/forgot-password-form`.

- [ ] **Step 1: Write the forgot-password form**

```tsx
"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { forgotPasswordSchema, type ForgotPasswordInput } from "@/schemas/auth"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

export function ForgotPasswordForm() {
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  })

  async function onSubmit(values: ForgotPasswordInput) {
    setIsSubmitting(true)

    const { error } = await authClient.forgetPassword({
      email: values.email,
      redirectTo: "/reset-password",
    })

    setIsSubmitting(false)

    if (error) {
      toast.error(error.message ?? "Could not send reset email")
      return
    }

    setIsSubmitted(true)
  }

  if (isSubmitted) {
    return (
      <p className="text-muted-foreground text-sm">
        If an account exists for that email, a password reset link has been
        sent.
      </p>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </Form>
  )
}
```

Save as `src/features/auth/components/forgot-password-form.tsx`.

- [ ] **Step 2: Write the forgot-password page**

```tsx
import Link from "next/link"

import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot password</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a reset link.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ForgotPasswordForm />
        <div className="text-center text-sm">
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            Back to login
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
```

Save as `src/app/(auth)/forgot-password/page.tsx`.

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 4: Verify in the browser**

Navigate to `http://localhost:3000/forgot-password`, submit the email of the verified account from Task 8. Confirm the "If an account exists..." message appears, and a reset email arrives (or check https://resend.com/emails) with a link to `/reset-password?token=...`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/forgot-password" src/features/auth/components/forgot-password-form.tsx
git commit -m "Add forgot-password page and form"
```

---

### Task 10: Reset-password page and form

**Files:**
- Create: `src/features/auth/components/reset-password-form.tsx`
- Create: `src/app/(auth)/reset-password/page.tsx`

**Interfaces:**
- Consumes: `resetPasswordSchema`, `ResetPasswordInput` (Task 1); `authClient` (Task 3); `(auth)` layout (Task 6); the `token` query param from the emailed link (Task 9's `redirectTo: "/reset-password"`).
- Produces: `ResetPasswordForm` component from `@/features/auth/components/reset-password-form`.

- [ ] **Step 1: Write the reset-password form**

```tsx
"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { resetPasswordSchema, type ResetPasswordInput } from "@/schemas/auth"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

export function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  })

  async function onSubmit(values: ResetPasswordInput) {
    if (!token) {
      toast.error("Reset link is invalid or expired")
      return
    }

    setIsSubmitting(true)

    const { error } = await authClient.resetPassword({
      newPassword: values.password,
      token,
    })

    setIsSubmitting(false)

    if (error) {
      toast.error(error.message ?? "Could not reset password")
      return
    }

    toast.success("Password reset — log in with your new password")
    router.push("/login")
  }

  if (!token) {
    return (
      <p className="text-destructive text-sm">
        This reset link is invalid or has expired. Request a new one from
        the forgot password page.
      </p>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm new password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Resetting…" : "Reset password"}
        </Button>
      </form>
    </Form>
  )
}
```

Save as `src/features/auth/components/reset-password-form.tsx`.

- [ ] **Step 2: Write the reset-password page**

```tsx
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
        <CardDescription>Choose a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  )
}
```

Save as `src/app/(auth)/reset-password/page.tsx`.

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 4: Verify in the browser end-to-end**

Click the reset link from Task 9's email (lands on `/reset-password?token=...`). Set a new password, submit, confirm success toast and redirect to `/login`. Log in with the NEW password — should succeed and land on `/voter/dashboard`. Attempt login with the OLD password — should fail with an error toast.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/reset-password" src/features/auth/components/reset-password-form.tsx
git commit -m "Add reset-password page and form"
```

---

### Task 11: Settings page with change-password form

**Files:**
- Create: `src/features/auth/components/change-password-form.tsx`
- Create: `src/app/settings/page.tsx`

**Interfaces:**
- Consumes: `changePasswordSchema`, `ChangePasswordInput` (Task 1); `authClient` (Task 3); `getServerSession` (Task 5).
- Produces: `ChangePasswordForm` component from `@/features/auth/components/change-password-form`.

- [ ] **Step 1: Write the change-password form**

```tsx
"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { changePasswordSchema, type ChangePasswordInput } from "@/schemas/auth"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

export function ChangePasswordForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  })

  async function onSubmit(values: ChangePasswordInput) {
    setIsSubmitting(true)

    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: true,
    })

    setIsSubmitting(false)

    if (error) {
      toast.error(error.message ?? "Could not change password")
      return
    }

    toast.success("Password changed")
    form.reset()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm new password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Changing…" : "Change password"}
        </Button>
      </form>
    </Form>
  )
}
```

Save as `src/features/auth/components/change-password-form.tsx`.

- [ ] **Step 2: Write the settings page**

```tsx
import { redirect } from "next/navigation"

import { getServerSession } from "@/server/auth/get-session"
import { ChangePasswordForm } from "@/features/auth/components/change-password-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function SettingsPage() {
  const session = await getServerSession()

  if (!session || session.user.status !== "active") {
    redirect("/login")
  }

  return (
    <div className="mx-auto w-full max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Update the password for {session.user.email}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  )
}
```

Save as `src/app/settings/page.tsx`.

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 4: Verify in the browser**

While logged in (from Task 10), navigate to `http://localhost:3000/settings`. Change the password again (using the password set in Task 10 as "current"), confirm success toast. Log out, log in with the newest password — should succeed. While logged out, navigate directly to `/settings` — middleware should redirect to `/login`.

- [ ] **Step 5: Commit**

```bash
git add src/app/settings/ src/features/auth/components/change-password-form.tsx
git commit -m "Add settings page with change-password form"
```

---

### Task 12: Admin seed script

**Files:**
- Modify: `src/server/db/seed.ts` (replaces the Foundation-phase stub)

**Interfaces:**
- Consumes: `auth` from `@/server/auth/config` (Task 3); `db` from `./index`; `user` from `./schema`.
- Produces: a runnable `pnpm db:seed` that creates one admin account.

- [ ] **Step 1: Replace the seed script**

```ts
import { config } from "dotenv"

config({ path: ".env.local" })

import { eq } from "drizzle-orm"

import { db } from "./index"
import { user } from "./schema"
import { auth } from "@/server/auth/config"

async function main() {
  const email = process.env.ADMIN_SEED_EMAIL
  const password = process.env.ADMIN_SEED_PASSWORD

  if (!email || !password) {
    throw new Error(
      "ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be set in .env.local"
    )
  }

  const existing = await db.query.user.findFirst({
    where: eq(user.email, email),
  })

  if (existing) {
    console.log(`Admin user ${email} already exists — skipping.`)
    return
  }

  await auth.api.signUpEmail({
    body: { email, password, name: "Admin" },
  })

  await db
    .update(user)
    .set({ role: "admin", status: "active", emailVerified: true })
    .where(eq(user.email, email))

  console.log(`Admin user ${email} created.`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
```

Save as `src/server/db/seed.ts` (overwriting the Foundation stub).

- [ ] **Step 2: Set admin seed credentials**

In `.env.local`, set `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` (password must satisfy the 8-character minimum) to real values if not already set.

- [ ] **Step 3: Run the seed script**

Run: `pnpm db:seed`
Expected: `Admin user <email> created.` printed, process exits 0.

If the `@/` import in a `tsx`-executed script fails to resolve, replace the `@/server/auth/config` import with a relative path (`../auth/config`) — `tsx` should resolve `tsconfig.json` `paths` automatically, but confirm by checking the actual error before assuming this fix is needed.

- [ ] **Step 4: Verify the admin account works**

Run: `pnpm db:seed` again.
Expected: `Admin user <email> already exists — skipping.` (idempotency check).

In the browser, navigate to `http://localhost:3000/login` and log in with `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD`. Expected: lands on `/admin/dashboard` (not `/voter/dashboard`), showing "Admin dashboard" and the admin's name/email.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/seed.ts
git commit -m "Implement admin seed script"
```

---

### Task 13: Full end-to-end verification pass

**Files:** none (verification only).

- [ ] **Step 1: Verify suspended-user enforcement**

Using the scratch-script pattern from Task 3 (temporary `.mjs` file, deleted after use), directly update the voter account created in Tasks 7–10 to `status = 'suspended'` in Neon:

```js
// scratch-suspend.mjs (temporary, delete after use)
import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
await sql`update "user" set status = 'suspended' where email = '<the voter email you used in Task 7>'`;
console.log("suspended");
```

Run it, then in the browser (already logged in as that voter from Task 11), refresh `/voter/dashboard`. Expected: redirected to `/login?error=suspended` (the layout guard from Task 5 re-checks status on every request). Attempt to log in again with that account's credentials — Better Auth's own session creation still succeeds at the credential level (status isn't checked by Better Auth itself), but the layout guard blocks access to `/voter/dashboard` immediately after.

Reset the account back: `update "user" set status = 'active' where email = '...'`, then delete the scratch script.

- [ ] **Step 2: Verify role separation**

While logged in as the voter (active again), navigate directly to `http://localhost:3000/admin/dashboard`. Expected: redirected to `/voter/dashboard` (Task 5's admin layout guard). While logged in as admin (seeded in Task 12), navigate to `http://localhost:3000/voter/dashboard`. Expected: redirected to `/admin/dashboard`.

- [ ] **Step 3: Verify tRPC protected/admin procedures reject appropriately**

This confirms Task 4's procedures are actually enforced, not just present. Temporarily add a throwaway procedure call — or, since `health` is the only router so far, verify via a scratch script hitting a manually-added test call is unnecessary: instead confirm by code review that `protectedProcedure`/`adminProcedure` exist and are exported correctly (they'll be exercised for real once Phase 3's election/candidate routers use them). Run:

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no errors — confirms `protectedProcedure` and `adminProcedure` type-check against the `Context` shape and are ready for Phase 3 routers to import.

- [ ] **Step 4: Full production build**

Run: `pnpm build`
Expected: `Compiled successfully`, TypeScript finishes with zero errors, all routes listed in the route summary (including `/`, `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/admin/dashboard`, `/voter/dashboard`, `/settings`, `/api/auth/[...all]`, `/api/trpc/[trpc]`).

- [ ] **Step 5: Confirm no secrets committed**

Run: `git status` — expect a clean tree (everything from Tasks 1–12 already committed).
Run: `git ls-files | grep -i "\.env"` — expect only `.env.example` (no `.env.local`).

- [ ] **Step 6: Final commit (only if Step 1–2's cleanup left anything uncommitted)**

```bash
git status
```

If clean, no commit needed — the phase is complete. If any scratch-script leftovers or `.env.local` accidentally got staged, unstage/remove them before committing anything further.
