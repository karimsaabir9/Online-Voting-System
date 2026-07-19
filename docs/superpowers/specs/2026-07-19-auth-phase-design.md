# Auth Phase — Design

## Context

This is Phase 2 of the Online Voting System, following the Foundation phase (project scaffold, full DB schema, tRPC wiring — see `docs/superpowers/specs/` history and `src/server/db/schema/`). The Foundation phase already created Better-Auth-shaped `user`/`session`/`account`/`verification` tables with custom `role` (`admin`/`voter`) and `status` (`active`/`suspended`) columns, and stubbed `src/server/db/seed.ts` pending this phase.

This phase implements: registration, login, logout, session management, protected routes, role-based authorization (admin/voter), a forgot/reset password flow, in-app change password, and a working admin seed script. It does not implement: election/candidate management, dashboards beyond a minimal placeholder, user management (approve/suspend/delete — the UI for it), notification-center UI, or profile editing beyond password. Those are later phases.

## Decisions Locked In

- Email verification is **required** before login (prevents fake/typo emails from voting later).
- Sessions last **30 days, rolling** (refresh on activity) — matches "stay logged in until logout."
- Forgot-password flow (request + reset via emailed link) is **included**, alongside in-app change-password.
- Better Auth's built-in **rate limiting** is enabled with defaults.
- Suspended users (`status: "suspended"`) are blocked at the protected-layout and `protectedProcedure` boundary, not via a Better Auth internal hook.
- Registration only ever creates `voter` role accounts; `admin` accounts only come from the seed script.
- Toasts (via the already-wired `sonner` Toaster) give in-session feedback now; persisted `notifications` rows are deferred to Phase 5 (no notification-center UI exists yet to display them).
- Full profile editing (name/avatar) is deferred to Phase 5; this phase only ships change-password, since that's fundamentally an auth action.

## Better Auth Configuration

**`src/server/auth/config.ts`** — a `betterAuth()` instance:
- `database`: `drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } })`
- `emailAndPassword`: `enabled: true`, `requireEmailVerification: true`, `minPasswordLength: 8`, `sendResetPassword` wired to `sendEmail` (Resend) with the `reset-password` template
- `emailVerification`: `sendVerificationEmail` wired to `sendEmail` with the `verify-email` template, `autoSignInAfterVerification: true`
- `session`: `expiresIn: 60 * 60 * 24 * 30` (30 days), `updateAge: 60 * 60 * 24` (rolling daily refresh)
- `rateLimit`: `enabled: true` (library defaults)
- `user.additionalFields`: `{ role: { type: "string", defaultValue: "voter", input: false }, status: { type: "string", defaultValue: "active", input: false } }` — `input: false` so these can never be client-supplied at signup
- `advanced.database.generateId: false` — Postgres generates UUIDs via `gen_random_uuid()`, not Better Auth

**Route handler**: `src/app/api/auth/[...all]/route.ts` using `toNextJsHandler(auth)`.

**Client** (`src/lib/auth-client.ts`): `createAuthClient` from `better-auth/react`, re-exporting `useSession`, `signIn`, `signUp`, `signOut`, `forgetPassword`, `resetPassword`, `changePassword`.

## Route Protection (defense in depth)

1. **Middleware** (`src/middleware.ts`) — optimistic, edge-safe cookie-presence check via `getSessionCookie` from `better-auth/cookies`. Redirects unauthenticated visitors away from `/admin/*` and `/voter/*` to `/login`; redirects authenticated users away from `/login`/`/register` to their dashboard. UX fast-path only, not a security boundary.
2. **Section layouts** (`app/admin/layout.tsx`, `app/voter/layout.tsx`) — the real boundary. Each calls `auth.api.getSession({ headers: await headers() })` server-side and redirects if: no session, role doesn't match the section, or `status !== "active"`.
3. **tRPC procedures** (`src/server/api/trpc.ts`) — `protectedProcedure` (requires active session) and `adminProcedure` (requires session + `role === "admin"`), layered on the existing `publicProcedure`. `createTRPCContext` resolves `auth.api.getSession({ headers })` and exposes `session` alongside `db`. This is the actual data-access gate — UI redirects are never trusted alone.

## Pages

**Correction from the folder structure sketched in the Foundation phase**: `(admin)` and `(voter)` as parenthesized route groups would both map to the *same* URLs (route groups don't add a URL segment — `app/(admin)/dashboard` and `app/(voter)/dashboard` would both resolve to `/dashboard` and collide). Admin and voter areas need distinct real folder segments so middleware can match on URL prefix and so the two dashboards don't fight for the same route:

- `app/(auth)/login`, `.../register`, `.../verify-email`, `.../forgot-password`, `.../reset-password` — route group (no URL segment, e.g. `/login`), forms built with React Hook Form + Zod using the existing `src/components/ui/form.tsx`. Register always creates a `voter`.
- `app/admin/...` — real folder, URL prefix `/admin/*`, `layout.tsx` here is the admin route-group boundary described above. `app/admin/dashboard/page.tsx` is a minimal placeholder (signed-in admin info + logout) proving the guard/role-split works; the real dashboard is Phase 5.
- `app/voter/...` — real folder, URL prefix `/voter/*`, same pattern for the voter role.
- `app/settings/page.tsx` — shared change-password form, reachable by any authenticated user regardless of role (guarded by "has an active session," not by role).

## Validation

**`src/schemas/auth.ts`**: `loginSchema`, `registerSchema` (with password-confirmation `.refine`), `forgotPasswordSchema`, `resetPasswordSchema`, `changePasswordSchema` — shared between RHF (client) and any server-side re-validation.

## Email Templates

**`src/features/auth/emails/`**: `verify-email.tsx`, `reset-password.tsx` — plain styled JSX passed directly to Resend's `react` field. No new email-templating dependency.

## Admin Seed Script

**`src/server/db/seed.ts`** (replacing the Foundation-phase stub): calls `auth.api.signUpEmail({ body: { email: ADMIN_SEED_EMAIL, password: ADMIN_SEED_PASSWORD, name: "Admin" } })` — reusing Better Auth's own password hashing rather than reimplementing it — then a direct `db.update` sets that user's `role: "admin"`, `status: "active"`, `emailVerified: true`, skipping the verification-email step since this is a trusted, operator-initiated bootstrap action.

## Out of Scope (explicitly deferred)

Election/candidate management, real dashboards, user management UI (approve/suspend/delete), notification-center UI, profile editing beyond password, audit log writes (no admin-sensitive actions exist yet in this phase).

## Verification

- Register a new voter → receive verification email (or see it logged if Resend sandbox) → cannot log in until verified → verify → can log in.
- Login with wrong password fails with a friendly error; repeated failures are rate-limited.
- Logged-in voter cannot access `/admin/*` (redirected); logged-in admin (via seed) can.
- Suspended user (manually flip `status` in Neon) is blocked from protected routes and `protectedProcedure` calls even with a valid session.
- Forgot-password → reset link → new password → can log in with new password, not old one.
- Change-password (logged in) requires current password, rejects wrong current password.
- Session persists across browser restarts for up to 30 days; `pnpm build` passes with zero TypeScript errors.
