# Notifications & Admin User Management (Phase 5B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-app notifications (results-published fan-out to voters) and admin user management (list/search, suspend/activate, promote/demote, view voting history).

**Architecture:** Notifications are a plain `protectedProcedure`-gated tRPC router scoped to the caller's own rows, populated by one fan-out trigger added to the existing `elections.publishResults` mutation (one row per voter who voted in that election). Admin user management is a plain `adminProcedure`-gated tRPC router matching the exact pattern already established for `elections.ts`/`candidates.ts` — no adoption of Better Auth's built-in admin plugin, whose ban system uses separate `banned`/`banReason`/`banExpires` fields that would conflict with this app's existing `status` enum already wired through every access-control check in the app.

**Tech Stack:** Next.js 16 App Router, TypeScript, tRPC, Better Auth, Drizzle ORM, Neon Postgres, TanStack Query, shadcn/ui (base-nova/Base UI), Zod, Lucide React.

## Global Constraints

- User management reuses the existing `user.status` (`active`/`suspended`) and `user.role` (`admin`/`voter`) fields — no new schema, no Better Auth admin plugin.
- `suspend` and `setRole` (when demoting an admin to voter) must both refuse to act on the caller's own account, and must both refuse to remove the last active admin (a `count()` check of other active admins). `activate` and promoting a voter to admin need neither guard.
- `users.getById`'s voting history returns which **elections** a user voted in — never their candidate choice. Same ballot-secrecy principle as the Phase 5A admin activity feed.
- `notifications.markRead`/`markAllRead` must scope every mutation by `eq(notifications.userId, ctx.session.user.id)` in the WHERE clause itself (not just an after-the-fact ownership check) — a user must never be able to mark another user's notification as read, even by guessing an id.
- Hiding results again does not retract already-sent notifications (deliberate — they're an immutable historical record, matching the Phase 5A activity log's design).
- Admin-only UI in this phase (users list, user detail actions) is verified via curl/tRPC-level data checks plus `tsc`/`pnpm build`/code review — never a live admin browser session. Admin credentials are never entered into a browser.
- Voter-facing UI (notification bell, notifications page) is verified with a real browser session, but only ever as a throwaway voter account, never the real admin.
- No test framework exists in this project — every "verify" step uses `tsc --noEmit`, `pnpm build`, and live curl/browser/DB-script checks, never `jest`/`vitest`.
- **Git commit messages must NOT include `Co-Authored-By: Claude`, "Generated with Claude Code", or any AI-attribution trailer.**
- Every new/modified page requires a full `pnpm build`, not just `tsc --noEmit`.
- Path alias `@/*` maps to `src/*`. This project uses Base UI, not Radix — `Select` uses `value`/`onValueChange`, `Button`-as-link uses `render={<Link .../>}`, `DropdownMenuTrigger` uses `render={<Button>...}` (see `src/components/shared/theme-toggle.tsx` for the exact established pattern this phase's notification bell mirrors).

## Operational Notes

- Keep `pnpm dev` running in the background throughout.
- Admin-side data setup and verification: sign in via `curl` using `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` from `.env.local`.
- Voter-side browser verification: register throwaway voter accounts, verify email via a scratch DB script, then log into the BROWSER as that voter through the normal login form.
- If you ever encounter an already-logged-in admin session in any browser tab, log it out immediately without using it and report this — this happened once in the prior phase (unknown provenance, remediated).
- Elevating any account to admin via raw SQL, or inserting rows bypassing the real APIs, is NOT authorized — except where a task's own brief explicitly designs a new admin-only API specifically for that purpose (e.g. this phase's own `setRole`).
- Clean up ALL test data (elections, candidates, votes, throwaway voter/admin-promotion accounts, notifications, cookie jars, scratch scripts) at the end of every task.

---

### Task 1: Notifications data layer

**Files:**
- Create: `src/server/api/routers/notifications.ts`
- Modify: `src/server/api/root.ts`

**Interfaces:**
- Produces: `notifications.list` (returns `{ items: [{id, type, title, message, isRead, createdAt, electionId}], unreadCount }`), `notifications.markRead({id})`, `notifications.markAllRead()`. Consumed by Task 3 (voter UI) and populated by Task 2's fan-out trigger (not yet written — this task verifies against directly-inserted test rows).

- [ ] **Step 1: Write the notifications router**

```ts
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { notifications } from "@/server/db/schema";

export const notificationsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.notifications.findMany({
      where: eq(notifications.userId, ctx.session.user.id),
      orderBy: (fields, { desc }) => [desc(fields.createdAt)],
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        message: row.message,
        isRead: row.isRead,
        createdAt: row.createdAt,
        electionId: (row.metadata as { electionId?: string } | null)?.electionId ?? null,
      })),
      unreadCount: rows.filter((row) => !row.isRead).length,
    };
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(eq(notifications.id, input.id), eq(notifications.userId, ctx.session.user.id))
        )
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found" });
      }

      return updated;
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(eq(notifications.userId, ctx.session.user.id), eq(notifications.isRead, false))
      );

    return { success: true };
  }),
});
```

Save as `src/server/api/routers/notifications.ts`.

- [ ] **Step 2: Register the router**

Read the current `src/server/api/root.ts` first. Add the import and register it:

```ts
import { notificationsRouter } from "@/server/api/routers/notifications";
```

```ts
export const appRouter = createTRPCRouter({
  health: healthRouter,
  uploads: uploadsRouter,
  elections: electionsRouter,
  candidates: candidatesRouter,
  voting: votingRouter,
  notifications: notificationsRouter,
});
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 4: Verify with real data**

Register and verify a throwaway voter (email verification via scratch DB script), sign in via curl. Directly insert two test notification rows for that voter (no trigger exists yet — that's Task 2):

```bash
cat > scratch-seed-notifications.ts << 'EOF'
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("./src/server/db");
  const { notifications, user } = await import("./src/server/db/schema");
  const { eq } = await import("drizzle-orm");

  const voter = await db.query.user.findFirst({
    where: eq(user.email, "task1-notif-voter@example.com"),
  });
  if (!voter) throw new Error("voter not found");

  await db.insert(notifications).values([
    {
      userId: voter.id,
      type: "results_published",
      title: "Results published",
      message: 'Results are now available for "Test Election A"',
      metadata: { electionId: "00000000-0000-0000-0000-000000000001" },
    },
    {
      userId: voter.id,
      type: "results_published",
      title: "Results published",
      message: 'Results are now available for "Test Election B"',
      metadata: { electionId: "00000000-0000-0000-0000-000000000002" },
    },
  ]);
  console.log("seeded");
}

main();
EOF
npx tsx scratch-seed-notifications.ts
```

(Use the actual throwaway voter's real email in the script.) Then verify via curl:

```bash
curl -s -b cookies-voter.txt "http://localhost:3000/api/trpc/notifications.list?input=%7B%7D"
```

Expected: `unreadCount: 2`, both items present with correct `electionId` extracted from `metadata`. Copy one notification's `id`, then:

```bash
INPUT=$(node -e "console.log(encodeURIComponent(JSON.stringify({json:{id:'<the-id>'}})))")
curl -s -b cookies-voter.txt -X POST "http://localhost:3000/api/trpc/notifications.markRead" \
  -H "Content-Type: application/json" -d "{\"json\":{\"id\":\"<the-id>\"}}"
```

Expected: 200, `isRead: true`. Re-check `notifications.list` — `unreadCount: 1`. Then:

```bash
curl -s -b cookies-voter.txt -X POST "http://localhost:3000/api/trpc/notifications.markAllRead" \
  -H "Content-Type: application/json" -d '{"json":{}}'
```

Expected: 200. Re-check `notifications.list` — `unreadCount: 0`, both items `isRead: true`.

**Ownership check**: register a second throwaway voter, sign in as them, attempt `markRead` on the FIRST voter's notification id — expect `NOT_FOUND` (not a silent no-op, not a success).

- [ ] **Step 5: Clean up**

Delete both throwaway voter accounts (cascades their notifications via `onDelete: "cascade"`), delete `scratch-seed-notifications.ts` and cookie jars.

- [ ] **Step 6: Commit**

```bash
git add src/server/api/routers/notifications.ts src/server/api/root.ts
git commit -m "Add notifications router with ownership-scoped read tracking"
```

---

### Task 2: Notification fan-out trigger

**Files:**
- Modify: `src/server/api/routers/elections.ts`

**Interfaces:**
- Consumes: `notifications` schema table.
- Produces: `elections.publishResults` now inserts one notification per voter who voted in that election.

- [ ] **Step 1: Add the fan-out to `publishResults`**

Read the current `src/server/api/routers/elections.ts` first. Update the schema import to add `notifications`:

```ts
import { elections, votes, user, notifications } from "@/server/db/schema";
```

Replace the `publishResults` procedure with:

```ts
  publishResults: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [election] = await ctx.db
        .update(elections)
        .set({ resultsPublished: true })
        .where(eq(elections.id, input.id))
        .returning();

      if (!election) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
      }

      const voterRows = await ctx.db
        .selectDistinct({ userId: votes.userId })
        .from(votes)
        .where(eq(votes.electionId, input.id));

      if (voterRows.length > 0) {
        await ctx.db.insert(notifications).values(
          voterRows.map((row) => ({
            userId: row.userId,
            type: "results_published",
            title: "Results published",
            message: `Results are now available for "${election.title}"`,
            metadata: { electionId: election.id },
          }))
        );
      }

      return election;
    }),
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 3: Verify with real data**

Sign in as admin, create+publish an election with 2 candidates. Register+verify 2 throwaway voters, sign in as each and cast a vote (reuse the established `castVote` curl pattern). Then as admin:

```bash
curl -s -b cookies-admin.txt -X POST http://localhost:3000/api/trpc/elections.publishResults \
  -H "Content-Type: application/json" -d '{"json":{"id":"<election-id>"}}'
```

Expected: 200. Then as EACH voter, confirm they received exactly one notification:

```bash
curl -s -b cookies-voter1.txt "http://localhost:3000/api/trpc/notifications.list?input=%7B%7D"
curl -s -b cookies-voter2.txt "http://localhost:3000/api/trpc/notifications.list?input=%7B%7D"
```

Expected: each shows `unreadCount: 1`, one item with `title: "Results published"`, `message` containing the election's title, `electionId` matching the election.

**Negative check**: register a third throwaway voter who does NOT vote in this election, confirm their `notifications.list` shows `unreadCount: 0` — proving the fan-out is scoped to actual voters, not broadcast to everyone.

**Idempotency note (informational, not a bug to fix)**: calling `publishResults` again on an already-published election will insert a SECOND round of notifications for the same voters (the fan-out isn't deduplicated against prior publishes). This matches the plan's design — `publishResults`/`hideResults` are a manual admin toggle with no history tracking, and re-publishing after a hide-then-republish cycle reasonably re-notifies voters. Confirm this happens as expected, don't try to prevent it.

- [ ] **Step 4: Clean up**

Delete the test election (cascades candidates/votes), delete the throwaway voter accounts, delete cookie jars.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/elections.ts
git commit -m "Fan out results-published notifications to voters on publish"
```

---

### Task 3: Notification UI

**Files:**
- Create: `src/features/notifications/components/notification-bell.tsx`
- Modify: `src/features/voting/components/voter-nav.tsx`
- Create: `src/app/voter/notifications/page.tsx`

**Interfaces:**
- Consumes: `notifications.list`/`markRead`/`markAllRead` (Task 1).
- Produces: `NotificationBell` component, wired into `VoterNav`; a full-history page at `/voter/notifications` (already covered by the existing `voter/layout.tsx` guard and nav, and already matched by `middleware.ts`'s `/voter/:path*` matcher — no routing config changes needed).

- [ ] **Step 1: Write the notification bell**

```tsx
"use client"

import Link from "next/link"
import { Bell } from "lucide-react"

import { trpc } from "@/lib/trpc/client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export function NotificationBell() {
  const utils = trpc.useUtils()
  const { data } = trpc.notifications.list.useQuery()

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => utils.notifications.list.invalidate(),
  })

  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => utils.notifications.list.invalidate(),
  })

  const items = data?.items ?? []
  const unreadCount = data?.unreadCount ?? 0
  const recent = items.slice(0, 5)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="icon" className="relative">
            <Bell className="size-4" />
            {unreadCount > 0 && (
              <span className="bg-destructive absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full text-[10px] font-medium text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
            <span className="sr-only">Notifications</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-1.5 py-1">
          <span className="text-sm font-medium">Notifications</span>
          {unreadCount > 0 && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs"
              onClick={() => markAllReadMutation.mutate()}
            >
              Mark all as read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {recent.length === 0 ? (
          <p className="text-muted-foreground px-1.5 py-4 text-center text-sm">
            No notifications yet.
          </p>
        ) : (
          recent.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              render={
                <Link
                  href={
                    notification.electionId
                      ? `/voter/elections/${notification.electionId}`
                      : "/voter/notifications"
                  }
                />
              }
              onClick={() => {
                if (!notification.isRead) {
                  markReadMutation.mutate({ id: notification.id })
                }
              }}
              className={cn(
                "flex-col items-start gap-0.5",
                !notification.isRead && "bg-accent/50"
              )}
            >
              <span className="text-sm font-medium">{notification.title}</span>
              <span className="text-muted-foreground text-xs">{notification.message}</span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={<Link href="/voter/notifications" />}
          className="justify-center text-sm"
        >
          View all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

Save as `src/features/notifications/components/notification-bell.tsx`.

- [ ] **Step 2: Wire it into the voter nav**

Read the current `src/features/voting/components/voter-nav.tsx` first. Add the import:

```ts
import { NotificationBell } from "@/features/notifications/components/notification-bell"
```

Add `<NotificationBell />` into the right-hand icon cluster, before `<ThemeToggle />`:

```tsx
      <div className="flex items-center gap-2">
        <NotificationBell />
        <ThemeToggle />
        <LogoutButton />
      </div>
```

- [ ] **Step 3: Write the full notifications page**

```tsx
"use client"

import Link from "next/link"

import { trpc } from "@/lib/trpc/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function VoterNotificationsPage() {
  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.notifications.list.useQuery()

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => utils.notifications.list.invalidate(),
  })

  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => utils.notifications.list.invalidate(),
  })

  if (isLoading) {
    return <p className="text-muted-foreground p-6 text-sm">Loading notifications…</p>
  }

  const items = data?.items ?? []
  const unreadCount = data?.unreadCount ?? 0

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={markAllReadMutation.isPending}
            onClick={() => markAllReadMutation.mutate()}
          >
            Mark all as read
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No notifications yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((notification) => (
            <Link
              key={notification.id}
              href={
                notification.electionId ? `/voter/elections/${notification.electionId}` : "#"
              }
              onClick={() => {
                if (!notification.isRead) {
                  markReadMutation.mutate({ id: notification.id })
                }
              }}
              className={cn(
                "block rounded-lg border p-4",
                !notification.isRead && "bg-accent/50"
              )}
            >
              <p className="font-medium">{notification.title}</p>
              <p className="text-muted-foreground text-sm">{notification.message}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {notification.createdAt.toLocaleString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

Save as `src/app/voter/notifications/page.tsx`.

- [ ] **Step 4: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 5: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds, route table now includes `/voter/notifications`.

- [ ] **Step 6: Verify in the browser as a throwaway voter**

As admin (curl): create+publish an election with 1 candidate. As a throwaway voter (browser): confirm the bell shows no badge. Cast a vote. As admin (curl): publish results for that election. As the voter (browser, refresh or re-navigate): confirm the bell now shows an unread badge ("1"); open the dropdown, confirm the notification appears with correct title/message; click it, confirm it navigates to the election page and the badge clears. Visit `/voter/notifications` directly, confirm the full history is visible. If more than one notification exists, test "Mark all as read" clears the badge.

- [ ] **Step 7: Clean up**

Delete the test election/candidate/vote, the throwaway voter account, cookie jars.

- [ ] **Step 8: Commit**

```bash
git add src/features/notifications/components/notification-bell.tsx src/features/voting/components/voter-nav.tsx src/app/voter/notifications/page.tsx
git commit -m "Add notification bell and full notifications page for voters"
```

---

### Task 4: Admin users data layer

**Files:**
- Create: `src/server/api/routers/users.ts`
- Modify: `src/server/api/root.ts`

**Interfaces:**
- Produces: `users.list`, `users.getById`, `users.suspend`, `users.activate`, `users.setRole`. Consumed by Tasks 5 and 6 (admin UI).

- [ ] **Step 1: Write the users router**

```ts
import { z } from "zod";
import { eq, and, or, ilike, count, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, adminProcedure } from "@/server/api/trpc";
import { user, votes } from "@/server/db/schema";
import type { db as dbType } from "@/server/db";

type Database = typeof dbType;

async function assertNotLastActiveAdmin(db: Database, excludeUserId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(user)
    .where(and(eq(user.role, "admin"), eq(user.status, "active"), ne(user.id, excludeUserId)));

  if (row.value === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot remove the last active admin",
    });
  }
}

export const usersRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(10),
        search: z.string().trim().min(1).optional(),
        role: z.enum(["all", "admin", "voter"]).default("all"),
        status: z.enum(["all", "active", "suspended"]).default("all"),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.pageSize;

      const conditions = [];
      if (input.search) {
        conditions.push(
          or(
            ilike(user.name, `%${input.search}%`),
            ilike(user.email, `%${input.search}%`)
          )!
        );
      }
      if (input.role !== "all") {
        conditions.push(eq(user.role, input.role));
      }
      if (input.status !== "all") {
        conditions.push(eq(user.status, input.status));
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, totalRow] = await Promise.all([
        ctx.db.query.user.findMany({
          where: whereClause,
          orderBy: (fields, { desc }) => [desc(fields.createdAt)],
          limit: input.pageSize,
          offset,
          columns: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            createdAt: true,
          },
        }),
        ctx.db.select({ total: count() }).from(user).where(whereClause),
      ]);

      return {
        items,
        total: totalRow[0].total,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  getById: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const targetUser = await ctx.db.query.user.findFirst({
        where: eq(user.id, input.id),
        columns: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
        },
      });

      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const votingHistory = await ctx.db.query.votes.findMany({
        where: eq(votes.userId, input.id),
        orderBy: (fields, { desc }) => [desc(fields.votedAt)],
        columns: { votedAt: true },
        with: { election: { columns: { id: true, title: true } } },
      });

      return {
        user: targetUser,
        votingHistory: votingHistory.map((vote) => ({
          electionId: vote.election.id,
          electionTitle: vote.election.title,
          votedAt: vote.votedAt,
        })),
      };
    }),

  suspend: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot suspend your own account",
        });
      }

      const target = await ctx.db.query.user.findFirst({ where: eq(user.id, input.id) });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (target.role === "admin") {
        await assertNotLastActiveAdmin(ctx.db, input.id);
      }

      const [updated] = await ctx.db
        .update(user)
        .set({ status: "suspended" })
        .where(eq(user.id, input.id))
        .returning();

      return updated;
    }),

  activate: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(user)
        .set({ status: "active" })
        .where(eq(user.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      return updated;
    }),

  setRole: adminProcedure
    .input(z.object({ id: z.uuid(), role: z.enum(["admin", "voter"]) }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot change your own role",
        });
      }

      const target = await ctx.db.query.user.findFirst({ where: eq(user.id, input.id) });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (target.role === "admin" && input.role === "voter") {
        await assertNotLastActiveAdmin(ctx.db, input.id);
      }

      const [updated] = await ctx.db
        .update(user)
        .set({ role: input.role })
        .where(eq(user.id, input.id))
        .returning();

      return updated;
    }),
});
```

Save as `src/server/api/routers/users.ts`.

- [ ] **Step 2: Register the router**

Read the current `src/server/api/root.ts` first (already modified once in Task 1 — read its current state, don't assume the original). Add the import and register:

```ts
import { usersRouter } from "@/server/api/routers/users";
```

```ts
export const appRouter = createTRPCRouter({
  health: healthRouter,
  uploads: uploadsRouter,
  elections: electionsRouter,
  candidates: candidatesRouter,
  voting: votingRouter,
  notifications: notificationsRouter,
  users: usersRouter,
});
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors). If `type Database = typeof dbType` doesn't compile, check how `src/server/results.ts` or `src/server/activity-log.ts` (both already use this exact pattern) resolve it, and match their approach.

- [ ] **Step 4: Verify with real data**

Sign in as admin. Register and verify 3 throwaway voters (via curl + scratch DB script, standard pattern). Test `list`:

```bash
INPUT=$(node -e "console.log(encodeURIComponent(JSON.stringify({json:{page:1,pageSize:10,search:'task4',role:'all',status:'all'}})))")
curl -s -b cookies-admin.txt "http://localhost:3000/api/trpc/users.list?input=$INPUT"
```

Expected: all 3 test voters present if their emails/names contain "task4", `total: 3`. Test `role`/`status` filters similarly with a couple of combinations.

Test `getById` for one voter with no votes yet — expect `votingHistory: []`. Cast a vote as that voter in a test election, re-check `getById` — expect one `votingHistory` entry with the correct `electionTitle`/`votedAt`, and confirm the raw JSON response contains no candidate reference anywhere.

Test `suspend` on one throwaway voter — expect 200, `status: "suspended"`. Confirm that suspended voter can no longer sign in / their existing session is now rejected (per the app's existing `protectedProcedure` status check, unchanged — try a curl request as that voter after suspension, expect `UNAUTHORIZED`). Test `activate` on the same voter — expect `status: "active"` again, confirm they can act normally again.

Test `setRole` promoting one throwaway voter to admin — expect 200, `role: "admin"`. Test the self-action guard: attempt `suspend`/`setRole` on the REAL admin's own id (from the currently authenticated session) — expect `BAD_REQUEST` in both cases. Test a normal multi-admin scenario: promote a second throwaway voter to admin (3 active admins: real + 2 promoted), suspend one of the promoted admins (2 remain) — expect SUCCESS, then suspend the other promoted admin (1 remains: the real admin) — expect SUCCESS.

**Note on the last-admin guard's live reachability**: think through why `assertNotLastActiveAdmin` can never actually block a request in normal use before writing this off as untestable. Any request that reaches this check already came from an authenticated, currently-active admin (`adminProcedure`), and the self-action guard already guarantees that actor is never the target. So the acting admin always counts as at least one "other active admin" in the guard's count query — the scenario the guard exists to prevent (zero active admins remaining) can only arise if the actor's own admin status changed mid-request, which isn't something a single sequential curl script can construct. This makes the guard a correct, harmless piece of defense-in-depth for future code paths (e.g. a bulk-suspend feature) rather than something reachable through today's API surface. Verify its logic is correct by reading the code (the `ne(user.id, excludeUserId)` count condition), and note this reasoning in your report instead of trying to force a live "blocked" case — that's a complete, honest verification outcome here, not a gap.

- [ ] **Step 5: Clean up**

Delete all throwaway voter/promoted-admin accounts, delete any test elections/votes created for the voting-history check, delete cookie jars.

- [ ] **Step 6: Commit**

```bash
git add src/server/api/routers/users.ts src/server/api/root.ts
git commit -m "Add admin user management router with suspend/promote safety guards"
```

---

### Task 5: Admin users list UI

**Files:**
- Create: `src/features/users/components/users-table.tsx`
- Create: `src/app/admin/users/page.tsx`
- Modify: `src/features/admin/components/admin-nav.tsx`

**Interfaces:**
- Consumes: `users.list` (Task 4).
- Produces: `UsersTable` component; `/admin/users` page; a "Users" link in `AdminNav`.

- [ ] **Step 1: Write the users table**

```tsx
"use client"

import * as React from "react"
import Link from "next/link"
import { Search } from "lucide-react"

import { trpc } from "@/lib/trpc/client"
import { Badge } from "@/components/ui/badge"
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
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

const ROLE_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "admin", label: "Admin" },
  { value: "voter", label: "Voter" },
] as const

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
] as const

export function UsersTable() {
  const [page, setPage] = React.useState(1)
  const [search, setSearch] = React.useState("")
  const [role, setRole] = React.useState<(typeof ROLE_OPTIONS)[number]["value"]>("all")
  const [status, setStatus] = React.useState<(typeof STATUS_OPTIONS)[number]["value"]>("all")
  const pageSize = 10

  const { data, isLoading } = trpc.users.list.useQuery({
    page,
    pageSize,
    search: search.trim() || undefined,
    role,
    status,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            placeholder="Search by name or email…"
            className="pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <Select
          value={role}
          onValueChange={(value) => {
            setRole(value as (typeof ROLE_OPTIONS)[number]["value"])
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as (typeof STATUS_OPTIONS)[number]["value"])
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
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

      {isLoading && <p className="text-muted-foreground text-sm">Loading users…</p>}

      {!isLoading && (!data || data.items.length === 0) && (
        <p className="text-muted-foreground text-sm">No users match your filters.</p>
      )}

      {!isLoading && data && data.items.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link
                      href={`/admin/users/${item.id}`}
                      className="font-medium hover:underline"
                    >
                      {item.name}
                    </Link>
                  </TableCell>
                  <TableCell>{item.email}</TableCell>
                  <TableCell>
                    <Badge variant={item.role === "admin" ? "default" : "outline"}>
                      {item.role === "admin" ? "Admin" : "Voter"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.status === "active" ? "default" : "destructive"}>
                      {item.status === "active" ? "Active" : "Suspended"}
                    </Badge>
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
    </div>
  )
}
```

Save as `src/features/users/components/users-table.tsx`.

- [ ] **Step 2: Write the users list page**

```tsx
import { UsersTable } from "@/features/users/components/users-table"

export default function AdminUsersPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Users</h1>
      <UsersTable />
    </div>
  )
}
```

Save as `src/app/admin/users/page.tsx`.

- [ ] **Step 3: Add the Users link to AdminNav**

Read the current `src/features/admin/components/admin-nav.tsx` first. Update `NAV_LINKS` to insert a Users entry between Elections and Settings:

```ts
const NAV_LINKS = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/elections", label: "Elections" },
  { href: "/admin/users", label: "Users" },
  { href: "/settings", label: "Settings" },
]
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 5: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds, route table now includes `/admin/users`.

- [ ] **Step 6: Verify the data layer with curl (admin-only UI — curl per Global Constraints)**

Create a few throwaway voters with distinguishable names. Sign in as admin, fetch `/admin/users` HTML and grep for "Users" nav link presence. Confirm via `users.list` curl calls (already exercised in Task 4) that the table would render correct data — the component itself is a thin, verbatim-brief rendering of what Task 4 already proved works.

- [ ] **Step 7: Clean up**

Delete throwaway voter accounts, cookie jars.

- [ ] **Step 8: Commit**

```bash
git add src/features/users/components/users-table.tsx "src/app/admin/users/page.tsx" src/features/admin/components/admin-nav.tsx
git commit -m "Add admin users list page with search and filters"
```

---

### Task 6: Admin users detail UI

**Files:**
- Create: `src/features/users/components/user-detail.tsx`
- Create: `src/app/admin/users/[userId]/page.tsx`

**Interfaces:**
- Consumes: `users.getById`/`suspend`/`activate`/`setRole` (Task 4).
- Produces: `UserDetail` component; `/admin/users/[userId]` page.

- [ ] **Step 1: Write the user detail component**

```tsx
"use client"

import * as React from "react"
import { toast } from "sonner"

import { trpc } from "@/lib/trpc/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function UserDetail({ userId }: { userId: string }) {
  const [pendingRoleChange, setPendingRoleChange] = React.useState<"admin" | "voter" | null>(
    null
  )
  const utils = trpc.useUtils()

  const { data, isLoading } = trpc.users.getById.useQuery({ id: userId })

  const suspendMutation = trpc.users.suspend.useMutation({
    onSuccess: async () => {
      await utils.users.getById.invalidate({ id: userId })
      toast.success("User suspended")
    },
    onError: (error) => toast.error(error.message),
  })

  const activateMutation = trpc.users.activate.useMutation({
    onSuccess: async () => {
      await utils.users.getById.invalidate({ id: userId })
      toast.success("User activated")
    },
    onError: (error) => toast.error(error.message),
  })

  const setRoleMutation = trpc.users.setRole.useMutation({
    onSuccess: async () => {
      await utils.users.getById.invalidate({ id: userId })
      toast.success("Role updated")
      setPendingRoleChange(null)
    },
    onError: (error) => {
      toast.error(error.message)
      setPendingRoleChange(null)
    },
  })

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading user…</p>
  }

  if (!data) {
    return <p className="text-muted-foreground text-sm">User not found.</p>
  }

  const { user, votingHistory } = data

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {user.name}
            <Badge variant={user.role === "admin" ? "default" : "outline"}>
              {user.role === "admin" ? "Admin" : "Voter"}
            </Badge>
            <Badge variant={user.status === "active" ? "default" : "destructive"}>
              {user.status === "active" ? "Active" : "Suspended"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">{user.email}</p>
          <div className="flex flex-wrap gap-2">
            {user.status === "active" ? (
              <Button
                variant="outline"
                disabled={suspendMutation.isPending}
                onClick={() => suspendMutation.mutate({ id: user.id })}
              >
                {suspendMutation.isPending ? "Suspending…" : "Suspend"}
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={activateMutation.isPending}
                onClick={() => activateMutation.mutate({ id: user.id })}
              >
                {activateMutation.isPending ? "Activating…" : "Activate"}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setPendingRoleChange(user.role === "admin" ? "voter" : "admin")}
            >
              {user.role === "admin" ? "Demote to voter" : "Promote to admin"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Voting history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {votingHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">No votes cast yet.</p>
          ) : (
            votingHistory.map((vote) => (
              <div key={vote.electionId} className="flex items-center justify-between text-sm">
                <span>{vote.electionTitle}</span>
                <span className="text-muted-foreground text-xs">
                  {vote.votedAt.toLocaleString()}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog
        open={pendingRoleChange !== null}
        onOpenChange={(open) => !open && setPendingRoleChange(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingRoleChange === "admin" ? "Promote to admin?" : "Demote to voter?"}
            </DialogTitle>
            <DialogDescription>
              {pendingRoleChange === "admin"
                ? `${user.name} will gain full admin access to manage elections, candidates, and other users.`
                : `${user.name} will lose admin access and become a regular voter.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRoleChange(null)}>
              Cancel
            </Button>
            <Button
              disabled={setRoleMutation.isPending}
              onClick={() =>
                pendingRoleChange &&
                setRoleMutation.mutate({ id: user.id, role: pendingRoleChange })
              }
            >
              {setRoleMutation.isPending ? "Updating…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

Save as `src/features/users/components/user-detail.tsx`.

- [ ] **Step 2: Write the user detail page**

```tsx
import { UserDetail } from "@/features/users/components/user-detail"

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <UserDetail userId={userId} />
    </div>
  )
}
```

Save as `src/app/admin/users/[userId]/page.tsx`.

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 4: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds, route table now includes `/admin/users/[userId]`.

- [ ] **Step 5: Verify the data layer with curl (admin-only UI — curl per Global Constraints)**

This UI is a thin wrapper around Task 4's already-verified `users.getById`/`suspend`/`activate`/`setRole` procedures. Confirm the component's structure is correct by code review (the mutations call the right procedure with the right input shape, the confirmation dialog correctly branches its copy on `pendingRoleChange`, the suspend/activate buttons correctly toggle based on `user.status`) and confirm `pnpm build` succeeded with the new dynamic route present.

- [ ] **Step 6: Commit**

```bash
git add src/features/users/components/user-detail.tsx "src/app/admin/users/[userId]/page.tsx"
git commit -m "Add admin user detail page with voting history and suspend/promote actions"
```

---

### Task 7: Full end-to-end verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full production build**

Run: `pnpm build`
Expected: `Compiled successfully`, zero TypeScript errors, route table includes `/voter/notifications`, `/admin/users`, `/admin/users/[userId]` alongside every route from all prior phases.

- [ ] **Step 2: Notifications full lifecycle**

As admin (curl): create+publish an election with 2 candidates. As two throwaway voters (browser for at least one, curl is fine for the other): cast votes. As admin (curl): publish results. Confirm both voters got exactly one notification each, a third non-voting throwaway voter got none. As one voter (browser): confirm the bell badge, dropdown, click-through, and mark-all-read all work; confirm `/voter/notifications` shows full history.

- [ ] **Step 3: User management full lifecycle**

As admin (curl): create several throwaway voters, exercise `users.list` search/role/status filtering across multiple combinations, confirm totals match. Suspend one voter, confirm their session is rejected on their next request. Activate them again, confirm they can act normally. Promote one voter to admin, confirm they can now call an `adminProcedure` (e.g. `elections.list`). Demote them back. Confirm the self-action guard blocks the real admin from suspending/demoting themselves. Confirm `users.getById`'s voting history contains no candidate information anywhere in the raw response for a voter who has cast votes.

- [ ] **Step 4: Regression checks that this phase must not have broken**

Confirm `elections.publishResults`/`hideResults` still correctly toggle `resultsPublished` (this phase modified `publishResults`). Confirm the full existing admin election/candidate CRUD lifecycle still works end to end. Confirm a voter still cannot reach `/admin/*` routes (including the two new ones). Confirm `elections.dashboardStats` (Phase 5A) still returns correct numbers — this phase didn't touch it, but the notification fan-out inserts new rows into a different table (`notifications`) so there should be zero interaction, confirm that's actually true.

- [ ] **Step 5: Git and secrets check**

Run: `git status` — expect a clean tree.
Run: `git ls-files | grep -i "\.env"` — expect only `.env.example`.

- [ ] **Step 6: Full cleanup and commit**

Confirm all test elections/candidates/votes/notifications/voter accounts created during this verification pass are deleted, and the real admin account is untouched (`db.query.user.findMany()` shows only the real admin). If `git status` shows anything uncommitted, clean up and commit; otherwise no commit needed — the phase is complete.
