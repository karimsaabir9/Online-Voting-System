# Voter Election Browsing & Voting (Phase 4A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let voters browse public elections, view election details and candidate profiles, cast exactly one vote per election with full server-side integrity checks, see an inline confirmation, and review their own voting history.

**Architecture:** A single `voting` tRPC router (`protectedProcedure`-guarded) exposes read queries (`listElections`, `getElection`, `myVotes`) and one integrity-critical mutation (`castVote`) that re-validates everything server-side and never trusts client input for eligibility, user identity, IP, device, or timestamp. Voter-facing pages are Client Components that call these tRPC hooks directly (not server components fetching via `db.query`) — this sidesteps the "server-rendered data goes stale after a client mutation" bug class the Admin phase had to patch with `router.refresh()`; here, `utils.voting.*.invalidate()` alone keeps the UI correct by construction.

**Tech Stack:** Next.js 16 App Router, TypeScript, tRPC, TanStack Query, Drizzle ORM, Neon Postgres, shadcn/ui (base-nova/Base UI), Tailwind CSS, Lucide React.

## Global Constraints

- All voting procedures use `protectedProcedure` (any authenticated, active user) — the `/voter` route guard (Auth phase) already restricts who reaches these pages; the procedure layer just needs "logged in," not a role check, since only voters ever navigate here.
- Voting is single-choice: one `candidateId` per `castVote` call, enforced ultimately by the existing `votes` table's unique `(electionId, userId)` index. `maxVotesAllowed` is not enforced by any code in this phase.
- Private elections (`visibility: "private"`) are fully excluded from `listElections` and return `NOT_FOUND` from `getElection`/`castVote` — no partial visibility, no direct-link access.
- `castVote` never trusts the client for: election eligibility (re-checks `visibility` + `getEffectiveStatus(election) === "active"` itself), candidate validity (re-checks it belongs to the election and is `active`), `userId` (from `ctx.session`, not input), `ipAddress`/`deviceInfo` (from `ctx.headers`, not input), `votedAt` (DB default).
- No update/delete procedure exists anywhere in the voting router.
- Voter-facing pages are Client Components (`"use client"`) using `trpc.voting.*.useQuery()`/`useMutation()` directly — do not build them as server components fetching via `db.query` (see Architecture above for why).
- `VoteForm` does not use React Hook Form or Zod — it's a single required radio selection, not a multi-field form; adding RHF/Zod there would be unnecessary complexity for one control.
- No test framework exists in this project — every "verify" step uses `tsc --noEmit`, `pnpm build`, and live curl/browser/DB-script checks, never `jest`/`vitest`.
- **Git commit messages must NOT include `Co-Authored-By: Claude`, "Generated with Claude Code", or any AI-attribution trailer.**
- Path alias `@/*` maps to `src/*`. File naming: kebab-case files, PascalCase components.
- This project uses Base UI (not Radix): `Button`-as-link uses `render={<Link .../>}`; `Select`/`RadioGroup` use `value`/`onValueChange`.

## Operational Notes

- Keep `pnpm dev` running in the background throughout.
- Backend task verification (Tasks 2–3) needs an authenticated session. The real admin account (`ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` in `.env.local`) can create/publish test elections via the already-built Phase 3 admin endpoints. Testing `castVote` additionally needs a **voter** account — register one via `POST /api/auth/sign-up/email`, then force `email_verified = true` via a scratch DB script (same pattern used throughout the Auth phase) rather than clicking a real verification email — this is a test account, not a real one.
- Always clean up test elections/candidates/votes/voter accounts via scratch DB scripts before committing. Never touch the real admin account (`karimsapir9@gmail.com`).
- tRPC mutations (POST): body is `{"json": <input>}`. tRPC queries (GET): input goes in the URL as `?input=<url-encoded JSON>` — build it with `node -e "console.log(encodeURIComponent(JSON.stringify({json: {...}})))"`.

---

### Task 1: Client IP utility

**Files:**
- Create: `src/lib/request-info.ts`

**Interfaces:**
- Produces: `getClientIp(headers: Headers): string | null` from `@/lib/request-info`.

- [ ] **Step 1: Write the utility**

```ts
export function getClientIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return null;
}
```

Save as `src/lib/request-info.ts`.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 3: Verify the logic with a scratch script**

```bash
cat > scratch-verify-ip.ts << 'EOF'
import { getClientIp } from "./src/lib/request-info";

console.log(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 70.41.3.18" }))); // "203.0.113.5"
console.log(getClientIp(new Headers({ "x-real-ip": "203.0.113.9" }))); // "203.0.113.9"
console.log(getClientIp(new Headers())); // null
EOF
npx tsx scratch-verify-ip.ts
rm scratch-verify-ip.ts
```

Expected output (3 lines): `203.0.113.5`, `203.0.113.9`, `null`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/request-info.ts
git commit -m "Add client IP extraction utility"
```

---

### Task 2: Voting tRPC router — read queries

**Files:**
- Create: `src/server/api/routers/voting.ts`
- Modify: `src/server/api/root.ts`

**Interfaces:**
- Consumes: `protectedProcedure`, `createTRPCRouter` from `@/server/api/trpc` (Auth phase); `elections`, `candidates`, `votes` from `@/server/db/schema` (Foundation phase); `getEffectiveStatus` from `@/lib/election-status` (Admin phase).
- Produces: `votingRouter` registered as `voting` on `appRouter`, exposing `voting.listElections`, `voting.getElection`, `voting.myVotes`. (`voting.castVote` is added in Task 3, to the same file.)

- [ ] **Step 1: Write the router's read procedures**

```ts
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { elections, candidates, votes } from "@/server/db/schema";
import { getEffectiveStatus } from "@/lib/election-status";

export const votingRouter = createTRPCRouter({
  listElections: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.elections.findMany({
      where: (fields, { and, eq, ne }) =>
        and(eq(fields.visibility, "public"), ne(fields.status, "draft")),
      orderBy: (fields, { desc }) => [desc(fields.startDate)],
    });

    return rows.map((election) => ({
      ...election,
      effectiveStatus: getEffectiveStatus(election),
    }));
  }),

  getElection: protectedProcedure
    .input(z.object({ electionId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const election = await ctx.db.query.elections.findFirst({
        where: eq(elections.id, input.electionId),
      });

      if (!election || election.visibility !== "public" || election.status === "draft") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
      }

      const electionCandidates = await ctx.db.query.candidates.findMany({
        where: eq(candidates.electionId, input.electionId),
      });

      const existingVote = await ctx.db.query.votes.findFirst({
        where: and(
          eq(votes.electionId, input.electionId),
          eq(votes.userId, ctx.session.user.id)
        ),
      });

      return {
        election: { ...election, effectiveStatus: getEffectiveStatus(election) },
        candidates: electionCandidates,
        votedCandidateId: existingVote?.candidateId ?? null,
        votedAt: existingVote?.votedAt ?? null,
      };
    }),

  myVotes: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.votes.findMany({
      where: eq(votes.userId, ctx.session.user.id),
      orderBy: (fields, { desc }) => [desc(fields.votedAt)],
      with: {
        election: { columns: { id: true, title: true } },
        candidate: { columns: { id: true, fullName: true } },
      },
    });

    return rows;
  }),
});
```

Save as `src/server/api/routers/voting.ts`.

- [ ] **Step 2: Register the router**

Read `src/server/api/root.ts` first, then add the import and registration alongside the existing `health`/`uploads`/`elections`/`candidates`:

```ts
import { createTRPCRouter } from "@/server/api/trpc";
import { healthRouter } from "@/server/api/routers/health";
import { uploadsRouter } from "@/server/api/routers/uploads";
import { electionsRouter } from "@/server/api/routers/elections";
import { candidatesRouter } from "@/server/api/routers/candidates";
import { votingRouter } from "@/server/api/routers/voting";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  uploads: uploadsRouter,
  elections: electionsRouter,
  candidates: candidatesRouter,
  voting: votingRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 4: Verify against the running dev server**

Sign in as the seeded admin (cookie jar `cookies-admin.txt`), create a public election with dates spanning "now", publish it, add one active candidate — reusing the already-built Phase 3 admin endpoints:

```bash
curl -s -c cookies-admin.txt -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"<ADMIN_SEED_EMAIL>","password":"<ADMIN_SEED_PASSWORD>"}' > /dev/null

curl -s -b cookies-admin.txt -X POST http://localhost:3000/api/trpc/elections.create \
  -H "Content-Type: application/json" \
  -d '{"json":{"title":"Task 2 Verify Election","visibility":"public","startDate":"2020-01-01T00:00:00.000Z","endDate":"2099-01-01T00:00:00.000Z"}}'
```

Copy the election id as `$ELECTION_ID`, then:

```bash
curl -s -b cookies-admin.txt -X POST http://localhost:3000/api/trpc/elections.publish \
  -H "Content-Type: application/json" -d "{\"json\":{\"id\":\"$ELECTION_ID\"}}"

curl -s -b cookies-admin.txt -X POST http://localhost:3000/api/trpc/candidates.create \
  -H "Content-Type: application/json" \
  -d "{\"json\":{\"electionId\":\"$ELECTION_ID\",\"fullName\":\"Task 2 Verify Candidate\",\"status\":\"active\"}}"
```

Copy the candidate id as `$CANDIDATE_ID`. Now, still using the admin cookie (admin is also just an authenticated user, so `protectedProcedure` allows it):

```bash
INPUT=$(node -e "console.log(encodeURIComponent(JSON.stringify({json:{}})))")
curl -s -b cookies-admin.txt "http://localhost:3000/api/trpc/voting.listElections?input=$INPUT"
```

Expected: 200, the created election appears with `effectiveStatus: "active"`.

```bash
INPUT=$(node -e "console.log(encodeURIComponent(JSON.stringify({json:{electionId:'$ELECTION_ID'}})))")
curl -s -b cookies-admin.txt "http://localhost:3000/api/trpc/voting.getElection?input=$INPUT"
```

Expected: 200, `election.effectiveStatus: "active"`, `candidates` contains the created candidate, `votedCandidateId: null`, `votedAt: null`.

```bash
INPUT=$(node -e "console.log(encodeURIComponent(JSON.stringify({json:{}})))")
curl -s -b cookies-admin.txt "http://localhost:3000/api/trpc/voting.myVotes?input=$INPUT"
```

Expected: 200, empty array `[]` (no votes cast yet).

**Leave the election/candidate in place** — Task 3's verification needs them. Do not delete `cookies-admin.txt` either — Task 3 reuses it. Note `$ELECTION_ID`/`$CANDIDATE_ID` in your report for the next task.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/voting.ts src/server/api/root.ts
git commit -m "Add voting router read queries: listElections, getElection, myVotes"
```

---

### Task 3: Voting tRPC router — castVote mutation

**Files:**
- Modify: `src/server/api/routers/voting.ts`

**Interfaces:**
- Consumes: `getClientIp` from `@/lib/request-info` (Task 1); everything from Task 2.
- Produces: `voting.castVote` added to `votingRouter`.

This is the integrity-critical piece of the whole phase — take care, and verify thoroughly.

- [ ] **Step 1: Add the castVote mutation**

Read the current `src/server/api/routers/voting.ts` (from Task 2) first, then add this procedure inside `votingRouter` (after `myVotes`), and add this one new import at the top (everything else this procedure needs — `eq`, `and`, `TRPCError`, `elections`, `candidates`, `votes`, `getEffectiveStatus` — is already imported from Task 2):

```ts
import { getClientIp } from "@/lib/request-info";
```

```ts
  castVote: protectedProcedure
    .input(z.object({ electionId: z.uuid(), candidateId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const election = await ctx.db.query.elections.findFirst({
        where: eq(elections.id, input.electionId),
      });

      if (!election || election.visibility !== "public") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
      }

      if (getEffectiveStatus(election) !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This election is not currently open for voting",
        });
      }

      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.candidateId),
      });

      if (
        !candidate ||
        candidate.electionId !== input.electionId ||
        candidate.status !== "active"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid candidate for this election",
        });
      }

      const existingVote = await ctx.db.query.votes.findFirst({
        where: and(
          eq(votes.electionId, input.electionId),
          eq(votes.userId, ctx.session.user.id)
        ),
      });

      if (existingVote) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You have already voted in this election",
        });
      }

      try {
        const [vote] = await ctx.db
          .insert(votes)
          .values({
            electionId: input.electionId,
            candidateId: input.candidateId,
            userId: ctx.session.user.id,
            ipAddress: getClientIp(ctx.headers),
            deviceInfo: ctx.headers.get("user-agent"),
          })
          .returning();

        return vote;
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "You have already voted in this election",
          });
        }
        throw error;
      }
    }),
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 3: Verify against the running dev server — the full integrity sequence**

Using `$ELECTION_ID`/`$CANDIDATE_ID` from Task 2 (still live in the DB), register and verify a throwaway voter account:

```bash
curl -s -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"task3-voter@example.com","password":"password123","name":"Task 3 Voter"}' > /dev/null
```

```bash
# scratch-verify-voter.mjs (temporary, delete after use)
import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
await sql`update "user" set email_verified = true where email = 'task3-voter@example.com'`;
console.log("voter verified");
```

Run: `node scratch-verify-voter.mjs`, then delete it.

```bash
curl -s -c cookies-voter.txt -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"task3-voter@example.com","password":"password123"}' > /dev/null
```

Now the actual sequence:

```bash
# 1. Cast a valid vote — expect success
curl -s -b cookies-voter.txt -X POST http://localhost:3000/api/trpc/voting.castVote \
  -H "Content-Type: application/json" \
  -d "{\"json\":{\"electionId\":\"$ELECTION_ID\",\"candidateId\":\"$CANDIDATE_ID\"}}"
```

Expected: 200, the created vote row returned.

```bash
# 2. Vote again in the same election — expect CONFLICT (already voted)
curl -s -b cookies-voter.txt -X POST http://localhost:3000/api/trpc/voting.castVote \
  -H "Content-Type: application/json" \
  -d "{\"json\":{\"electionId\":\"$ELECTION_ID\",\"candidateId\":\"$CANDIDATE_ID\"}}"
```

Expected: error response, `CONFLICT`, "You have already voted in this election".

```bash
# 3. Vote for a nonexistent candidate id in the same election — expect BAD_REQUEST
curl -s -b cookies-voter.txt -X POST http://localhost:3000/api/trpc/voting.castVote \
  -H "Content-Type: application/json" \
  -d "{\"json\":{\"electionId\":\"$ELECTION_ID\",\"candidateId\":\"00000000-0000-0000-0000-000000000000\"}}"
```

Expected: error response, `BAD_REQUEST`, "Invalid candidate for this election" (this also exercises the "already voted" pre-check being bypassed correctly — actually the candidate check runs before the vote-existence check, so this specifically proves invalid-candidate detection works even for a voter who already voted; both are legitimate rejections).

```bash
# 4. Vote with no session at all — expect UNAUTHORIZED
curl -s -i -X POST http://localhost:3000/api/trpc/voting.castVote \
  -H "Content-Type: application/json" \
  -d "{\"json\":{\"electionId\":\"$ELECTION_ID\",\"candidateId\":\"$CANDIDATE_ID\"}}" | head -5
```

Expected: 401/`UNAUTHORIZED`.

Then confirm the vote row's recorded fields via a scratch script:

```bash
# scratch-check-vote.mjs (temporary, delete after use)
import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const rows = await sql`select election_id, candidate_id, ip_address, device_info, voted_at from votes`;
console.log(rows);
```

Run: `node scratch-check-vote.mjs`
Expected: exactly one row, `election_id`/`candidate_id` matching `$ELECTION_ID`/`$CANDIDATE_ID`, `device_info` containing the curl User-Agent string (e.g. `curl/...`), `ip_address` likely `null` in local dev (no `x-forwarded-for` header from `curl` on localhost — this is expected, not a bug), `voted_at` populated.

- [ ] **Step 4: Clean up all test data**

Generate the cleanup script with the real `$ELECTION_ID` value substituted in via a heredoc (bash expands `$ELECTION_ID` when the heredoc delimiter is unquoted), rather than hand-editing a placeholder:

```bash
cat > scratch-cleanup-task3.mjs << EOF
import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
await sql\`delete from votes where election_id = '${ELECTION_ID}'\`;
await sql\`delete from candidates where election_id = '${ELECTION_ID}'\`;
await sql\`delete from elections where id = '${ELECTION_ID}'\`;
await sql\`delete from "user" where email = 'task3-voter@example.com'\`;
console.log("cleaned up");
EOF
node scratch-cleanup-task3.mjs
rm scratch-cleanup-task3.mjs cookies-admin.txt cookies-voter.txt
```

Expected: prints "cleaned up".

Run a final check reusing the query pattern from Step 3 to confirm `elections`, `candidates`, `votes` are all empty and the `user` table has only the real admin account.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/voting.ts
git commit -m "Add castVote mutation with full server-side integrity checks"
```

---

### Task 4: Voter navigation + layout wiring

**Files:**
- Create: `src/features/voting/components/voter-nav.tsx`
- Modify: `src/app/voter/layout.tsx`

**Interfaces:**
- Consumes: `ThemeToggle` from `@/components/shared/theme-toggle` (Foundation phase); `LogoutButton` from `@/features/auth/components/logout-button` (Auth phase).
- Produces: `VoterNav` component from `@/features/voting/components/voter-nav`, rendered in the voter section layout.

- [ ] **Step 1: Write the nav component**

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Vote } from "lucide-react"

import { ThemeToggle } from "@/components/shared/theme-toggle"
import { LogoutButton } from "@/features/auth/components/logout-button"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { href: "/voter/dashboard", label: "Dashboard" },
  { href: "/voter/elections", label: "Elections" },
  { href: "/voter/votes", label: "My Votes" },
]

export function VoterNav() {
  const pathname = usePathname()

  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      <div className="flex items-center gap-6">
        <Link href="/voter/dashboard" className="flex items-center gap-2 font-semibold">
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

Save as `src/features/voting/components/voter-nav.tsx`.

- [ ] **Step 2: Wire it into the voter layout**

Read the current `src/app/voter/layout.tsx` first (from the Auth phase — it has the role/status guard), then replace its full contents:

```tsx
import { redirect } from "next/navigation"

import { getServerSession } from "@/server/auth/get-session"
import { VoterNav } from "@/features/voting/components/voter-nav"

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
    redirect("/suspended")
  }
  if (session.user.role !== "voter") {
    redirect("/admin/dashboard")
  }

  return (
    <div className="flex flex-1 flex-col">
      <VoterNav />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 4: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds (this modifies an existing layout used by `/voter/dashboard`, `/suspended`-adjacent routes — confirm nothing broke).

- [ ] **Step 5: Verify in the browser**

Log in as the seeded admin — wait, the admin can't reach `/voter/*` (redirected to `/admin/dashboard` by this same layout). Use the throwaway voter pattern from Task 3 (register + verify via scratch script + log in), navigate to `/voter/dashboard`, confirm the nav bar renders with working Dashboard/Elections/My Votes links (Elections and My Votes will 404 until Tasks 5/9 build them — that's expected right now), theme toggle, and logout button. Clean up the test voter account afterward.

- [ ] **Step 6: Commit**

```bash
git add src/features/voting/components/voter-nav.tsx src/app/voter/layout.tsx
git commit -m "Add voter navigation header"
```

---

### Task 5: Election card + voter elections list page

**Files:**
- Create: `src/features/voting/components/election-card.tsx`
- Create: `src/app/voter/elections/page.tsx`

**Interfaces:**
- Consumes: `trpc.voting.listElections` (Task 2); `EffectiveElectionStatus` from `@/lib/election-status` (Admin phase).
- Produces: `ElectionCard` component from `@/features/voting/components/election-card`.

- [ ] **Step 1: Write the election card**

```tsx
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { EffectiveElectionStatus } from "@/lib/election-status"

type ElectionCardProps = {
  election: {
    id: string
    title: string
    description: string | null
    category: string | null
    bannerUrl: string | null
    startDate: Date
    endDate: Date
    effectiveStatus: EffectiveElectionStatus
  }
}

const STATUS_LABELS: Record<EffectiveElectionStatus, string> = {
  draft: "Draft",
  upcoming: "Upcoming",
  active: "Active",
  ended: "Ended",
  closed: "Closed",
}

export function ElectionCard({ election }: ElectionCardProps) {
  return (
    <Link href={`/voter/elections/${election.id}`}>
      <Card className="h-full transition-colors hover:bg-muted/50">
        {election.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={election.bannerUrl}
            alt=""
            className="aspect-video w-full rounded-t-xl object-cover"
          />
        )}
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{election.title}</CardTitle>
            <Badge variant={election.effectiveStatus === "active" ? "default" : "outline"}>
              {STATUS_LABELS[election.effectiveStatus]}
            </Badge>
          </div>
          {election.category && <CardDescription>{election.category}</CardDescription>}
        </CardHeader>
        <CardContent>
          {election.description && (
            <p className="text-muted-foreground line-clamp-2 text-sm">{election.description}</p>
          )}
          <p className="text-muted-foreground mt-2 text-xs">
            {election.startDate.toLocaleDateString()} – {election.endDate.toLocaleDateString()}
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
```

Save as `src/features/voting/components/election-card.tsx`.

- [ ] **Step 2: Write the elections list page**

```tsx
"use client"

import { trpc } from "@/lib/trpc/client"
import { ElectionCard } from "@/features/voting/components/election-card"
import type { EffectiveElectionStatus } from "@/lib/election-status"

function groupByStatus<T extends { effectiveStatus: EffectiveElectionStatus }>(items: T[]) {
  return {
    active: items.filter((e) => e.effectiveStatus === "active"),
    upcoming: items.filter((e) => e.effectiveStatus === "upcoming"),
    past: items.filter((e) => e.effectiveStatus === "ended" || e.effectiveStatus === "closed"),
  }
}

export default function VoterElectionsPage() {
  const { data, isLoading } = trpc.voting.listElections.useQuery()

  if (isLoading) {
    return <p className="text-muted-foreground p-6 text-sm">Loading elections…</p>
  }

  if (!data || data.length === 0) {
    return <p className="text-muted-foreground p-6 text-sm">No elections available yet.</p>
  }

  const { active, upcoming, past } = groupByStatus(data)

  return (
    <div className="space-y-8 p-6">
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

Save as `src/app/voter/elections/page.tsx`.

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 4: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds, `/voter/elections` appears in the route table.

- [ ] **Step 5: Verify in the browser**

Using the admin session, create a public, published election with a banner (via `/admin/elections`). Log in as a throwaway voter (register + verify via scratch script), navigate to `/voter/elections`, confirm the election appears under "Active Elections" with its banner and status badge. Clean up afterward (delete the test election via admin, delete the test voter account).

- [ ] **Step 6: Commit**

```bash
git add src/features/voting/components/election-card.tsx src/app/voter/elections/page.tsx
git commit -m "Add election card and voter elections list page"
```

---

### Task 6: Candidate card + profile dialog

**Files:**
- Create: `src/features/voting/components/candidate-profile-dialog.tsx`
- Create: `src/features/voting/components/candidate-card.tsx`

**Interfaces:**
- Produces: `CandidateProfileDialog` component from `@/features/voting/components/candidate-profile-dialog`; `CandidateCard` component from `@/features/voting/components/candidate-card`, prop `{ candidate: {...} }` (full candidate shape, matching what `voting.getElection` returns per candidate).

- [ ] **Step 1: Write the candidate profile dialog**

```tsx
"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"

type Candidate = {
  fullName: string
  biography: string | null
  politicalParty: string | null
  position: string | null
  manifesto: string | null
  education: string | null
  experience: string | null
  campaignMessage: string | null
  socialLinks: {
    website?: string
    twitter?: string
    facebook?: string
    instagram?: string
    linkedin?: string
  } | null
}

type CandidateProfileDialogProps = {
  candidate: Candidate
  open: boolean
  onOpenChange: (open: boolean) => void
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-muted-foreground text-sm whitespace-pre-wrap">{value}</p>
    </div>
  )
}

export function CandidateProfileDialog({
  candidate,
  open,
  onOpenChange,
}: CandidateProfileDialogProps) {
  const socialEntries = candidate.socialLinks
    ? Object.entries(candidate.socialLinks).filter(([, url]) => url)
    : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{candidate.fullName}</DialogTitle>
          <DialogDescription>
            {[candidate.politicalParty, candidate.position].filter(Boolean).join(" · ")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Biography" value={candidate.biography} />
          <Field label="Manifesto" value={candidate.manifesto} />
          <Field label="Education" value={candidate.education} />
          <Field label="Experience" value={candidate.experience} />
          <Field label="Campaign message" value={candidate.campaignMessage} />
          {socialEntries.length > 0 && (
            <>
              <Separator />
              <div className="flex flex-wrap gap-3">
                {socialEntries.map(([platform, url]) => (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary text-sm capitalize underline underline-offset-4"
                  >
                    {platform}
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

Save as `src/features/voting/components/candidate-profile-dialog.tsx`.

- [ ] **Step 2: Write the candidate card**

```tsx
"use client"

import { useState } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CandidateProfileDialog } from "./candidate-profile-dialog"

type Candidate = {
  id: string
  fullName: string
  photoUrl: string | null
  biography: string | null
  politicalParty: string | null
  position: string | null
  manifesto: string | null
  education: string | null
  experience: string | null
  campaignMessage: string | null
  socialLinks: {
    website?: string
    twitter?: string
    facebook?: string
    instagram?: string
    linkedin?: string
  } | null
  status: "active" | "withdrawn"
}

export function CandidateCard({ candidate }: { candidate: Candidate }) {
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
        <Avatar className="size-20">
          <AvatarImage src={candidate.photoUrl ?? undefined} alt={candidate.fullName} />
          <AvatarFallback>{candidate.fullName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold">{candidate.fullName}</p>
          {candidate.politicalParty && (
            <p className="text-muted-foreground text-sm">{candidate.politicalParty}</p>
          )}
          {candidate.position && (
            <p className="text-muted-foreground text-sm">{candidate.position}</p>
          )}
        </div>
        {candidate.biography && (
          <p className="text-muted-foreground line-clamp-3 text-sm">{candidate.biography}</p>
        )}
        <Button variant="outline" size="sm" onClick={() => setIsProfileOpen(true)}>
          View full profile
        </Button>
      </CardContent>
      <CandidateProfileDialog
        candidate={candidate}
        open={isProfileOpen}
        onOpenChange={setIsProfileOpen}
      />
    </Card>
  )
}
```

Save as `src/features/voting/components/candidate-card.tsx`.

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 4: Commit**

```bash
git add src/features/voting/components/candidate-profile-dialog.tsx src/features/voting/components/candidate-card.tsx
git commit -m "Add candidate card and profile dialog components"
```

---

### Task 7: Vote form

**Files:**
- Create: `src/features/voting/components/vote-form.tsx`

**Interfaces:**
- Consumes: `trpc.voting.castVote` (Task 3).
- Produces: `VoteForm` component from `@/features/voting/components/vote-form`, props `{ electionId: string; candidates: { id: string; fullName: string; politicalParty: string | null }[] }`.

- [ ] **Step 1: Write the vote form**

```tsx
"use client"

import { useState } from "react"
import { toast } from "sonner"

import { trpc } from "@/lib/trpc/client"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

type VoteFormCandidate = {
  id: string
  fullName: string
  politicalParty: string | null
}

type VoteFormProps = {
  electionId: string
  candidates: VoteFormCandidate[]
}

export function VoteForm({ electionId, candidates }: VoteFormProps) {
  const utils = trpc.useUtils()
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)

  const castVoteMutation = trpc.voting.castVote.useMutation({
    onSuccess: async () => {
      await utils.voting.getElection.invalidate({ electionId })
      await utils.voting.myVotes.invalidate()
      toast.success("Your vote has been recorded")
    },
    onError: (error) => toast.error(error.message),
  })

  function handleSubmit() {
    if (!selectedCandidateId) {
      toast.error("Select a candidate to vote for")
      return
    }
    castVoteMutation.mutate({ electionId, candidateId: selectedCandidateId })
  }

  if (candidates.length === 0) {
    return <p className="text-muted-foreground text-sm">No candidates are available to vote for yet.</p>
  }

  return (
    <div className="space-y-4">
      <RadioGroup
        value={selectedCandidateId ?? undefined}
        onValueChange={setSelectedCandidateId}
      >
        {candidates.map((candidate) => (
          <div key={candidate.id} className="flex items-center gap-3 rounded-lg border p-3">
            <RadioGroupItem value={candidate.id} id={`candidate-${candidate.id}`} />
            <Label htmlFor={`candidate-${candidate.id}`} className="flex-1 cursor-pointer">
              <span className="font-medium">{candidate.fullName}</span>
              {candidate.politicalParty && (
                <span className="text-muted-foreground ml-2 text-sm">
                  {candidate.politicalParty}
                </span>
              )}
            </Label>
          </div>
        ))}
      </RadioGroup>
      <Button
        onClick={handleSubmit}
        disabled={castVoteMutation.isPending || !selectedCandidateId}
      >
        {castVoteMutation.isPending ? "Submitting…" : "Cast Vote"}
      </Button>
    </div>
  )
}
```

Save as `src/features/voting/components/vote-form.tsx`.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors). If `RadioGroup`'s `value`/`onValueChange` props error, check `src/components/ui/radio-group.tsx`'s `RadioGroupPrimitive.Props` (from `@base-ui/react/radio-group`) for the actual prop names.

- [ ] **Step 3: Commit**

```bash
git add src/features/voting/components/vote-form.tsx
git commit -m "Add vote casting form"
```

---

### Task 8: Vote confirmation card + election detail page

**Files:**
- Create: `src/features/voting/components/vote-confirmation-card.tsx`
- Create: `src/app/voter/elections/[electionId]/page.tsx`

**Interfaces:**
- Consumes: `trpc.voting.getElection` (Task 2); `CandidateCard` (Task 6); `VoteForm` (Task 7).
- Produces: working `/voter/elections/[electionId]` route — the phase's core integration point.

- [ ] **Step 1: Write the vote confirmation card**

```tsx
import { CheckCircle2 } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function VoteConfirmationCard({
  candidateName,
  votedAt,
}: {
  candidateName: string
  votedAt: Date
}) {
  return (
    <Card className="border-green-600/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-green-600" />
          Vote recorded
        </CardTitle>
        <CardDescription>
          You voted for <span className="font-medium">{candidateName}</span> on{" "}
          {votedAt.toLocaleString()}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">Votes cannot be changed once cast.</p>
      </CardContent>
    </Card>
  )
}
```

Save as `src/features/voting/components/vote-confirmation-card.tsx`.

- [ ] **Step 2: Write the election detail page**

```tsx
"use client"

import { useParams } from "next/navigation"

import { trpc } from "@/lib/trpc/client"
import { CandidateCard } from "@/features/voting/components/candidate-card"
import { VoteForm } from "@/features/voting/components/vote-form"
import { VoteConfirmationCard } from "@/features/voting/components/vote-confirmation-card"
import { Badge } from "@/components/ui/badge"
import type { EffectiveElectionStatus } from "@/lib/election-status"

const STATUS_LABELS: Record<EffectiveElectionStatus, string> = {
  draft: "Draft",
  upcoming: "Upcoming",
  active: "Active",
  ended: "Ended",
  closed: "Closed",
}

export default function VoterElectionDetailPage() {
  const params = useParams<{ electionId: string }>()
  const electionId = params.electionId

  const { data, isLoading, error } = trpc.voting.getElection.useQuery({ electionId })

  if (isLoading) {
    return <p className="text-muted-foreground p-6 text-sm">Loading election…</p>
  }

  if (error || !data) {
    return <p className="text-muted-foreground p-6 text-sm">Election not found.</p>
  }

  const { election, candidates, votedCandidateId, votedAt } = data
  const votedCandidate = candidates.find((c) => c.id === votedCandidateId)

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {election.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={election.bannerUrl}
          alt=""
          className="aspect-[3/1] w-full rounded-xl object-cover"
        />
      )}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{election.title}</h1>
        <Badge variant={election.effectiveStatus === "active" ? "default" : "outline"}>
          {STATUS_LABELS[election.effectiveStatus]}
        </Badge>
      </div>
      {election.description && <p className="text-muted-foreground">{election.description}</p>}
      {election.instructions && (
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">Instructions</p>
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">
            {election.instructions}
          </p>
        </div>
      )}
      {election.rules && (
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">Rules</p>
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">{election.rules}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {candidates.map((candidate) => (
          <CandidateCard key={candidate.id} candidate={candidate} />
        ))}
      </div>

      {votedCandidate && votedAt ? (
        <VoteConfirmationCard candidateName={votedCandidate.fullName} votedAt={votedAt} />
      ) : election.effectiveStatus === "active" ? (
        <VoteForm
          electionId={election.id}
          candidates={candidates.filter((c) => c.status === "active")}
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          This election is not currently open for voting.
        </p>
      )}
    </div>
  )
}
```

Save as `src/app/voter/elections/[electionId]/page.tsx`.

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 4: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds, `/voter/elections/[electionId]` appears in the route table.

- [ ] **Step 5: Verify in the browser — the full voting flow**

As admin: create a public election with a banner, dates spanning "now", publish it, add two active candidates with photos and bios. As a throwaway voter: navigate to the election's detail page, confirm both candidate cards render, click "View full profile" on one and confirm the dialog shows its full bio/manifesto/etc., select a candidate in the vote form and submit. Confirm the page immediately (no reload) swaps the form for the "Vote recorded" confirmation card showing the correct candidate name and a real timestamp — NOT the form again. Refresh the page manually too, and confirm the confirmation card still shows (proving it's reading real DB state, not just optimistic UI). Clean up: delete the vote/candidates/election via admin, delete the test voter.

- [ ] **Step 6: Commit**

```bash
git add src/features/voting/components/vote-confirmation-card.tsx "src/app/voter/elections/[electionId]/page.tsx"
git commit -m "Add vote confirmation card and election detail page"
```

---

### Task 9: Voting history page

**Files:**
- Create: `src/app/voter/votes/page.tsx`

**Interfaces:**
- Consumes: `trpc.voting.myVotes` (Task 2).
- Produces: working `/voter/votes` route.

- [ ] **Step 1: Write the voting history page**

```tsx
"use client"

import Link from "next/link"

import { trpc } from "@/lib/trpc/client"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function MyVotesPage() {
  const { data, isLoading } = trpc.voting.myVotes.useQuery()

  if (isLoading) {
    return <p className="text-muted-foreground p-6 text-sm">Loading your voting history…</p>
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-muted-foreground p-6 text-sm">
        You haven&apos;t voted in any elections yet.
      </p>
    )
  }

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">My Votes</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Election</TableHead>
            <TableHead>Candidate</TableHead>
            <TableHead>Voted at</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((vote) => (
            <TableRow key={vote.id}>
              <TableCell>
                <Link href={`/voter/elections/${vote.election.id}`} className="hover:underline">
                  {vote.election.title}
                </Link>
              </TableCell>
              <TableCell>{vote.candidate.fullName}</TableCell>
              <TableCell>{vote.votedAt.toLocaleString()}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

Save as `src/app/voter/votes/page.tsx`.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 3: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds, `/voter/votes` appears in the route table.

- [ ] **Step 4: Verify in the browser**

As a throwaway voter who has cast at least one vote (reuse the Task 8 flow, or create a fresh election/vote), navigate to `/voter/votes`, confirm the vote appears with the correct election title (linking back to the detail page), candidate name, and timestamp. Clean up test data afterward.

- [ ] **Step 5: Commit**

```bash
git add src/app/voter/votes/page.tsx
git commit -m "Add voting history page"
```

---

### Task 10: Voter dashboard update

**Files:**
- Modify: `src/app/voter/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getServerSession` from `@/server/auth/get-session` (Auth phase, already used here).
- Produces: updated `/voter/dashboard` content — no new exports consumed elsewhere.

- [ ] **Step 1: Replace the placeholder dashboard**

Read the current `src/app/voter/dashboard/page.tsx` first (the Auth-phase placeholder with just a greeting and a `LogoutButton`), then replace its full contents. The `LogoutButton` is removed from the page body since Task 4's `VoterNav` (now wrapping every voter page) already provides it globally:

```tsx
import Link from "next/link"
import { History, Vote } from "lucide-react"

import { getServerSession } from "@/server/auth/get-session"
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

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 3: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 4: Verify in the browser**

As a throwaway voter, navigate to `/voter/dashboard`, confirm the greeting shows the correct name/email, and both "Browse elections" / "View voting history" buttons navigate correctly. Confirm there's exactly one logout control visible (in the nav bar), not two.

- [ ] **Step 5: Commit**

```bash
git add src/app/voter/dashboard/page.tsx
git commit -m "Replace voter dashboard placeholder with real navigation content"
```

---

### Task 11: Full end-to-end verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full production build**

Run: `pnpm build`
Expected: `Compiled successfully`, zero TypeScript errors, route table includes `/voter/elections`, `/voter/elections/[electionId]`, `/voter/votes`, alongside every route from the Foundation, Auth, and Admin phases.

- [ ] **Step 2: Full lifecycle browser walkthrough**

As admin: create a public election with a banner, dates spanning "now", publish it, add two candidates with photos. As a fresh throwaway voter: browse `/voter/elections`, confirm it's grouped correctly; open the election, view a candidate's full profile; cast a vote; confirm the inline confirmation appears immediately and survives a manual refresh; confirm `/voter/votes` shows it; confirm `/voter/dashboard` navigation works.

- [ ] **Step 3: Duplicate-vote and private-election enforcement, from a fresh angle**

Using the same voter session from Step 2, attempt `POST /api/trpc/voting.castVote` again for the same election/a different candidate — confirm `CONFLICT`. Using the admin session, create a second election with `visibility: "private"`, publish it — confirm it does NOT appear in `voting.listElections` for the voter, and `voting.getElection`/`voting.castVote` both return `NOT_FOUND` for it even though the voter has its exact ID (get the ID from the admin's own `elections.list` response).

- [ ] **Step 4: Non-voter and unauthenticated enforcement**

Confirm `curl -i http://localhost:3000/voter/elections` with no session redirects to `/login` (existing Auth-phase middleware, unchanged by this phase — verify it still works for the new routes). Confirm the seeded admin account, if it tried to reach `/voter/dashboard`, gets redirected to `/admin/dashboard` by the existing `voter/layout.tsx` guard (unchanged logic, just confirm it still holds after this phase's edits to that file).

- [ ] **Step 5: Git and secrets check**

Run: `git status` — expect a clean tree.
Run: `git ls-files | grep -i "\.env"` — expect only `.env.example`.

- [ ] **Step 6: Final cleanup and commit**

Confirm all test elections/candidates/votes/voter accounts created during this verification pass are deleted, and the real admin account is untouched. If `git status` shows anything uncommitted, clean up and commit; otherwise no commit needed — the phase is complete.
