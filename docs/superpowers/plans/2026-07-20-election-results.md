# Election Results (Phase 4B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute and display election results (total votes, rankings, percentages, winner(s), turnout, charts, progress bars, stat cards), and let admins publish/hide/export them.

**Architecture:** A single shared server function (`computeElectionResults`) is the one source of truth for vote tallying — called by an always-on admin tRPC query, a publish-gated voter tRPC query, and a CSV export Route Handler, so the three consumers can never compute different numbers. A shared presentational `ResultsPanel` component (stat cards + chart + ranked progress bars) is reused identically by both the admin and voter pages; only the surrounding controls (publish/hide, export) differ, each in its own small client component that owns its own query/mutation — mirroring the `CandidatesTable` pattern already established in the Admin phase, so no `router.refresh()` plumbing is needed on the (still server-component) pages they're embedded in.

**Tech Stack:** Next.js 16 App Router, TypeScript, tRPC, Drizzle ORM, Neon Postgres, TanStack Query, shadcn/ui (base-nova/Base UI), Recharts (via shadcn's chart component — new dependency), Tailwind CSS, Lucide React.

## Global Constraints

- `computeElectionResults(db, electionId)` (in `src/server/results.ts`) is the ONLY place vote-tallying logic lives. All three consumers (`elections.getResults`, `voting.getResults`, the export Route Handler) call it — never reimplement the aggregation/percentage/winner/turnout math anywhere else.
- Turnout denominator is `user` rows with `role: "voter"` AND `status: "active"` — admins are excluded. If that count is `0`, turnout is `0`, not a divide-by-zero error. Same guard for candidate percentages when `totalVotes === 0`.
- Winner determination: ALL candidates tied for the top vote count are marked `isWinner: true` — no arbitrary tie-breaking. If `totalVotes === 0`, no candidate is a winner.
- `voting.getResults` returns `{ published: false }` (not an error) when results aren't published, private, or the election is a draft — the UI branches on this cleanly rather than catching a thrown error.
- Publish/hide (`elections.publishResults`/`hideResults`) is independent of election status — admins can publish live/interim results on an active election, not just ended ones.
- Export is a Route Handler (`src/app/api/admin/elections/[electionId]/export/route.ts`), not a tRPC procedure — file downloads need real `Content-Disposition` headers.
- No test framework exists in this project — every "verify" step uses `tsc --noEmit`, `pnpm build`, and live curl/browser/DB-script checks, never `jest`/`vitest`.
- **Git commit messages must NOT include `Co-Authored-By: Claude`, "Generated with Claude Code", or any AI-attribution trailer.**
- Path alias `@/*` maps to `src/*`. File naming: kebab-case files, PascalCase components.
- This project uses Base UI, not Radix — `Button`-as-link uses `render={<Link .../>}` (or a plain `<a>` for the export download link, since that needs native browser download behavior, not client-side routing).

## Operational Notes

- Keep `pnpm dev` running in the background throughout.
- Admin-side verification: sign in as the real admin via `curl` using `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` from `.env.local` — same pattern used throughout the Admin and Voting phases.
- Voter-side verification: register throwaway voter accounts, verify email via a scratch DB script, log into the BROWSER as that voter (never the admin) for any UI check.
- **Same strict scope boundaries as every prior phase**: elevating any account to admin, or inserting election/candidate rows via raw SQL bypassing the real admin API, are NOT authorized. Votes are the one exception where direct SQL is sometimes necessary for test setup speed (casting many votes across several throwaway voters one-by-one via the real `castVote` endpoint is fine and preferred when practical; if a task needs many votes purely to exercise result math, insert `votes` rows directly via scratch script referencing real election/candidate/user ids created through the real APIs — never fabricate the election/candidate/user rows themselves).
- Clean up ALL test data (elections, candidates, votes, throwaway voter accounts, cookie jars, scratch scripts) at the end of every task.

---

### Task 1: Results computation function

**Files:**
- Create: `src/server/results.ts`

**Interfaces:**
- Consumes: `elections`, `candidates`, `votes`, `user` from `@/server/db/schema` (Foundation phase).
- Produces: `ElectionResults` type and `computeElectionResults(db, electionId): Promise<ElectionResults | null>` from `@/server/results`.

- [ ] **Step 1: Write the computation function**

```ts
import { eq, and, count } from "drizzle-orm";

import type { db as dbType } from "@/server/db";
import { elections, candidates, votes, user } from "@/server/db/schema";

type Database = typeof dbType;

export type ElectionResults = {
  election: {
    id: string;
    title: string;
    resultsPublished: boolean;
  };
  candidates: Array<{
    id: string;
    fullName: string;
    photoUrl: string | null;
    voteCount: number;
    percentage: number;
    rank: number;
    isWinner: boolean;
  }>;
  totalVotes: number;
  totalActiveVoters: number;
  turnoutPercentage: number;
};

/**
 * The one place vote-tallying math lives. Rank is plain sequential order in
 * the sorted list (not competition-ranking with skipped numbers) — ties are
 * communicated via `isWinner`, not the numeric rank, so this stays simple.
 */
export async function computeElectionResults(
  db: Database,
  electionId: string
): Promise<ElectionResults | null> {
  const election = await db.query.elections.findFirst({
    where: eq(elections.id, electionId),
  });

  if (!election) {
    return null;
  }

  const electionCandidates = await db.query.candidates.findMany({
    where: eq(candidates.electionId, electionId),
  });

  const voteCounts = await db
    .select({ candidateId: votes.candidateId, voteCount: count() })
    .from(votes)
    .where(eq(votes.electionId, electionId))
    .groupBy(votes.candidateId);

  const voteCountByCandidateId = new Map(
    voteCounts.map((row) => [row.candidateId, row.voteCount])
  );

  const totalVotes = voteCounts.reduce((sum, row) => sum + row.voteCount, 0);

  const withCounts = electionCandidates.map((candidate) => ({
    id: candidate.id,
    fullName: candidate.fullName,
    photoUrl: candidate.photoUrl,
    voteCount: voteCountByCandidateId.get(candidate.id) ?? 0,
  }));

  const sorted = [...withCounts].sort((a, b) => b.voteCount - a.voteCount);
  const topVoteCount = sorted[0]?.voteCount ?? 0;

  const rankedCandidates = sorted.map((candidate, index) => ({
    ...candidate,
    percentage: totalVotes > 0 ? (candidate.voteCount / totalVotes) * 100 : 0,
    rank: index + 1,
    isWinner: totalVotes > 0 && candidate.voteCount === topVoteCount,
  }));

  const [{ totalActiveVoters }] = await db
    .select({ totalActiveVoters: count() })
    .from(user)
    .where(and(eq(user.role, "voter"), eq(user.status, "active")));

  return {
    election: {
      id: election.id,
      title: election.title,
      resultsPublished: election.resultsPublished,
    },
    candidates: rankedCandidates,
    totalVotes,
    totalActiveVoters,
    turnoutPercentage:
      totalActiveVoters > 0 ? (totalVotes / totalActiveVoters) * 100 : 0,
  };
}
```

Save as `src/server/results.ts`.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors). If `type Database = typeof dbType` errors on the `import type { db as dbType }` line, use `Awaited<ReturnType<typeof import("@/server/db")>>["db"]` style typing instead, or simply type the parameter as the return type of `drizzle(...)` directly — check `src/server/db/index.ts` for the exact exported type if the first approach doesn't work.

- [ ] **Step 3: Verify with real data — three scenarios**

Sign in as admin, create a test election, publish it, add two candidates:

```bash
curl -s -c cookies-admin.txt -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"<ADMIN_SEED_EMAIL>","password":"<ADMIN_SEED_PASSWORD>"}' > /dev/null

curl -s -b cookies-admin.txt -X POST http://localhost:3000/api/trpc/elections.create \
  -H "Content-Type: application/json" \
  -d '{"json":{"title":"Task 1 Results Test","visibility":"public","startDate":"2020-01-01T00:00:00.000Z","endDate":"2099-01-01T00:00:00.000Z"}}'
```

Copy the election id as `$ELECTION_ID`, then publish it and create two candidates, copying their ids as `$CANDIDATE_A` and `$CANDIDATE_B`:

```bash
curl -s -b cookies-admin.txt -X POST http://localhost:3000/api/trpc/elections.publish \
  -H "Content-Type: application/json" -d "{\"json\":{\"id\":\"$ELECTION_ID\"}}"

curl -s -b cookies-admin.txt -X POST http://localhost:3000/api/trpc/candidates.create \
  -H "Content-Type: application/json" \
  -d "{\"json\":{\"electionId\":\"$ELECTION_ID\",\"fullName\":\"Candidate A\",\"status\":\"active\"}}"

curl -s -b cookies-admin.txt -X POST http://localhost:3000/api/trpc/candidates.create \
  -H "Content-Type: application/json" \
  -d "{\"json\":{\"electionId\":\"$ELECTION_ID\",\"fullName\":\"Candidate B\",\"status\":\"active\"}}"
```

**Scenario 1 — zero votes.** Run this scratch script (temporary, delete after use):

```bash
cat > scratch-verify-results.ts << EOF
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "./src/server/db";
import { computeElectionResults } from "./src/server/results";

const results = await computeElectionResults(db, "$ELECTION_ID");
console.log(JSON.stringify(results, null, 2));
EOF
npx tsx scratch-verify-results.ts
```

Expected: `totalVotes: 0`, both candidates `voteCount: 0, percentage: 0, isWinner: false`.

**Scenario 2 — clear winner.** Register 3 throwaway voters (`task1-voter-1@example.com` through `-3@example.com`), verify each via a scratch DB script (`UPDATE "user" SET email_verified = true WHERE email IN (...)`), sign in as each and cast a vote via `POST /api/trpc/voting.castVote` — 2 votes for `$CANDIDATE_A`, 1 for `$CANDIDATE_B`. Re-run `scratch-verify-results.ts`. Expected: `totalVotes: 3`, Candidate A `voteCount: 2, percentage: ~66.67, isWinner: true`, Candidate B `voteCount: 1, percentage: ~33.33, isWinner: false`.

**Scenario 3 — tie.** Create a second election the same way (`$ELECTION_ID_2`) with two candidates (`$CANDIDATE_C`, `$CANDIDATE_D`), publish it, cast exactly one vote for each from two more throwaway voters. Verify: both candidates `voteCount: 1, isWinner: true`.

**Turnout check**: with N total active voters in the system at the time (query `select count(*) from "user" where role = 'voter' and status = 'active'` — should be low since prior phases' throwaway accounts were all cleaned up, so this count reflects only the voters you just registered for this task, which is fine), confirm `turnoutPercentage` matches `(votes in that election / N) * 100` for each scenario.

- [ ] **Step 4: Clean up**

Delete both test elections (cascades candidates), delete all throwaway voter accounts, delete `scratch-verify-results.ts` and any other scratch scripts, delete `cookies-admin.txt`. Confirm via a final DB check that `elections`/`candidates`/`votes` are empty and `user` has only the real admin.

- [ ] **Step 5: Commit**

```bash
git add src/server/results.ts
git commit -m "Add election results computation function"
```

---

### Task 2: Chart component + vote share chart

**Files:**
- Create: `src/components/ui/chart.tsx` (via shadcn CLI)
- Create: `src/features/results/components/vote-share-chart.tsx`

**Interfaces:**
- Produces: `VoteShareChart` component from `@/features/results/components/vote-share-chart`, prop `{ data: { name: string; votes: number }[] }`.

- [ ] **Step 1: Install the shadcn chart component**

Run: `pnpm dlx shadcn@latest add chart --yes`
Expected: creates `src/components/ui/chart.tsx` and adds `recharts` to `package.json` dependencies. If `pnpm install` reports `[ERR_PNPM_IGNORED_BUILDS]` for any resulting dependency, add it to `allowBuilds: true` in `pnpm-workspace.yaml` (same pattern already used for `sharp`/`esbuild`) and re-run `pnpm install`.

- [ ] **Step 2: Read the generated file**

Open `src/components/ui/chart.tsx` and confirm it exports `ChartContainer`, `ChartConfig` (a type), `ChartTooltip`, and `ChartTooltipContent` — these are the standard shadcn chart primitives. If the generated API differs from this (unlikely, but this project's `base-nova` style has diverged from stock shadcn in other components), adapt Step 3 below to match what's actually exported.

- [ ] **Step 3: Write the vote share chart**

```tsx
"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

type VoteShareChartProps = {
  data: { name: string; votes: number }[]
}

const chartConfig = {
  votes: {
    label: "Votes",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

export function VoteShareChart({ data }: VoteShareChartProps) {
  return (
    <ChartContainer config={chartConfig} className="h-64 w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="votes" fill="var(--color-votes)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}
```

Save as `src/features/results/components/vote-share-chart.tsx`.

- [ ] **Step 4: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/chart.tsx src/features/results/components/vote-share-chart.tsx package.json pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "Add shadcn chart component and vote share chart"
```

---

### Task 3: Elections router — results procedures

**Files:**
- Modify: `src/server/api/routers/elections.ts`

**Interfaces:**
- Consumes: `computeElectionResults` (Task 1); `adminProcedure` (Auth phase).
- Produces: `elections.getResults`, `elections.publishResults`, `elections.hideResults` added to `electionsRouter`.

- [ ] **Step 1: Add the three procedures**

Read the current `src/server/api/routers/elections.ts` first, then add this import at the top:

```ts
import { computeElectionResults } from "@/server/results";
```

And add these three procedures inside `electionsRouter` (after `delete`):

```ts
  getResults: adminProcedure
    .input(z.object({ electionId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const results = await computeElectionResults(ctx.db, input.electionId);

      if (!results) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
      }

      return results;
    }),

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

      return election;
    }),

  hideResults: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [election] = await ctx.db
        .update(elections)
        .set({ resultsPublished: false })
        .where(eq(elections.id, input.id))
        .returning();

      if (!election) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
      }

      return election;
    }),
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 3: Verify against the running dev server**

Sign in as admin, create+publish a test election with one candidate:

```bash
curl -s -c cookies-admin.txt -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"<ADMIN_SEED_EMAIL>","password":"<ADMIN_SEED_PASSWORD>"}' > /dev/null

curl -s -b cookies-admin.txt -X POST http://localhost:3000/api/trpc/elections.create \
  -H "Content-Type: application/json" \
  -d '{"json":{"title":"Task 3 Verify","visibility":"public","startDate":"2020-01-01T00:00:00.000Z","endDate":"2099-01-01T00:00:00.000Z"}}'
```

Copy the id as `$ELECTION_ID`, then:

```bash
curl -s -b cookies-admin.txt -X POST http://localhost:3000/api/trpc/elections.publish \
  -H "Content-Type: application/json" -d "{\"json\":{\"id\":\"$ELECTION_ID\"}}"

# getResults — should work with zero votes
INPUT=$(node -e "console.log(encodeURIComponent(JSON.stringify({json:{electionId:'$ELECTION_ID'}})))")
curl -s -b cookies-admin.txt "http://localhost:3000/api/trpc/elections.getResults?input=$INPUT"
```

Expected: 200, `totalVotes: 0`, `resultsPublished: false` (default).

```bash
# publishResults
curl -s -b cookies-admin.txt -X POST http://localhost:3000/api/trpc/elections.publishResults \
  -H "Content-Type: application/json" -d "{\"json\":{\"id\":\"$ELECTION_ID\"}}"
```

Expected: 200, `resultsPublished: true`.

```bash
# hideResults
curl -s -b cookies-admin.txt -X POST http://localhost:3000/api/trpc/elections.hideResults \
  -H "Content-Type: application/json" -d "{\"json\":{\"id\":\"$ELECTION_ID\"}}"
```

Expected: 200, `resultsPublished: false`.

```bash
# Confirm admin-gating: no cookie
curl -s -i "http://localhost:3000/api/trpc/elections.getResults?input=$INPUT" | head -5
```

Expected: 401/`UNAUTHORIZED`.

Clean up: delete the test election via `elections.delete`, delete `cookies-admin.txt`.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/elections.ts
git commit -m "Add admin results query and publish/hide mutations"
```

---

### Task 4: Voting router — getResults

**Files:**
- Modify: `src/server/api/routers/voting.ts`

**Interfaces:**
- Consumes: `computeElectionResults` (Task 1); `protectedProcedure` (Auth phase).
- Produces: `voting.getResults` added to `votingRouter`, returning `{ published: false }` or `{ published: true, results: ElectionResults }`.

- [ ] **Step 1: Add the procedure**

Read the current `src/server/api/routers/voting.ts` first, then add this import:

```ts
import { computeElectionResults } from "@/server/results";
```

And add this procedure inside `votingRouter` (after `castVote`):

```ts
  getResults: protectedProcedure
    .input(z.object({ electionId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const election = await ctx.db.query.elections.findFirst({
        where: eq(elections.id, input.electionId),
      });

      if (
        !election ||
        election.visibility !== "public" ||
        election.status === "draft" ||
        !election.resultsPublished
      ) {
        return { published: false as const };
      }

      const results = await computeElectionResults(ctx.db, input.electionId);

      if (!results) {
        return { published: false as const };
      }

      return { published: true as const, results };
    }),
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 3: Verify against the running dev server**

Sign in as admin, create+publish a test election with one candidate (reuse the curl pattern from Task 3). Register and verify a throwaway voter, sign in as them.

```bash
# Before publishing results — should report not published
INPUT=$(node -e "console.log(encodeURIComponent(JSON.stringify({json:{electionId:'$ELECTION_ID'}})))")
curl -s -b cookies-voter.txt "http://localhost:3000/api/trpc/voting.getResults?input=$INPUT"
```

Expected: 200, `{"result":{"data":{"json":{"published":false}}}}`.

```bash
# Admin publishes results
curl -s -b cookies-admin.txt -X POST http://localhost:3000/api/trpc/elections.publishResults \
  -H "Content-Type: application/json" -d "{\"json\":{\"id\":\"$ELECTION_ID\"}}"

# Voter checks again — should now see results
curl -s -b cookies-voter.txt "http://localhost:3000/api/trpc/voting.getResults?input=$INPUT"
```

Expected: 200, `published: true`, `results.totalVotes: 0` (or however many votes exist).

```bash
# Try a private election's id — should report not published even though it exists
curl -s -b cookies-admin.txt -X POST http://localhost:3000/api/trpc/elections.create \
  -H "Content-Type: application/json" \
  -d '{"json":{"title":"Task 4 Private","visibility":"private","startDate":"2020-01-01T00:00:00.000Z","endDate":"2099-01-01T00:00:00.000Z"}}'
```

Copy this second election's id as `$PRIVATE_ELECTION_ID`, publish it and its results as admin, then confirm the voter still gets `published: false` for it (private always wins over resultsPublished):

```bash
curl -s -b cookies-admin.txt -X POST http://localhost:3000/api/trpc/elections.publish \
  -H "Content-Type: application/json" -d "{\"json\":{\"id\":\"$PRIVATE_ELECTION_ID\"}}"
curl -s -b cookies-admin.txt -X POST http://localhost:3000/api/trpc/elections.publishResults \
  -H "Content-Type: application/json" -d "{\"json\":{\"id\":\"$PRIVATE_ELECTION_ID\"}}"

INPUT2=$(node -e "console.log(encodeURIComponent(JSON.stringify({json:{electionId:'$PRIVATE_ELECTION_ID'}})))")
curl -s -b cookies-voter.txt "http://localhost:3000/api/trpc/voting.getResults?input=$INPUT2"
```

Expected: `published: false`.

Clean up: delete both elections via admin, delete the throwaway voter, delete cookie jars.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/voting.ts
git commit -m "Add voter-facing publish-gated results query"
```

---

### Task 5: CSV export Route Handler

**Files:**
- Create: `src/app/api/admin/elections/[electionId]/export/route.ts`

**Interfaces:**
- Consumes: `computeElectionResults` (Task 1); `getServerSession` from `@/server/auth/get-session` (Auth phase); `db` from `@/server/db` (Foundation phase).
- Produces: working `GET /api/admin/elections/[electionId]/export` endpoint, admin-gated, returns a CSV file.

- [ ] **Step 1: Write the route handler**

```ts
import { NextResponse, type NextRequest } from "next/server";

import { getServerSession } from "@/server/auth/get-session";
import { computeElectionResults } from "@/server/results";
import { db } from "@/server/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ electionId: string }> }
) {
  const session = await getServerSession();

  if (!session || session.user.status !== "active" || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { electionId } = await params;
  const results = await computeElectionResults(db, electionId);

  if (!results) {
    return NextResponse.json({ error: "Election not found" }, { status: 404 });
  }

  const header = "Candidate,Votes,Percentage,Rank,Winner\n";
  const rows = results.candidates
    .map((candidate) =>
      [
        `"${candidate.fullName.replace(/"/g, '""')}"`,
        candidate.voteCount,
        `${candidate.percentage.toFixed(2)}%`,
        candidate.rank,
        candidate.isWinner ? "Yes" : "No",
      ].join(",")
    )
    .join("\n");

  const csv = header + rows + "\n";
  const filename = `${results.election.title.replace(/[^a-z0-9]+/gi, "-")}-results.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
```

Save as `src/app/api/admin/elections/[electionId]/export/route.ts`.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 3: Verify against the running dev server**

Sign in as admin, create+publish a test election with two candidates, cast one vote (reuse curl patterns from prior tasks). Then:

```bash
curl -s -i -b cookies-admin.txt "http://localhost:3000/api/admin/elections/$ELECTION_ID/export" -o export-test.csv
head -5 export-test.csv
```

Expected: `Content-Type: text/csv` and `Content-Disposition: attachment; filename="..."` headers (check via `curl -i`, not just `-s`), and the file contains a header row plus one row per candidate with correct vote counts/percentages/rank/winner.

```bash
# Confirm non-admin rejection — no cookie
curl -s -i "http://localhost:3000/api/admin/elections/$ELECTION_ID/export" | head -3
```

Expected: `403`.

Clean up: delete the test election, `export-test.csv`, `cookies-admin.txt`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/admin/elections/[electionId]/export/route.ts"
git commit -m "Add CSV results export route"
```

---

### Task 6: Results panel component

**Files:**
- Create: `src/features/results/components/results-panel.tsx`

**Interfaces:**
- Consumes: `VoteShareChart` (Task 2).
- Produces: `ResultsPanel`, `ResultsPanelData`, `ResultsPanelCandidate` from `@/features/results/components/results-panel`.

- [ ] **Step 1: Write the results panel**

```tsx
import { Trophy } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { VoteShareChart } from "./vote-share-chart"

export type ResultsPanelCandidate = {
  id: string
  fullName: string
  voteCount: number
  percentage: number
  rank: number
  isWinner: boolean
}

export type ResultsPanelData = {
  candidates: ResultsPanelCandidate[]
  totalVotes: number
  totalActiveVoters: number
  turnoutPercentage: number
}

export function ResultsPanel({ data }: { data: ResultsPanelData }) {
  const winners = data.candidates.filter((candidate) => candidate.isWinner)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Total Votes
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data.totalVotes}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Turnout
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {data.turnoutPercentage.toFixed(1)}%
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              {winners.length > 1 ? "Winners" : "Winner"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold">
            {winners.length > 0 ? winners.map((winner) => winner.fullName).join(", ") : "—"}
          </CardContent>
        </Card>
      </div>

      {data.totalVotes > 0 && (
        <VoteShareChart
          data={data.candidates.map((candidate) => ({
            name: candidate.fullName,
            votes: candidate.voteCount,
          }))}
        />
      )}

      <div className="space-y-3">
        {data.candidates.map((candidate) => (
          <div key={candidate.id} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium">
                {candidate.fullName}
                {candidate.isWinner && (
                  <Badge variant="default" className="gap-1">
                    <Trophy className="size-3" />
                    Winner
                  </Badge>
                )}
              </span>
              <span className="text-muted-foreground">
                {candidate.voteCount} votes ({candidate.percentage.toFixed(1)}%)
              </span>
            </div>
            <Progress value={candidate.percentage} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

Save as `src/features/results/components/results-panel.tsx`.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 3: Commit**

```bash
git add src/features/results/components/results-panel.tsx
git commit -m "Add shared results panel component"
```

---

### Task 7: Admin results section + wire into election detail page

**Files:**
- Create: `src/features/results/components/publish-results-control.tsx`
- Create: `src/features/results/components/admin-results-section.tsx`
- Modify: `src/app/admin/elections/[electionId]/page.tsx`

**Interfaces:**
- Consumes: `trpc.elections.getResults`/`publishResults`/`hideResults` (Task 3); `ResultsPanel` (Task 6).
- Produces: a live "Results" section on the admin election detail page.

- [ ] **Step 1: Write the publish/hide control**

```tsx
"use client"

import { toast } from "sonner"

import { trpc } from "@/lib/trpc/client"
import { Button } from "@/components/ui/button"

export function PublishResultsControl({
  electionId,
  resultsPublished,
}: {
  electionId: string
  resultsPublished: boolean
}) {
  const utils = trpc.useUtils()

  const publishMutation = trpc.elections.publishResults.useMutation({
    onSuccess: async () => {
      await utils.elections.getResults.invalidate({ electionId })
      toast.success("Results published")
    },
    onError: (error) => toast.error(error.message),
  })

  const hideMutation = trpc.elections.hideResults.useMutation({
    onSuccess: async () => {
      await utils.elections.getResults.invalidate({ electionId })
      toast.success("Results hidden")
    },
    onError: (error) => toast.error(error.message),
  })

  const isPending = publishMutation.isPending || hideMutation.isPending

  if (resultsPublished) {
    return (
      <Button
        variant="outline"
        disabled={isPending}
        onClick={() => hideMutation.mutate({ id: electionId })}
      >
        {hideMutation.isPending ? "Hiding…" : "Hide results"}
      </Button>
    )
  }

  return (
    <Button disabled={isPending} onClick={() => publishMutation.mutate({ id: electionId })}>
      {publishMutation.isPending ? "Publishing…" : "Publish results"}
    </Button>
  )
}
```

Save as `src/features/results/components/publish-results-control.tsx`.

- [ ] **Step 2: Write the admin results section**

```tsx
"use client"

import { trpc } from "@/lib/trpc/client"
import { ResultsPanel } from "./results-panel"
import { PublishResultsControl } from "./publish-results-control"
import { Button } from "@/components/ui/button"

export function AdminResultsSection({ electionId }: { electionId: string }) {
  const { data, isLoading } = trpc.elections.getResults.useQuery({ electionId })

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading results…</p>
  }

  if (!data) {
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Results</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<a href={`/api/admin/elections/${electionId}/export`} />}
          >
            Export CSV
          </Button>
          <PublishResultsControl
            electionId={electionId}
            resultsPublished={data.election.resultsPublished}
          />
        </div>
      </div>
      <ResultsPanel data={data} />
    </div>
  )
}
```

Save as `src/features/results/components/admin-results-section.tsx`.

- [ ] **Step 3: Wire it into the admin election detail page**

Read the current `src/app/admin/elections/[electionId]/page.tsx` first (it currently composes `ElectionForm`, a `Separator`, and `CandidatesTable`, per the Admin phase). Add the import:

```ts
import { AdminResultsSection } from "@/features/results/components/admin-results-section"
```

And add, after the existing `<CandidatesTable electionId={election.id} />` line (with a `Separator` before it, matching the existing spacing pattern already used between `ElectionForm` and the Candidates section):

```tsx
      <Separator />

      <AdminResultsSection electionId={election.id} />
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 5: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds (this modifies an existing page — confirm nothing broke).

- [ ] **Step 6: Verify in the browser**

As admin: open a test election's detail page (create one with two candidates if needed). Confirm the Results section appears below Candidates, showing stat cards (Total Votes: 0, Turnout, Winner: —), no chart (since `totalVotes === 0`, the chart is conditionally hidden), and both candidates listed with 0%/0 votes progress bars. Click "Publish results" — confirm the button flips to "Hide results" and a success toast appears. Click "Export CSV" — confirm a file downloads. Cast a vote as a throwaway voter (via the already-built voting flow), refresh the admin page, confirm the results update (stat cards, chart now appears, progress bars, winner badge). Click "Hide results" — confirm it flips back. Clean up all test data afterward.

- [ ] **Step 7: Commit**

```bash
git add src/features/results/components/publish-results-control.tsx src/features/results/components/admin-results-section.tsx "src/app/admin/elections/[electionId]/page.tsx"
git commit -m "Add admin results section with publish/hide/export controls"
```

---

### Task 8: Voter results section + wire into election detail page

**Files:**
- Create: `src/features/results/components/voter-results-section.tsx`
- Modify: `src/app/voter/elections/[electionId]/page.tsx`

**Interfaces:**
- Consumes: `trpc.voting.getResults` (Task 4); `ResultsPanel` (Task 6).
- Produces: a publish-gated "Results" section on the voter election detail page.

- [ ] **Step 1: Write the voter results section**

```tsx
"use client"

import { trpc } from "@/lib/trpc/client"
import { ResultsPanel } from "@/features/results/components/results-panel"

export function VoterResultsSection({ electionId }: { electionId: string }) {
  const { data, isLoading } = trpc.voting.getResults.useQuery({ electionId })

  if (isLoading || !data || !data.published) {
    return null
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Results</h2>
      <ResultsPanel data={data.results} />
    </div>
  )
}
```

Save as `src/features/results/components/voter-results-section.tsx`.

- [ ] **Step 2: Wire it into the voter election detail page**

Read the current `src/app/voter/elections/[electionId]/page.tsx` first (from the Voter Voting phase — it's a client component rendering candidate cards and then a vote form/confirmation/read-only block). Add the import:

```ts
import { VoterResultsSection } from "@/features/results/components/voter-results-section"
```

Add `<VoterResultsSection electionId={election.id} />` after the existing vote-form/confirmation/read-only conditional block (so it appears below whatever voting-state UI is showing, not instead of it).

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 4: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 5: Verify in the browser**

As admin: create+publish a test election with two candidates, keep results hidden. As a throwaway voter: view the election detail page, confirm NO Results section appears (not even a "not published" message — nothing). Cast a vote. As admin: publish results. As the voter: refresh the page, confirm the Results section now appears with correct data (their own vote reflected in the tally). As admin: hide results again. As the voter: refresh, confirm the section disappears again. Clean up all test data afterward.

- [ ] **Step 6: Commit**

```bash
git add src/features/results/components/voter-results-section.tsx "src/app/voter/elections/[electionId]/page.tsx"
git commit -m "Add voter-facing publish-gated results section"
```

---

### Task 9: Full end-to-end verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full production build**

Run: `pnpm build`
Expected: `Compiled successfully`, zero TypeScript errors, route table includes `/api/admin/elections/[electionId]/export` alongside every route from all prior phases.

- [ ] **Step 2: Full lifecycle browser walkthrough**

As admin: create a public election with 3 candidates, publish it. As 3 different throwaway voters: cast votes creating a clear ranking (e.g. 3/2/1 votes). As admin: view the Results section — confirm stat cards, chart, ranked progress bars, and winner badge on the top candidate are all correct; export CSV and confirm the file's contents match. Publish results. As one of the voters: confirm the Results section now appears on their view of the election page with matching numbers. As admin: hide results — confirm it disappears for the voter again.

- [ ] **Step 3: Tie and zero-vote edge cases**

Create a second election, publish it with 2 candidates and zero votes — confirm admin's Results section shows graceful zero-state (0 total votes, no chart, no winner, 0% progress bars, no crash). Cast exactly one vote for each of the 2 candidates (a tie) — confirm both show the Winner badge.

**Duplicate-vote and private-election gates that this phase must not have broken**: attempt casting a second vote for the same election as an already-voted voter — confirm `CONFLICT` (Voter Voting phase behavior, unchanged). Confirm a `private` election's results are unreachable to voters even if published (`voting.getResults` returns `published: false`) and even with its exact id.

**Access control**: confirm a non-admin cannot call `elections.getResults`/`publishResults`/`hideResults`, and cannot reach the export endpoint (401/403 in all cases, no session or a voter session).

- [ ] **Step 4: Git and secrets check**

Run: `git status` — expect a clean tree.
Run: `git ls-files | grep -i "\.env"` — expect only `.env.example`.

- [ ] **Step 5: Full cleanup and commit**

Confirm all test elections/candidates/votes/voter accounts created during this verification pass are deleted, and the real admin account is untouched. If `git status` shows anything uncommitted, clean up and commit; otherwise no commit needed — the phase is complete.
