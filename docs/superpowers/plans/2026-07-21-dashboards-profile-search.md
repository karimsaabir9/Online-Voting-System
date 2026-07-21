# Dashboards, Profile & Search/Filters (Phase 5A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add richer admin/voter dashboards, profile editing (name/avatar/email), and search/filters on existing election/candidate lists.

**Architecture:** Profile editing goes entirely through Better Auth's built-in `updateUser`/`changeEmail` client methods — no new tRPC procedures, no risk of bypassing the existing `role`/`status` `input: false` protection. Dashboards are each backed by one bundled tRPC query per role (`elections.dashboardStats`, `voting.dashboard`) so the page issues one round trip, not several. A new `activity_logs`-writing helper (`logActivity`) is called from existing election/candidate/vote mutations to power the admin activity feed. Search/filters are client-side for the two lists that already fetch their complete dataset (voter elections, admin candidates) and server-side for the one list that already paginates (admin elections), reusing a new shared SQL helper (`effectiveStatusCondition`) that mirrors the existing `getEffectiveStatus()` pure function so status filtering logic isn't duplicated with different behavior in two places.

**Tech Stack:** Next.js 16 App Router, TypeScript, tRPC, Better Auth, Drizzle ORM, Neon Postgres, TanStack Query, shadcn/ui (base-nova/Base UI), Zod, React Hook Form, Lucide React, Resend.

## Global Constraints

- Better Auth's `updateUser` (verified in the installed `better-auth@1.6.23` source, `dist/api/routes/update-user.mjs`) filters additional fields through `parseUserInput`, which respects `input: false` on the `role`/`status` fields already declared in `src/server/auth/config.ts` — it is therefore safe for any authenticated user to call directly from the client. Never build a custom tRPC mutation that writes `user.name`/`user.image` directly; always go through `authClient.updateUser`.
- `changeEmail` sends its confirmation link to the user's **current** email address, not the new one (verified in the same source file). The UI must reflect this ("check your current email"), not imply the new address receives anything.
- `uploads.getSignature` changes from `adminProcedure` to `protectedProcedure` with a folder-based check inside the handler: `"elections/banners"` and `"candidates/photos"` remain admin-only; `"users/avatars"` is available to any authenticated user. Do not simply widen the whole procedure without preserving the folder-level restriction — that would let voters obtain valid signed-upload credentials for admin-only Cloudinary folders.
- Recent-activity log entries for `vote.cast` must be written with `userId: null` and a description containing only the election's title — never the voter's identity or which candidate they chose. This is a deliberate ballot-secrecy protection for the admin-visible feed, not an oversight to "fix."
- `effectiveStatusCondition()` (new, `src/server/election-status-sql.ts`) mirrors `getEffectiveStatus()` (existing, `src/lib/election-status.ts`) in SQL. The two must stay in sync — if the status-derivation rules ever change, both files need updating together.
- **Admin-only UI added in this phase (admin nav, admin elections search/filter, admin dashboard stats) is verified via curl/tRPC-level data checks plus `tsc`/`pnpm build`/code review — never via a live admin browser session.** This is a standing project rule (confirmed after an unauthorized-escalation incident in the Voter Voting phase, re-confirmed after a controller dispatch error in the Election Results phase): admin credentials are never entered into a browser, full stop. This is an accepted, precedented verification standard for this project's admin-only UI, not a shortcut — do not attempt to work around it by creating a second admin account or elevating a throwaway account's role.
- Voter-facing UI added in this phase (voter dashboard, voter elections search/filter, profile editing) CAN and should be verified with a real browser session — but only ever as a throwaway voter account registered for the task, never the real admin.
- No test framework exists in this project — every "verify" step uses `tsc --noEmit`, `pnpm build`, and live curl/browser/DB-script checks, never `jest`/`vitest`.
- **Git commit messages must NOT include `Co-Authored-By: Claude`, "Generated with Claude Code", or any AI-attribution trailer.**
- Every new/modified page requires a full `pnpm build`, not just `tsc --noEmit` (a real Suspense-boundary bug was only caught by a production build in an earlier phase).
- Path alias `@/*` maps to `src/*`. File naming: kebab-case files, PascalCase components. This project uses Base UI, not Radix — `Select` uses `value`/`onValueChange`, `Button`-as-link uses `render={<Link .../>}`.

## Operational Notes

- Keep `pnpm dev` running in the background throughout.
- Admin-side data setup and verification: sign in via `curl` using `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` from `.env.local` — same pattern used throughout every prior phase.
- Voter-side browser verification: register throwaway voter accounts, verify email via a scratch DB script (`UPDATE "user" SET email_verified = true WHERE email = '...'`), then log into the BROWSER as that voter through the normal login form.
- Elevating any account to admin, or inserting rows via raw SQL bypassing the real APIs, is NOT authorized (unchanged from every prior phase).
- Clean up ALL test data (elections, candidates, votes, throwaway voter accounts, cookie jars, scratch scripts) at the end of every task.

---

### Task 1: Activity logging infrastructure + instrumentation

**Files:**
- Create: `src/server/activity-log.ts`
- Modify: `src/server/api/routers/elections.ts` (create/publish/close/delete)
- Modify: `src/server/api/routers/candidates.ts` (create/delete only — not update)
- Modify: `src/server/api/routers/voting.ts` (castVote)

**Interfaces:**
- Produces: `logActivity(db, { userId, action, description }): Promise<void>` from `@/server/activity-log`, consumed by Task 9's `dashboardStats` procedure (reads `activityLogs` back out).

- [ ] **Step 1: Write the activity log helper**

```ts
import type { db as dbType } from "@/server/db";
import { activityLogs } from "@/server/db/schema";

type Database = typeof dbType;

export async function logActivity(
  db: Database,
  input: { userId: string | null; action: string; description: string }
) {
  await db.insert(activityLogs).values(input);
}
```

Save as `src/server/activity-log.ts`.

- [ ] **Step 2: Wire into `src/server/api/routers/elections.ts`**

Read the current file first. Add the import:

```ts
import { logActivity } from "@/server/activity-log";
```

In `create`, after the insert, before `return election;`:

```ts
    await logActivity(ctx.db, {
      userId: ctx.session.user.id,
      action: "election.created",
      description: `Created election "${election.title}"`,
    });

    return election;
```

In `publish`, after the update, before `return updated;`:

```ts
      await logActivity(ctx.db, {
        userId: ctx.session.user.id,
        action: "election.published",
        description: `Published election "${updated.title}"`,
      });

      return updated;
```

In `close`, after the update, before `return updated;`:

```ts
      await logActivity(ctx.db, {
        userId: ctx.session.user.id,
        action: "election.closed",
        description: `Closed election "${updated.title}"`,
      });

      return updated;
```

In `delete`, inside the `try` block, after the `if (!deleted) { throw ... }` check, before `return deleted;`:

```ts
        await logActivity(ctx.db, {
          userId: ctx.session.user.id,
          action: "election.deleted",
          description: `Deleted election "${deleted.title}"`,
        });

        return deleted;
```

- [ ] **Step 3: Wire into `src/server/api/routers/candidates.ts`**

Read the current file first. Add the import:

```ts
import { logActivity } from "@/server/activity-log";
```

In `create`, after the insert, before `return candidate;`:

```ts
    await logActivity(ctx.db, {
      userId: ctx.session.user.id,
      action: "candidate.created",
      description: `Added candidate "${candidate.fullName}"`,
    });

    return candidate;
```

In `delete`, inside the `try` block, after the `if (!deleted) { throw ... }` check, before `return deleted;`:

```ts
        await logActivity(ctx.db, {
          userId: ctx.session.user.id,
          action: "candidate.deleted",
          description: `Removed candidate "${deleted.fullName}"`,
        });

        return deleted;
```

Do NOT add logging to `update` — field edits are too noisy for a meaningful activity feed entry (this is an explicit design decision, not an omission).

- [ ] **Step 4: Wire into `src/server/api/routers/voting.ts`**

Read the current file first. Add the import:

```ts
import { logActivity } from "@/server/activity-log";
```

In `castVote`, inside the `try` block, after the insert succeeds, before `return vote;`. The `election` variable is already in scope from earlier in the procedure (fetched to check visibility/status) — use its `.title`. **Do not include the voter's identity or the chosen candidate** — `userId` must be `null`:

```ts
        await logActivity(ctx.db, {
          userId: null,
          action: "vote.cast",
          description: `A vote was cast in "${election.title}"`,
        });

        return vote;
```

- [ ] **Step 5: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 6: Verify with real data**

Sign in as admin via curl, create an election, publish it, add a candidate, close the election (or create a second one to delete). Register+verify a throwaway voter, sign in via curl, cast a vote (on an election you keep active/published for this, not the one you closed). Then query `activityLogs` directly via a scratch script:

```bash
cat > scratch-verify-activity.ts << 'EOF'
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("./src/server/db");
  const rows = await db.query.activityLogs.findMany({
    orderBy: (fields, { desc }) => [desc(fields.createdAt)],
    limit: 10,
  });
  console.log(JSON.stringify(rows, null, 2));
}

main();
EOF
npx tsx scratch-verify-activity.ts
```

Expected: rows for `election.created`, `election.published`, `election.closed` (or `election.deleted`), `candidate.created`, and `vote.cast` — each with a correct human-readable `description`. Confirm the `vote.cast` row has `userId: null` and its description does NOT name the voter or candidate, only the election title.

- [ ] **Step 7: Clean up**

Delete all test elections/candidates/votes/voter accounts created above, delete `scratch-verify-activity.ts` and any cookie jars. Confirm via a DB check that `activityLogs` no longer references any deleted test data in a way that would confuse later verification (the `userId` FK is `onDelete: "set null"`, so rows may persist harmlessly with `userId: null` after a user is deleted — that's fine, but delete the test rows directly if you want a fully clean slate: `db.delete(activityLogs)` for the rows you just created, matched by their description text).

- [ ] **Step 8: Commit**

```bash
git add src/server/activity-log.ts src/server/api/routers/elections.ts src/server/api/routers/candidates.ts src/server/api/routers/voting.ts
git commit -m "Add activity logging to election, candidate, and vote mutations"
```

---

### Task 2: Admin navigation + settings reachability

**Files:**
- Create: `src/features/admin/components/admin-nav.tsx`
- Modify: `src/app/admin/layout.tsx`
- Modify: `src/features/voting/components/voter-nav.tsx`

**Interfaces:**
- Produces: `AdminNav` component from `@/features/admin/components/admin-nav`.

**Context:** The admin side currently has NO persistent navigation at all — `admin/dashboard/page.tsx` has no links to `/admin/elections`, and `/settings` (built in the Auth phase) has no link from anywhere in the app for either role. This blocks Phase 5A's own profile-editing feature from being reachable, so fixing it is in scope here, not a tangential refactor.

- [ ] **Step 1: Write the admin nav**

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Vote } from "lucide-react"

import { ThemeToggle } from "@/components/shared/theme-toggle"
import { LogoutButton } from "@/features/auth/components/logout-button"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/elections", label: "Elections" },
  { href: "/settings", label: "Settings" },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      <div className="flex items-center gap-6">
        <Link href="/admin/dashboard" className="flex items-center gap-2 font-semibold">
          <Vote className="size-5" />
          Online Voting System
        </Link>
        <nav className="flex items-center gap-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium",
                pathname.startsWith(link.href)
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  )
}
```

Save as `src/features/admin/components/admin-nav.tsx`.

- [ ] **Step 2: Wire it into the admin layout**

Read the current `src/app/admin/layout.tsx` first. Replace its body with:

```tsx
import { redirect } from "next/navigation"

import { getServerSession } from "@/server/auth/get-session"
import { AdminNav } from "@/features/admin/components/admin-nav"

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
    redirect("/suspended")
  }
  if (session.user.role !== "admin") {
    redirect("/voter/dashboard")
  }

  return (
    <div className="flex flex-1 flex-col">
      <AdminNav />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}
```

(This only adds the `AdminNav` wrapper — the redirect guard logic is byte-for-byte unchanged from the existing file.)

- [ ] **Step 3: Add a Settings link to the voter nav**

Read the current `src/features/voting/components/voter-nav.tsx` first. Add `"/settings"` to the `NAV_LINKS` array:

```ts
const NAV_LINKS = [
  { href: "/voter/dashboard", label: "Dashboard" },
  { href: "/voter/elections", label: "Elections" },
  { href: "/voter/votes", label: "My Votes" },
  { href: "/settings", label: "Settings" },
]
```

No other change to this file.

- [ ] **Step 4: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 5: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds, route table unchanged (no new routes, just layout/component changes).

- [ ] **Step 6: Verify the admin nav renders (curl-only, per Global Constraints)**

Sign in as admin via curl, then fetch the dashboard page HTML with the session cookie and confirm the nav links are present:

```bash
curl -s -b cookies-admin.txt http://localhost:3000/admin/dashboard | grep -o "Dashboard\|Elections\|Settings" | sort -u
```

Expected: all three labels present in the output.

- [ ] **Step 7: Verify the voter nav's new Settings link in the browser**

As a throwaway voter (browser, normal login form): confirm a "Settings" link now appears in the voter nav and navigates to `/settings`.

- [ ] **Step 8: Clean up**

Delete the throwaway voter account and cookie jars.

- [ ] **Step 9: Commit**

```bash
git add src/features/admin/components/admin-nav.tsx src/app/admin/layout.tsx src/features/voting/components/voter-nav.tsx
git commit -m "Add admin navigation and a settings link to the voter nav"
```

---

### Task 3: Email change — Better Auth config + template

**Files:**
- Create: `src/features/auth/emails/change-email-template.tsx`
- Modify: `src/features/auth/emails/send-auth-emails.tsx`
- Modify: `src/server/auth/config.ts`

**Interfaces:**
- Produces: `sendChangeEmailConfirmationEmail(to, url, name, newEmail): Promise<void>` from `@/features/auth/emails/send-auth-emails`, consumed by `src/server/auth/config.ts`'s `user.changeEmail.sendChangeEmailConfirmation` handler.

- [ ] **Step 1: Write the email template**

```tsx
type ChangeEmailTemplateProps = {
  name: string;
  url: string;
  newEmail: string;
};

export function ChangeEmailTemplate({ name, url, newEmail }: ChangeEmailTemplateProps) {
  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20 }}>Confirm your new email address</h1>
      <p>Hi {name},</p>
      <p>
        We received a request to change your Online Voting System email to{" "}
        <strong>{newEmail}</strong>. Click the button below to confirm this change. This
        link expires in 1 hour.
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
        Confirm email change
      </a>
      <p style={{ color: "#6b7280", fontSize: 12, marginTop: 24 }}>
        If you didn&apos;t request this, you can safely ignore this email — your email
        address will not change.
      </p>
    </div>
  );
}
```

Save as `src/features/auth/emails/change-email-template.tsx`.

- [ ] **Step 2: Add the send function**

Read the current `src/features/auth/emails/send-auth-emails.tsx` first. Add the import:

```tsx
import { ChangeEmailTemplate } from "./change-email-template";
```

Add this function:

```tsx
export async function sendChangeEmailConfirmationEmail(
  to: string,
  url: string,
  name: string,
  newEmail: string
) {
  await sendEmail({
    to,
    subject: "Confirm your new email — Online Voting System",
    react: <ChangeEmailTemplate name={name} url={url} newEmail={newEmail} />,
  });
}
```

- [ ] **Step 3: Wire it into Better Auth config**

Read the current `src/server/auth/config.ts` first. Add `sendChangeEmailConfirmationEmail` to the import from `@/features/auth/emails/send-auth-emails`. Add a `changeEmail` block inside the existing `user` config object, alongside `additionalFields`:

```ts
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        await sendChangeEmailConfirmationEmail(user.email, url, user.name, newEmail);
      },
    },
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 5: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 6: Verify the endpoint is live**

There's no UI yet (Task 5 builds it) — verify the raw Better Auth endpoint directly. Register and verify a throwaway voter, sign in via curl, then call the endpoint:

```bash
curl -s -i -b cookies-voter.txt -X POST http://localhost:3000/api/auth/change-email \
  -H "Content-Type: application/json" \
  -d '{"newEmail":"changed-email-test@example.com"}'
```

Expected: 200, `{"status":true}`. Check your Resend dashboard/logs (or the terminal running `pnpm dev`, since Resend calls will surface errors there if the API key is invalid) to confirm an email was attempted to the throwaway voter's ORIGINAL address (not `changed-email-test@example.com`) — this is the "confirmation goes to the current email" behavior documented in Global Constraints.

- [ ] **Step 7: Clean up**

Delete the throwaway voter account and cookie jars.

- [ ] **Step 8: Commit**

```bash
git add src/features/auth/emails/change-email-template.tsx src/features/auth/emails/send-auth-emails.tsx src/server/auth/config.ts
git commit -m "Enable email change with confirmation via Resend"
```

---

### Task 4: Avatar upload authorization fix

**Files:**
- Modify: `src/server/api/routers/uploads.ts`
- Modify: `src/components/shared/image-upload.tsx`

**Interfaces:**
- Produces: `uploads.getSignature` now accepts `folder: "elections/banners" | "candidates/photos" | "users/avatars"`, callable by any authenticated user for `"users/avatars"` and only admins for the other two. `ImageUpload`'s `folder` prop type widened to match.

**Context:** `uploads.getSignature` is currently `adminProcedure` — this blocks voters from ever getting a signed upload URL, which Task 5's avatar upload needs for both roles. Widening it to `protectedProcedure` without a folder check would let any authenticated user obtain valid signatures for the admin-only Cloudinary folders too (a real, if minor, authorization loosening) — so the fix must keep folder-level restriction, not just broaden the whole procedure.

- [ ] **Step 1: Update the uploads router**

Read the current `src/server/api/routers/uploads.ts` first, then replace it with:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { getUploadSignature } from "@/lib/cloudinary";

const ADMIN_ONLY_FOLDERS = ["elections/banners", "candidates/photos"] as const;

export const uploadsRouter = createTRPCRouter({
  getSignature: protectedProcedure
    .input(
      z.object({
        folder: z.enum(["elections/banners", "candidates/photos", "users/avatars"]),
      })
    )
    .query(({ ctx, input }) => {
      if (
        ADMIN_ONLY_FOLDERS.includes(input.folder as (typeof ADMIN_ONLY_FOLDERS)[number]) &&
        ctx.session.user.role !== "admin"
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return getUploadSignature(input.folder);
    }),
});
```

- [ ] **Step 2: Update the ImageUpload component's folder prop type**

Read the current `src/components/shared/image-upload.tsx` first. Change the `folder` field of `ImageUploadProps`:

```ts
type ImageUploadProps = {
  folder: "elections/banners" | "candidates/photos" | "users/avatars"
  value?: string
  onChange: (url: string) => void
}
```

No other change to this file — the upload logic already works with any folder string.

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 4: Verify against the running dev server**

Register+verify a throwaway voter, sign in via curl, request a signature for each folder:

```bash
INPUT_AVATAR=$(node -e "console.log(encodeURIComponent(JSON.stringify({json:{folder:'users/avatars'}})))")
curl -s -i -b cookies-voter.txt "http://localhost:3000/api/trpc/uploads.getSignature?input=$INPUT_AVATAR" | head -3

INPUT_BANNER=$(node -e "console.log(encodeURIComponent(JSON.stringify({json:{folder:'elections/banners'}})))")
curl -s -i -b cookies-voter.txt "http://localhost:3000/api/trpc/uploads.getSignature?input=$INPUT_BANNER" | head -3
```

Expected: the `users/avatars` request returns 200 with a valid signature; the `elections/banners` request returns 403 FORBIDDEN. Then sign in as admin via curl and confirm admin CAN get a signature for `elections/banners` (regression check — this must not have broken):

```bash
curl -s -i -b cookies-admin.txt "http://localhost:3000/api/trpc/uploads.getSignature?input=$INPUT_BANNER" | head -3
```

Expected: 200.

- [ ] **Step 5: Clean up**

Delete the throwaway voter account and cookie jars.

- [ ] **Step 6: Commit**

```bash
git add src/server/api/routers/uploads.ts src/components/shared/image-upload.tsx
git commit -m "Allow voter avatar uploads while keeping admin-only folders restricted"
```

---

### Task 5: Profile settings UI

**Files:**
- Modify: `src/schemas/auth.ts`
- Create: `src/features/auth/components/profile-form.tsx`
- Create: `src/features/auth/components/change-email-form.tsx`
- Modify: `src/app/settings/page.tsx`

**Interfaces:**
- Consumes: `authClient.updateUser`/`authClient.changeEmail` (Better Auth core client methods — no plugin needed); `ImageUpload` (Task 4); `uploads.getSignature` (Task 4).
- Produces: `ProfileForm`, `ChangeEmailForm` components.

- [ ] **Step 1: Add the new schemas**

Read the current `src/schemas/auth.ts` first. Add:

```ts
export const updateProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  image: z.string().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changeEmailSchema = z.object({
  newEmail: z.email("Enter a valid email address"),
});
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
```

- [ ] **Step 2: Write the profile form**

```tsx
"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { updateProfileSchema, type UpdateProfileInput } from "@/schemas/auth"
import { authClient } from "@/lib/auth-client"
import { ImageUpload } from "@/components/shared/image-upload"
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

type ProfileFormProps = {
  name: string
  image: string | null
}

export function ProfileForm({ name, image }: ProfileFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      name,
      image: image ?? "",
    },
  })

  async function onSubmit(values: UpdateProfileInput) {
    setIsSubmitting(true)

    const { error } = await authClient.updateUser({
      name: values.name,
      image: values.image || null,
    })

    setIsSubmitting(false)

    if (error) {
      toast.error(error.message ?? "Could not update profile")
      return
    }

    toast.success("Profile updated")
    router.refresh()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="image"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Avatar</FormLabel>
              <FormControl>
                <ImageUpload
                  folder="users/avatars"
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </Form>
  )
}
```

Save as `src/features/auth/components/profile-form.tsx`.

Note on `image: values.image || null`: Better Auth's `/update-user` endpoint treats an `undefined` image as "leave unchanged" but accepts an explicit `null` to clear it (its OpenAPI schema declares `image` as `nullable: true`). Sending `null` when the field is empty (rather than omitting it) is what actually lets a user remove their avatar — this is a deliberate choice, not a simplification to "fix" later.

- [ ] **Step 3: Write the change email form**

```tsx
"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { changeEmailSchema, type ChangeEmailInput } from "@/schemas/auth"
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

export function ChangeEmailForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const form = useForm<ChangeEmailInput>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { newEmail: "" },
  })

  async function onSubmit(values: ChangeEmailInput) {
    setIsSubmitting(true)

    const { error } = await authClient.changeEmail({ newEmail: values.newEmail })

    setIsSubmitting(false)

    if (error) {
      toast.error(error.message ?? "Could not request email change")
      return
    }

    setSent(true)
    form.reset()
  }

  if (sent) {
    return (
      <p className="text-muted-foreground text-sm">
        Check your current email address for a confirmation link to finish changing your
        email.
      </p>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="newEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New email address</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Requesting…" : "Change email"}
        </Button>
      </form>
    </Form>
  )
}
```

Save as `src/features/auth/components/change-email-form.tsx`.

- [ ] **Step 4: Wire both into the settings page**

Read the current `src/app/settings/page.tsx` first (it currently has one Card for password change). Replace it with:

```tsx
import { redirect } from "next/navigation"

import { getServerSession } from "@/server/auth/get-session"
import { ChangePasswordForm } from "@/features/auth/components/change-password-form"
import { ProfileForm } from "@/features/auth/components/profile-form"
import { ChangeEmailForm } from "@/features/auth/components/change-email-form"
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
    <div className="mx-auto w-full max-w-md space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your name and avatar.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm name={session.user.name} image={session.user.image ?? null} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Email address</CardTitle>
          <CardDescription>
            Change the email for {session.user.email}. You&apos;ll need to confirm from
            your current address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangeEmailForm />
        </CardContent>
      </Card>
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

- [ ] **Step 5: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 6: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 7: Verify in the browser as a throwaway voter**

Register and verify a throwaway voter, log in via the browser's normal login form (never the real admin). Navigate to `/settings`:
- Change the name and upload an avatar image via the `ImageUpload` widget — confirm a success toast, and confirm the name shown at the top of the password card's description (which re-renders via `router.refresh()`) reflects the change without a manual page reload.
- Remove the avatar (click the X on the uploaded preview) and save again — confirm it clears.
- Request an email change to a new address — confirm the "check your current email" message appears. Check the terminal running `pnpm dev` or your Resend logs to confirm an email was sent to the voter's ORIGINAL address, not the new one.

- [ ] **Step 8: Clean up**

Delete the throwaway voter account and any test elections/candidates you didn't need for this task. No cookie jars should remain if you used the browser exclusively for verification here.

- [ ] **Step 9: Commit**

```bash
git add src/schemas/auth.ts src/features/auth/components/profile-form.tsx src/features/auth/components/change-email-form.tsx src/app/settings/page.tsx
git commit -m "Add profile and email editing to the settings page"
```

---

### Task 6: Admin elections search/filter

**Files:**
- Create: `src/server/election-status-sql.ts`
- Modify: `src/server/api/routers/elections.ts`
- Modify: `src/features/elections/components/elections-table.tsx`

**Interfaces:**
- Produces: `effectiveStatusCondition(status, now): SQL` from `@/server/election-status-sql`, consumed here and by Task 9's `dashboardStats`.
- Modifies: `elections.list` input gains optional `search`/`status` fields.

- [ ] **Step 1: Write the shared SQL status condition helper**

```ts
import { and, eq, gt, gte, lt, lte, ne, type SQL } from "drizzle-orm";

import { elections } from "@/server/db/schema";
import type { EffectiveElectionStatus } from "@/lib/election-status";

/**
 * Mirrors getEffectiveStatus()'s logic in SQL so filtering/counting can
 * happen at the database layer instead of loading every row into app code.
 * Keep in sync with src/lib/election-status.ts if that logic ever changes.
 */
export function effectiveStatusCondition(
  status: EffectiveElectionStatus,
  now: Date
): SQL {
  switch (status) {
    case "draft":
      return eq(elections.status, "draft");
    case "closed":
      return eq(elections.status, "closed");
    case "upcoming":
      return and(
        ne(elections.status, "draft"),
        ne(elections.status, "closed"),
        gt(elections.startDate, now)
      )!;
    case "active":
      return and(
        ne(elections.status, "draft"),
        ne(elections.status, "closed"),
        lte(elections.startDate, now),
        gte(elections.endDate, now)
      )!;
    case "ended":
      return and(
        ne(elections.status, "draft"),
        ne(elections.status, "closed"),
        lt(elections.endDate, now)
      )!;
  }
}
```

Save as `src/server/election-status-sql.ts`.

- [ ] **Step 2: Update `elections.list`**

Read the current `src/server/api/routers/elections.ts` first. Update the drizzle-orm import to add `and` and `ilike`:

```ts
import { eq, count, and, ilike } from "drizzle-orm";
```

Add the import:

```ts
import { effectiveStatusCondition } from "@/server/election-status-sql";
```

Replace the `list` procedure with:

```ts
  list: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(10),
        search: z.string().trim().min(1).optional(),
        status: z
          .enum(["all", "draft", "upcoming", "active", "ended", "closed"])
          .default("all"),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.pageSize;
      const now = new Date();

      const conditions = [];
      if (input.search) {
        conditions.push(ilike(elections.title, `%${input.search}%`));
      }
      if (input.status !== "all") {
        conditions.push(effectiveStatusCondition(input.status, now));
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, totalRow] = await Promise.all([
        ctx.db.query.elections.findMany({
          where: whereClause,
          orderBy: (fields, { desc }) => [desc(fields.createdAt)],
          limit: input.pageSize,
          offset,
          with: { candidates: { columns: { id: true } } },
        }),
        ctx.db.select({ total: count() }).from(elections).where(whereClause),
      ]);

      return {
        items: items.map(({ candidates, ...election }) => ({
          ...election,
          candidateCount: candidates.length,
        })),
        total: totalRow[0].total,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),
```

- [ ] **Step 3: Add search/filter UI to the elections table**

Read the current `src/features/elections/components/elections-table.tsx` first. Replace the whole file with:

```tsx
"use client"

import * as React from "react"
import Link from "next/link"
import { MoreHorizontal, Search } from "lucide-react"
import { toast } from "sonner"

import { trpc } from "@/lib/trpc/client"
import { ElectionStatusBadge } from "./election-status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "upcoming", label: "Upcoming" },
  { value: "active", label: "Active" },
  { value: "ended", label: "Ended" },
  { value: "closed", label: "Closed" },
] as const

export function ElectionsTable() {
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState<(typeof STATUS_OPTIONS)[number]["value"]>("all")
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null)
  const pageSize = 10

  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.elections.list.useQuery({
    page,
    pageSize,
    search: search.trim() || undefined,
    status,
  })

  const deleteMutation = trpc.elections.delete.useMutation({
    onSuccess: async () => {
      await utils.elections.list.invalidate()
      toast.success("Election deleted")
      setPendingDeleteId(null)
    },
    onError: (error) => {
      toast.error(error.message)
      setPendingDeleteId(null)
    },
  })

  const publishMutation = trpc.elections.publish.useMutation({
    onSuccess: async () => {
      await utils.elections.list.invalidate()
      toast.success("Election published")
    },
    onError: (error) => toast.error(error.message),
  })

  const closeMutation = trpc.elections.close.useMutation({
    onSuccess: async () => {
      await utils.elections.list.invalidate()
      toast.success("Election closed")
    },
    onError: (error) => toast.error(error.message),
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            placeholder="Search by title…"
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as (typeof STATUS_OPTIONS)[number]["value"])
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Loading elections…</p>}

      {!isLoading && (!data || data.items.length === 0) && (
        <p className="text-muted-foreground text-sm">No elections match your filters.</p>
      )}

      {!isLoading && data && data.items.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Candidates</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((election) => (
                <TableRow key={election.id}>
                  <TableCell>
                    <Link
                      href={`/admin/elections/${election.id}`}
                      className="font-medium hover:underline"
                    >
                      {election.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ElectionStatusBadge election={election} />
                  </TableCell>
                  <TableCell>{election.startDate.toLocaleDateString()}</TableCell>
                  <TableCell>{election.endDate.toLocaleDateString()}</TableCell>
                  <TableCell>{election.candidateCount}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          render={<Link href={`/admin/elections/${election.id}`}>Edit</Link>}
                        />
                        {election.status === "draft" && (
                          <DropdownMenuItem
                            onClick={() => publishMutation.mutate({ id: election.id })}
                          >
                            Publish
                          </DropdownMenuItem>
                        )}
                        {election.status !== "draft" && election.status !== "closed" && (
                          <DropdownMenuItem
                            onClick={() => closeMutation.mutate({ id: election.id })}
                          >
                            Close
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setPendingDeleteId(election.id)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                <PaginationItem>
                  <span className="text-muted-foreground px-2 text-sm">
                    Page {page} of {totalPages}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className={
                      page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      )}

      <Dialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete election?</DialogTitle>
            <DialogDescription>
              This permanently deletes the election and all of its candidates. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => pendingDeleteId && deleteMutation.mutate({ id: pendingDeleteId })}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

This restructures the component's loading/empty conditionals so the search/filter bar stays visible during loading and empty states (the original component returned early before rendering anything else) — a necessary, minimal change to accommodate persistent filter controls, not unrelated cleanup.

- [ ] **Step 4: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 5: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 6: Verify the data layer with curl (admin-only UI — curl per Global Constraints)**

Sign in as admin, create three test elections with distinguishable titles (e.g. "Search Test Alpha", "Search Test Beta" as drafts, publish one of them). Query with search/status params:

```bash
INPUT=$(node -e "console.log(encodeURIComponent(JSON.stringify({json:{page:1,pageSize:10,search:'Search Test',status:'all'}})))")
curl -s -b cookies-admin.txt "http://localhost:3000/api/trpc/elections.list?input=$INPUT"
```

Expected: only the two "Search Test" elections returned, `total: 2`. Then filter by status:

```bash
INPUT2=$(node -e "console.log(encodeURIComponent(JSON.stringify({json:{page:1,pageSize:10,status:'draft'}})))")
curl -s -b cookies-admin.txt "http://localhost:3000/api/trpc/elections.list?input=$INPUT2"
```

Expected: only draft elections in the results (should include the un-published "Search Test" one, and exclude any published ones from other tasks' leftover data — confirm your test DB is otherwise clean before this check).

- [ ] **Step 7: Clean up**

Delete all test elections created above.

- [ ] **Step 8: Commit**

```bash
git add src/server/election-status-sql.ts src/server/api/routers/elections.ts src/features/elections/components/elections-table.tsx
git commit -m "Add server-side search and status filtering to the admin elections table"
```

---

### Task 7: Voter elections search/filter

**Files:**
- Modify: `src/app/voter/elections/page.tsx`

**Interfaces:** none new — filters `voting.listElections`'s already-fetched result client-side, using the `effectiveStatus` field that procedure already returns.

- [ ] **Step 1: Add search/filter UI**

Read the current `src/app/voter/elections/page.tsx` first. Replace it with:

```tsx
"use client"

import * as React from "react"
import { Search } from "lucide-react"

import { trpc } from "@/lib/trpc/client"
import { ElectionCard } from "@/features/voting/components/election-card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { EffectiveElectionStatus } from "@/lib/election-status"

function groupByStatus<T extends { effectiveStatus: EffectiveElectionStatus }>(items: T[]) {
  return {
    active: items.filter((e) => e.effectiveStatus === "active"),
    upcoming: items.filter((e) => e.effectiveStatus === "upcoming"),
    past: items.filter((e) => e.effectiveStatus === "ended" || e.effectiveStatus === "closed"),
  }
}

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "upcoming", label: "Upcoming" },
  { value: "active", label: "Active" },
  { value: "ended", label: "Ended" },
  { value: "closed", label: "Closed" },
] as const

export default function VoterElectionsPage() {
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState<(typeof STATUS_OPTIONS)[number]["value"]>("all")

  const { data, isLoading } = trpc.voting.listElections.useQuery()

  if (isLoading) {
    return <p className="text-muted-foreground p-6 text-sm">Loading elections…</p>
  }

  if (!data || data.length === 0) {
    return <p className="text-muted-foreground p-6 text-sm">No elections available yet.</p>
  }

  const filtered = data.filter((election) => {
    const matchesSearch = election.title.toLowerCase().includes(search.trim().toLowerCase())
    const matchesStatus = status === "all" || election.effectiveStatus === status
    return matchesSearch && matchesStatus
  })

  const { active, upcoming, past } = groupByStatus(filtered)

  return (
    <div className="space-y-8 p-6">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            placeholder="Search by title…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as (typeof STATUS_OPTIONS)[number]["value"])}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 && (
        <p className="text-muted-foreground text-sm">No elections match your filters.</p>
      )}

      {active.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Active Elections</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((election) => (
              <ElectionCard key={election.id} election={election} />
            ))}
          </div>
        </section>
      )}
      {upcoming.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Upcoming Elections</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((election) => (
              <ElectionCard key={election.id} election={election} />
            ))}
          </div>
        </section>
      )}
      {past.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Past Elections</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((election) => (
              <ElectionCard key={election.id} election={election} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 3: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 4: Verify in the browser as a throwaway voter**

Set up (as admin, curl) at least 3 published elections with distinguishable titles and different effective statuses (e.g. one active, one upcoming with a future start date). As a throwaway voter (browser): confirm typing part of a title narrows the list correctly across all three sections; confirm selecting a status option shows only matching elections; confirm clearing both restores the full list.

- [ ] **Step 5: Clean up**

Delete all test elections and the throwaway voter account.

- [ ] **Step 6: Commit**

```bash
git add src/app/voter/elections/page.tsx
git commit -m "Add client-side search and status filtering to the voter elections list"
```

---

### Task 8: Admin candidates search

**Files:**
- Modify: `src/features/candidates/components/candidates-table.tsx`

**Interfaces:** none new — filters `candidates.list`'s already-fetched result (fetched with a fixed `pageSize: 50`, effectively unpaginated for this UI) client-side.

- [ ] **Step 1: Add search UI**

Read the current `src/features/candidates/components/candidates-table.tsx` first. Replace it with:

```tsx
"use client"

import * as React from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { toast } from "sonner"

import { trpc } from "@/lib/trpc/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function CandidatesTable({ electionId }: { electionId: string }) {
  const [search, setSearch] = React.useState("")
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null)
  const utils = trpc.useUtils()

  const { data, isLoading } = trpc.candidates.list.useQuery({ electionId, page: 1, pageSize: 50 })

  const deleteMutation = trpc.candidates.delete.useMutation({
    onSuccess: async () => {
      await utils.candidates.list.invalidate({ electionId })
      toast.success("Candidate deleted")
      setPendingDeleteId(null)
    },
    onError: (error) => {
      toast.error(error.message)
      setPendingDeleteId(null)
    },
  })

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading candidates…</p>
  }

  if (!data || data.items.length === 0) {
    return <p className="text-muted-foreground text-sm">No candidates yet.</p>
  }

  const filtered = data.items.filter((candidate) =>
    candidate.fullName.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="relative max-w-xs">
        <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
        <Input
          placeholder="Search by name…"
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">No candidates match your search.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Party</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((candidate) => (
              <TableRow key={candidate.id}>
                <TableCell>
                  <Link
                    href={`/admin/elections/${electionId}/candidates/${candidate.id}`}
                    className="font-medium hover:underline"
                  >
                    {candidate.fullName}
                  </Link>
                </TableCell>
                <TableCell>{candidate.politicalParty ?? "—"}</TableCell>
                <TableCell>{candidate.position ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={candidate.status === "active" ? "default" : "outline"}>
                    {candidate.status === "active" ? "Active" : "Withdrawn"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <Link href={`/admin/elections/${electionId}/candidates/${candidate.id}`} />
                    }
                  >
                    Edit
                  </Button>{" "}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setPendingDeleteId(candidate.id)}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete candidate?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => pendingDeleteId && deleteMutation.mutate({ id: pendingDeleteId })}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 3: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 4: Verify the data layer with curl (admin-only UI — curl per Global Constraints)**

Create a test election with 3 candidates with distinguishable names. Confirm via reading the component code and a manual trace that the filter works (since this is client-side over already-correct data, the main risk is a typo in the filter predicate, not the data layer) — additionally spot-check by calling `candidates.list` via curl and confirming all 3 candidates are present in the raw response (proving the filtering is purely additive client-side behavior, not hiding real data-fetch bugs).

- [ ] **Step 5: Clean up**

Delete the test election (cascades candidates).

- [ ] **Step 6: Commit**

```bash
git add src/features/candidates/components/candidates-table.tsx
git commit -m "Add client-side name search to the admin candidates table"
```

---

### Task 9: Admin dashboard — stats procedure + UI

**Files:**
- Modify: `src/server/api/routers/elections.ts`
- Create: `src/features/dashboard/components/admin-dashboard-stats.tsx`
- Modify: `src/app/admin/dashboard/page.tsx`

**Interfaces:**
- Consumes: `effectiveStatusCondition` (Task 6); `logActivity`-written `activityLogs` rows (Task 1).
- Produces: `elections.dashboardStats` (admin query, no input).

- [ ] **Step 1: Add the `dashboardStats` procedure**

Read the current `src/server/api/routers/elections.ts` first. Update the drizzle-orm import to add `or`, `gte`, `lte`:

```ts
import { eq, count, and, or, ilike, gte, lte } from "drizzle-orm";
```

Update the schema import to add `votes` and `user`:

```ts
import { elections, votes, user } from "@/server/db/schema";
```

Add this procedure (after `hideResults`, at the end of the router):

```ts
  dashboardStats: adminProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const endingSoonThreshold = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const [
      totalElectionsRow,
      activeElectionsRow,
      totalVotesRow,
      totalVotersRow,
      endingSoon,
      resultsNotPublished,
      recentActivity,
    ] = await Promise.all([
      ctx.db.select({ value: count() }).from(elections),
      ctx.db
        .select({ value: count() })
        .from(elections)
        .where(effectiveStatusCondition("active", now)),
      ctx.db.select({ value: count() }).from(votes),
      ctx.db.select({ value: count() }).from(user).where(eq(user.role, "voter")),
      ctx.db
        .select({ id: elections.id, title: elections.title, endDate: elections.endDate })
        .from(elections)
        .where(
          and(
            effectiveStatusCondition("active", now),
            lte(elections.endDate, endingSoonThreshold)
          )
        ),
      ctx.db
        .select({ id: elections.id, title: elections.title, status: elections.status })
        .from(elections)
        .where(
          and(
            eq(elections.resultsPublished, false),
            or(effectiveStatusCondition("ended", now), eq(elections.status, "closed"))
          )
        ),
      ctx.db.query.activityLogs.findMany({
        orderBy: (fields, { desc }) => [desc(fields.createdAt)],
        limit: 10,
      }),
    ]);

    return {
      totalElections: totalElectionsRow[0].value,
      activeElections: activeElectionsRow[0].value,
      totalVotesCast: totalVotesRow[0].value,
      totalVoters: totalVotersRow[0].value,
      endingSoon,
      resultsNotPublished,
      recentActivity,
    };
  }),
```

- [ ] **Step 2: Write the admin dashboard stats component**

```tsx
"use client"

import Link from "next/link"
import { AlertCircle, TrendingUp, Users, Vote } from "lucide-react"

import { trpc } from "@/lib/trpc/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function AdminDashboardStats() {
  const { data, isLoading } = trpc.elections.dashboardStats.useQuery()

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading dashboard…</p>
  }

  if (!data) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
              <Vote className="size-4" />
              Total Elections
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data.totalElections}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="size-4" />
              Active Elections
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data.activeElections}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
              <Vote className="size-4" />
              Total Votes Cast
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data.totalVotesCast}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
              <Users className="size-4" />
              Total Voters
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data.totalVoters}</CardContent>
        </Card>
      </div>

      {(data.endingSoon.length > 0 || data.resultsNotPublished.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="size-4" />
              Needs Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.endingSoon.map((election) => (
              <Link
                key={election.id}
                href={`/admin/elections/${election.id}`}
                className="block text-sm hover:underline"
              >
                &quot;{election.title}&quot; ends {election.endDate.toLocaleString()}
              </Link>
            ))}
            {data.resultsNotPublished.map((election) => (
              <Link
                key={election.id}
                href={`/admin/elections/${election.id}`}
                className="block text-sm hover:underline"
              >
                &quot;{election.title}&quot; has ended — results not yet published
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.recentActivity.length === 0 ? (
            <p className="text-muted-foreground text-sm">No activity yet.</p>
          ) : (
            data.recentActivity.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between text-sm">
                <span>{entry.description}</span>
                <span className="text-muted-foreground text-xs">
                  {entry.createdAt.toLocaleString()}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

Save as `src/features/dashboard/components/admin-dashboard-stats.tsx`.

- [ ] **Step 3: Wire it into the admin dashboard page**

Read the current `src/app/admin/dashboard/page.tsx` first. Replace it with:

```tsx
import { getServerSession } from "@/server/auth/get-session"
import { AdminDashboardStats } from "@/features/dashboard/components/admin-dashboard-stats"

export default async function AdminDashboardPage() {
  const session = await getServerSession()

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Signed in as {session?.user.name} ({session?.user.email})
        </p>
      </div>
      <AdminDashboardStats />
    </div>
  )
}
```

The `LogoutButton` that was previously on this page is intentionally removed — Task 2's `AdminNav` already provides one in the header, so this avoids a duplicate.

- [ ] **Step 4: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 5: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 6: Verify the data via curl (admin-only UI — curl per Global Constraints)**

Set up: create 2 elections (one active ending within 48 hours, one active ending far in the future), 1 ended election with `resultsPublished: false`, cast a vote or two. Call the procedure:

```bash
curl -s -b cookies-admin.txt "http://localhost:3000/api/trpc/elections.dashboardStats?input=%7B%7D"
```

Expected: `totalElections`/`activeElections`/`totalVotesCast`/`totalVoters` all match what you set up (cross-check with direct DB queries if needed); `endingSoon` contains only the election ending within 48h; `resultsNotPublished` contains the ended-but-unpublished election; `recentActivity` shows your setup actions in reverse-chronological order.

- [ ] **Step 7: Clean up**

Delete all test elections/candidates/votes and any throwaway voters used for setup.

- [ ] **Step 8: Commit**

```bash
git add src/server/api/routers/elections.ts src/features/dashboard/components/admin-dashboard-stats.tsx src/app/admin/dashboard/page.tsx
git commit -m "Add admin dashboard stats, needs-attention list, and activity feed"
```

---

### Task 10: Voter dashboard — procedure + UI

**Files:**
- Modify: `src/server/api/routers/voting.ts`
- Create: `src/features/dashboard/components/voter-dashboard-content.tsx`
- Modify: `src/app/voter/dashboard/page.tsx`

**Interfaces:**
- Produces: `voting.dashboard` (protectedProcedure query, no input).

- [ ] **Step 1: Add the `dashboard` procedure**

Read the current `src/server/api/routers/voting.ts` first. Update the drizzle-orm import to add `ne`, `gte`, `lte`, `notInArray`, `inArray`:

```ts
import { eq, and, ne, gte, lte, notInArray, inArray } from "drizzle-orm";
```

Add this procedure (after `castVote`, before `getResults`, or anywhere inside the router — order doesn't matter functionally, but keep it near `castVote`/`myVotes` for readability):

```ts
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const now = new Date();

    const votedRows = await ctx.db
      .select({ electionId: votes.electionId })
      .from(votes)
      .where(eq(votes.userId, userId));
    const votedIds = votedRows.map((row) => row.electionId);

    const openElectionsConditions = [
      eq(elections.visibility, "public"),
      ne(elections.status, "draft"),
      ne(elections.status, "closed"),
      lte(elections.startDate, now),
      gte(elections.endDate, now),
    ];
    if (votedIds.length > 0) {
      openElectionsConditions.push(notInArray(elections.id, votedIds));
    }

    const [openElections, recentPublishedResults] = await Promise.all([
      ctx.db.query.elections.findMany({
        where: and(...openElectionsConditions),
        orderBy: (fields, { asc }) => [asc(fields.endDate)],
      }),
      votedIds.length > 0
        ? ctx.db.query.elections.findMany({
            where: and(inArray(elections.id, votedIds), eq(elections.resultsPublished, true)),
            orderBy: (fields, { desc }) => [desc(fields.updatedAt)],
            limit: 5,
          })
        : Promise.resolve([]),
    ]);

    return {
      openElections: openElections.map((election) => ({
        id: election.id,
        title: election.title,
        endDate: election.endDate,
      })),
      votedCount: votedIds.length,
      recentPublishedResults: recentPublishedResults.map((election) => ({
        id: election.id,
        title: election.title,
      })),
    };
  }),
```

- [ ] **Step 2: Write the voter dashboard content component**

```tsx
"use client"

import Link from "next/link"
import { Calendar, CheckCircle2, Trophy } from "lucide-react"

import { trpc } from "@/lib/trpc/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function VoterDashboardContent() {
  const { data, isLoading } = trpc.voting.dashboard.useQuery()

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>
  }

  if (!data) {
    return null
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="size-4" />
            Elections Voted In
          </CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">{data.votedCount}</CardContent>
      </Card>

      {data.openElections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="size-4" />
              Open for Voting
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.openElections.map((election) => (
              <div key={election.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{election.title}</p>
                  <p className="text-muted-foreground text-xs">
                    Closes {election.endDate.toLocaleString()}
                  </p>
                </div>
                <Button size="sm" render={<Link href={`/voter/elections/${election.id}`} />}>
                  Vote now
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data.recentPublishedResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="size-4" />
              Recently Published Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentPublishedResults.map((election) => (
              <Link
                key={election.id}
                href={`/voter/elections/${election.id}`}
                className="block text-sm hover:underline"
              >
                {election.title}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

Save as `src/features/dashboard/components/voter-dashboard-content.tsx`.

- [ ] **Step 3: Wire it into the voter dashboard page**

Read the current `src/app/voter/dashboard/page.tsx` first. Add the import and insert `<VoterDashboardContent />` between the greeting and the existing two nav cards:

```tsx
import Link from "next/link"
import { History, Vote } from "lucide-react"

import { getServerSession } from "@/server/auth/get-session"
import { VoterDashboardContent } from "@/features/dashboard/components/voter-dashboard-content"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default async function VoterDashboardPage() {
  const session = await getServerSession()

  return (
    <div className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {session?.user.name}</h1>
        <p className="text-muted-foreground text-sm">{session?.user.email}</p>
      </div>
      <VoterDashboardContent />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Vote className="size-5" />
              Elections
            </CardTitle>
            <CardDescription>Browse active and upcoming elections.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link href="/voter/elections" />}>Browse elections</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="size-5" />
              My Votes
            </CardTitle>
            <CardDescription>Review the elections you&apos;ve voted in.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" render={<Link href="/voter/votes" />}>
              View voting history
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 5: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 6: Verify in the browser as a throwaway voter**

As admin (curl): create and publish an election, add 2 candidates, keep it active. As a throwaway voter (browser): view `/voter/dashboard` — confirm it appears under "Open for Voting" and "Elections Voted In" shows 0. Cast a vote (via the browser). Refresh the dashboard — confirm the election disappears from "Open for Voting" and the voted count becomes 1. As admin (curl): publish results for that election. Refresh the voter dashboard — confirm the election now appears under "Recently Published Results".

- [ ] **Step 7: Clean up**

Delete the test election/candidates/vote and the throwaway voter account.

- [ ] **Step 8: Commit**

```bash
git add src/server/api/routers/voting.ts src/features/dashboard/components/voter-dashboard-content.tsx src/app/voter/dashboard/page.tsx
git commit -m "Add voter dashboard open elections, stats, and recently published results"
```

---

### Task 11: Full end-to-end verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full production build**

Run: `pnpm build`
Expected: `Compiled successfully`, zero TypeScript errors, route table unchanged from before this phase (no new routes — everything in this phase modified existing pages or added components/procedures).

- [ ] **Step 2: Admin-side full lifecycle (curl-only, per Global Constraints)**

As admin: create several elections in different states (draft, active, ending soon, ended-unpublished, closed), candidates, and cast a few votes via throwaway voters. Confirm via `elections.dashboardStats` that every number and list is correct. Confirm `elections.list` search/status filtering narrows correctly across several combinations. Confirm the admin nav's links are present in the dashboard page HTML (curl fetch + grep, as in Task 2).

- [ ] **Step 3: Voter-side full lifecycle (browser, throwaway voter only)**

As a throwaway voter: edit name/avatar/request email change on `/settings`, confirm each works and the email confirmation goes to the OLD address. Visit `/voter/elections`, confirm search/filter work. Visit `/voter/dashboard`, confirm open elections/voted count/recently published results all reflect real actions taken during this pass (vote cast, results published by admin via curl).

- [ ] **Step 4: Regression checks that this phase must not have broken**

Confirm admin can still fully manage elections/candidates (create/edit/publish/close/delete) — this phase touched `elections.list` and the elections table UI, so re-verify the existing publish/close/delete actions still work end to end. Confirm a voter still cannot access `/admin/*` routes. Confirm `uploads.getSignature` still rejects a voter requesting `elections/banners`/`candidates/photos` (Task 4's fix) while admin can still use `ImageUpload` for election banners and candidate photos as before.

- [ ] **Step 5: Git and secrets check**

Run: `git status` — expect a clean tree.
Run: `git ls-files | grep -i "\.env"` — expect only `.env.example`.

- [ ] **Step 6: Full cleanup and commit**

Confirm all test elections/candidates/votes/voter accounts created during this verification pass are deleted, and the real admin account is untouched (`db.query.user.findMany()` should show only the real admin). If `git status` shows anything uncommitted, clean up and commit; otherwise no commit needed — the phase is complete.
