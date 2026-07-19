# Admin: Elections & Candidates Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full admin-only CRUD for elections and candidates — create, edit, publish, close, delete elections; create, edit, delete candidates within an election — plus a signed direct-to-Cloudinary image upload flow for banners and candidate photos.

**Architecture:** Two new `adminProcedure`-guarded tRPC routers (`elections`, `candidates`) plus a small `uploads` router that issues signed Cloudinary upload tokens. A pure `getEffectiveStatus` function derives the displayed election status (upcoming/active/ended) from stored `status` + dates at read time, so only `draft`→publish and any→`closed` are ever written explicitly. Client-side: React Hook Form + Zod forms (same pattern as the Auth phase), a reusable drag-and-drop `ImageUpload` component, and admin pages under the already-guarded `src/app/admin/` section.

**Tech Stack:** Next.js 16 App Router, TypeScript, tRPC, Drizzle ORM, Neon Postgres, TanStack Query, React Hook Form, Zod, shadcn/ui (base-nova/Base UI), Cloudinary, Tailwind CSS, Lucide React.

## Global Constraints

- All election/candidate mutations go through `adminProcedure` (from `src/server/api/trpc.ts`, Auth phase) — never `publicProcedure`/`protectedProcedure`.
- Election status: only `"draft"` and `"closed"` are ever written by an explicit admin action (`publish`, `close`). `"upcoming"`/`"active"`/`"ended"` are derived at read time by `getEffectiveStatus`, never written except once, at `publish` time, as a one-time snapshot of "what it currently is."
- `delete` mutations on both `elections` and `candidates` must catch the Postgres FK-restrict violation (Postgres error code `23503`, since `votes.electionId`/`votes.candidateId` reference these tables with `onDelete: "restrict"`, from the Foundation-phase schema) and re-throw as `TRPCError({ code: "CONFLICT", ... })` with a friendly message — never let a raw Postgres error reach the client.
- No calendar/date-picker component is installed in this project. Use native `<Input type="datetime-local">` for `startDate`/`endDate` — do not add a new date-picker dependency.
- `shadcn`'s installed component set does NOT include `textarea` — it must be added via `pnpm dlx shadcn@latest add textarea` before it's used (Task 6 does this).
- Path alias `@/*` maps to `src/*`. File naming: kebab-case files, PascalCase components. No test framework exists in this project — every "verify" step uses `tsc --noEmit`, `pnpm build`, and live curl/browser/DB-script checks against the running dev server, never `jest`/`vitest`.
- **Git commit messages must NOT include `Co-Authored-By: Claude`, "Generated with Claude Code", or any AI-attribution trailer.**
- Zod schemas must never use `.coerce`/`.preprocess` on numeric form fields — the Auth phase hit real `zodResolver` type friction with coercion; numeric HTML inputs are handled by converting `""` ↔ `undefined` in the component's `onChange` handler instead, keeping the Zod schema as a plain `z.number().optional()`.
- `zodResolver(schema)` must always be called with no cast (no `as any`, no explicit generic) — the Auth phase fixed a workspace-wide duplicate-`zod`-version bug (`pnpm-workspace.yaml` `overrides: { zod: "^4.4.3" }`) specifically so this stays true; if a resolver type error appears, that's a regression to investigate, not a reason to add a cast.
- Any page using `useSearchParams()` (or another client-only hook requiring a Suspense boundary under Next.js's static-generation rules) must be wrapped in `<Suspense>` — the Auth phase had a real `pnpm build` failure from missing this. Verify every new page-level `pnpm build` run.

## Operational Notes

- Keep `pnpm dev` running in the background throughout; the dev server does not need restarting for this phase (no new env vars).
- To test `adminProcedure`-guarded endpoints via curl, sign in first: `curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/sign-in/email -H "Content-Type: application/json" -d '{"email":"<ADMIN_SEED_EMAIL from .env.local>","password":"<ADMIN_SEED_PASSWORD from .env.local>"}'`, then pass `-b cookies.txt` on subsequent tRPC calls. Delete `cookies.txt` when done.
- tRPC mutations (POST): body is `{"json": <input>}` (superjson envelope; plain primitives need no `meta`). tRPC queries (GET): input goes in the URL as `?input=<url-encoded JSON>`; build it safely with `node -e "console.log(encodeURIComponent(JSON.stringify({json: {...}})))"` rather than hand-encoding.
- All new admin pages live under `src/app/admin/`, which is already guarded end-to-end by the Auth phase's `src/app/admin/layout.tsx` — no new route-protection code is needed in this phase.

---

### Task 1: Zod validation schemas

**Files:**
- Create: `src/schemas/election.ts`
- Create: `src/schemas/candidate.ts`

**Interfaces:**
- Produces: `electionVisibilityValues`, `electionFieldsSchema`, `createElectionSchema`, `CreateElectionInput`, `updateElectionSchema`, `UpdateElectionInput` from `@/schemas/election`.
- Produces: `candidateStatusValues`, `socialLinksSchema`, `candidateFieldsSchema`, `createCandidateSchema`, `CreateCandidateInput`, `updateCandidateSchema`, `UpdateCandidateInput` from `@/schemas/candidate`.

- [ ] **Step 1: Write the election schema**

```ts
import { z } from "zod";

export const electionVisibilityValues = ["public", "private"] as const;

export const electionFieldsSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().max(5000).optional(),
  category: z.string().max(100).optional(),
  bannerUrl: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  visibility: z.enum(electionVisibilityValues),
  maxVotesAllowed: z.number().int().positive().optional(),
  rules: z.string().max(5000).optional(),
  instructions: z.string().max(5000).optional(),
});

function withDateOrderCheck<T extends z.ZodType<{ startDate: string; endDate: string }>>(
  schema: T
) {
  return schema.refine((data) => new Date(data.endDate) > new Date(data.startDate), {
    message: "End date must be after start date",
    path: ["endDate"],
  });
}

export const createElectionSchema = withDateOrderCheck(electionFieldsSchema);
export type CreateElectionInput = z.infer<typeof createElectionSchema>;

export const updateElectionSchema = withDateOrderCheck(
  electionFieldsSchema.extend({ id: z.uuid() })
);
export type UpdateElectionInput = z.infer<typeof updateElectionSchema>;
```

Save as `src/schemas/election.ts`.

- [ ] **Step 2: Write the candidate schema**

```ts
import { z } from "zod";

export const candidateStatusValues = ["active", "withdrawn"] as const;

export const socialLinksSchema = z.object({
  website: z.string().optional(),
  twitter: z.string().optional(),
  facebook: z.string().optional(),
  instagram: z.string().optional(),
  linkedin: z.string().optional(),
});

export const candidateFieldsSchema = z.object({
  electionId: z.uuid(),
  fullName: z.string().min(2, "Full name must be at least 2 characters").max(200),
  photoUrl: z.string().optional(),
  biography: z.string().max(5000).optional(),
  politicalParty: z.string().max(200).optional(),
  position: z.string().max(200).optional(),
  manifesto: z.string().max(5000).optional(),
  education: z.string().max(5000).optional(),
  experience: z.string().max(5000).optional(),
  campaignMessage: z.string().max(2000).optional(),
  socialLinks: socialLinksSchema.optional(),
  status: z.enum(candidateStatusValues),
});

export const createCandidateSchema = candidateFieldsSchema;
export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;

export const updateCandidateSchema = candidateFieldsSchema.extend({ id: z.uuid() });
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;
```

Save as `src/schemas/candidate.ts`.

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 4: Commit**

```bash
git add src/schemas/election.ts src/schemas/candidate.ts
git commit -m "Add election and candidate validation schemas"
```

---

### Task 2: Election status utility

**Files:**
- Create: `src/lib/election-status.ts`

**Interfaces:**
- Produces: `ElectionForStatus`, `EffectiveElectionStatus`, `getEffectiveStatus(election: ElectionForStatus, now?: Date): EffectiveElectionStatus` from `@/lib/election-status`.

- [ ] **Step 1: Write the utility**

```ts
export type ElectionForStatus = {
  status: "draft" | "upcoming" | "active" | "ended" | "closed";
  startDate: Date;
  endDate: Date;
};

export type EffectiveElectionStatus = "draft" | "upcoming" | "active" | "ended" | "closed";

/**
 * Only "draft" and "closed" ever reflect a real admin action — everything
 * else is derived from the current time against the election's own dates,
 * so a published election's displayed status never goes stale without a
 * cron job rewriting rows.
 */
export function getEffectiveStatus(
  election: ElectionForStatus,
  now: Date = new Date()
): EffectiveElectionStatus {
  if (election.status === "draft") return "draft";
  if (election.status === "closed") return "closed";

  if (now < election.startDate) return "upcoming";
  if (now > election.endDate) return "ended";
  return "active";
}
```

Save as `src/lib/election-status.ts`.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 3: Verify the logic with a scratch script**

Create a temporary file to exercise all five branches:

```ts
// scratch-verify-status.mjs (temporary, delete after use)
import { getEffectiveStatus } from "./src/lib/election-status.ts";
```

This won't run directly under plain Node (TS + path aliases). Instead verify via `tsx`:

```bash
cat > scratch-verify-status.ts << 'EOF'
import { getEffectiveStatus } from "./src/lib/election-status";

const now = new Date("2026-06-15T00:00:00.000Z");

console.log(getEffectiveStatus({ status: "draft", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") }, now)); // draft
console.log(getEffectiveStatus({ status: "closed", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") }, now)); // closed
console.log(getEffectiveStatus({ status: "upcoming", startDate: new Date("2026-07-01"), endDate: new Date("2026-12-31") }, now)); // upcoming
console.log(getEffectiveStatus({ status: "active", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") }, now)); // active
console.log(getEffectiveStatus({ status: "ended", startDate: new Date("2026-01-01"), endDate: new Date("2026-02-01") }, now)); // ended
console.log(getEffectiveStatus({ status: "closed", startDate: new Date("2026-01-01"), endDate: new Date("2099-01-01") }, now)); // closed (override wins even though endDate is in the future)
EOF
npx tsx scratch-verify-status.ts
rm scratch-verify-status.ts
```

Expected output (6 lines): `draft`, `closed`, `upcoming`, `active`, `ended`, `closed`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/election-status.ts
git commit -m "Add election effective-status computation utility"
```

---

### Task 3: Uploads tRPC router

**Files:**
- Create: `src/server/api/routers/uploads.ts`
- Modify: `src/server/api/root.ts`

**Interfaces:**
- Consumes: `getUploadSignature(folder: string)` from `@/lib/cloudinary` (Foundation phase); `adminProcedure` from `@/server/api/trpc` (Auth phase).
- Produces: `uploadsRouter` registered as `uploads` on `appRouter`, exposing `uploads.getSignature`.

- [ ] **Step 1: Write the uploads router**

```ts
import { z } from "zod";

import { createTRPCRouter, adminProcedure } from "@/server/api/trpc";
import { getUploadSignature } from "@/lib/cloudinary";

export const uploadsRouter = createTRPCRouter({
  getSignature: adminProcedure
    .input(
      z.object({
        folder: z.enum(["elections/banners", "candidates/photos"]),
      })
    )
    .query(({ input }) => {
      return getUploadSignature(input.folder);
    }),
});
```

Save as `src/server/api/routers/uploads.ts`.

- [ ] **Step 2: Register the router**

Read the current `src/server/api/root.ts` first, then add the import and registration:

```ts
import { createTRPCRouter } from "@/server/api/trpc";
import { healthRouter } from "@/server/api/routers/health";
import { uploadsRouter } from "@/server/api/routers/uploads";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  uploads: uploadsRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 4: Verify against the running dev server**

Sign in as admin and confirm the signature endpoint works and is actually guarded:

```bash
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"<ADMIN_SEED_EMAIL>","password":"<ADMIN_SEED_PASSWORD>"}' > /dev/null

INPUT=$(node -e "console.log(encodeURIComponent(JSON.stringify({json:{folder:'elections/banners'}})))")
curl -s -b cookies.txt "http://localhost:3000/api/trpc/uploads.getSignature?input=$INPUT"
```

Expected: a 200 response with `result.data.json` containing `timestamp`, `signature`, `folder: "elections/banners"`, `cloudName`, `apiKey`.

Then confirm it's actually admin-gated (not just any authenticated user) by hitting it with no cookie at all:

```bash
curl -s -i "http://localhost:3000/api/trpc/uploads.getSignature?input=$INPUT" | head -5
```

Expected: an error response (tRPC `UNAUTHORIZED`), not a signature.

Delete `cookies.txt` when done.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/uploads.ts src/server/api/root.ts
git commit -m "Add admin-guarded Cloudinary upload signature endpoint"
```

---

### Task 4: Elections tRPC router

**Files:**
- Create: `src/server/api/routers/elections.ts`
- Modify: `src/server/api/root.ts`

**Interfaces:**
- Consumes: `createElectionSchema`, `updateElectionSchema` (Task 1); `adminProcedure` (Auth phase); `elections` table from `@/server/db/schema` (Foundation phase).
- Produces: `electionsRouter` registered as `elections` on `appRouter`, exposing `elections.list`, `elections.getById`, `elections.create`, `elections.update`, `elections.publish`, `elections.close`, `elections.delete`.

- [ ] **Step 1: Write the elections router**

```ts
import { z } from "zod";
import { eq, desc, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, adminProcedure } from "@/server/api/trpc";
import { elections } from "@/server/db/schema";
import { createElectionSchema, updateElectionSchema } from "@/schemas/election";

const POSTGRES_FK_RESTRICT_CODE = "23503";

function toWriteValues(input: {
  title: string;
  description?: string;
  category?: string;
  bannerUrl?: string;
  startDate: string;
  endDate: string;
  visibility: "public" | "private";
  maxVotesAllowed?: number;
  rules?: string;
  instructions?: string;
}) {
  return {
    title: input.title,
    description: input.description || null,
    category: input.category || null,
    bannerUrl: input.bannerUrl || null,
    startDate: new Date(input.startDate),
    endDate: new Date(input.endDate),
    visibility: input.visibility,
    maxVotesAllowed: input.maxVotesAllowed ?? null,
    rules: input.rules || null,
    instructions: input.instructions || null,
  };
}

export const electionsRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.pageSize;

      const [items, totalRow] = await Promise.all([
        ctx.db.query.elections.findMany({
          orderBy: (fields, { desc }) => [desc(fields.createdAt)],
          limit: input.pageSize,
          offset,
          with: { candidates: { columns: { id: true } } },
        }),
        ctx.db.select({ total: count() }).from(elections),
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

  getById: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const election = await ctx.db.query.elections.findFirst({
        where: eq(elections.id, input.id),
      });

      if (!election) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
      }

      return election;
    }),

  create: adminProcedure.input(createElectionSchema).mutation(async ({ ctx, input }) => {
    const [election] = await ctx.db
      .insert(elections)
      .values({
        ...toWriteValues(input),
        createdBy: ctx.session.user.id,
      })
      .returning();

    return election;
  }),

  update: adminProcedure.input(updateElectionSchema).mutation(async ({ ctx, input }) => {
    const [election] = await ctx.db
      .update(elections)
      .set(toWriteValues(input))
      .where(eq(elections.id, input.id))
      .returning();

    if (!election) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
    }

    return election;
  }),

  publish: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const election = await ctx.db.query.elections.findFirst({
        where: eq(elections.id, input.id),
      });

      if (!election) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
      }

      if (election.status !== "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only draft elections can be published",
        });
      }

      const now = new Date();
      const nextStatus =
        now < election.startDate ? "upcoming" : now > election.endDate ? "ended" : "active";

      const [updated] = await ctx.db
        .update(elections)
        .set({ status: nextStatus })
        .where(eq(elections.id, input.id))
        .returning();

      return updated;
    }),

  close: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const election = await ctx.db.query.elections.findFirst({
        where: eq(elections.id, input.id),
      });

      if (!election) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
      }

      if (election.status === "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Draft elections cannot be closed — delete or publish instead",
        });
      }

      const [updated] = await ctx.db
        .update(elections)
        .set({ status: "closed" })
        .where(eq(elections.id, input.id))
        .returning();

      return updated;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const [deleted] = await ctx.db
          .delete(elections)
          .where(eq(elections.id, input.id))
          .returning();

        if (!deleted) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Election not found" });
        }

        return deleted;
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === POSTGRES_FK_RESTRICT_CODE
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Cannot delete an election that already has votes",
          });
        }
        throw error;
      }
    }),
});
```

Save as `src/server/api/routers/elections.ts`.

- [ ] **Step 2: Register the router**

In `src/server/api/root.ts`, add the import and registration (keep the `uploads` registration from Task 3):

```ts
import { createTRPCRouter } from "@/server/api/trpc";
import { healthRouter } from "@/server/api/routers/health";
import { uploadsRouter } from "@/server/api/routers/uploads";
import { electionsRouter } from "@/server/api/routers/elections";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  uploads: uploadsRouter,
  elections: electionsRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 4: Verify against the running dev server — full CRUD + lifecycle cycle**

Sign in as admin (same pattern as Task 3 Step 4), then:

```bash
# Create (dates chosen so the election is immediately "active" once published)
curl -s -b cookies.txt -X POST http://localhost:3000/api/trpc/elections.create \
  -H "Content-Type: application/json" \
  -d '{"json":{"title":"Task 4 Verify Election","visibility":"public","startDate":"2020-01-01T00:00:00.000Z","endDate":"2099-01-01T00:00:00.000Z"}}'
```

Expected: 200, `result.data.json` contains the new election with `status: "draft"`. Copy its `id` for the following calls (`$ID`).

```bash
# List — confirm it appears with candidateCount: 0
INPUT=$(node -e "console.log(encodeURIComponent(JSON.stringify({json:{page:1,pageSize:10}})))")
curl -s -b cookies.txt "http://localhost:3000/api/trpc/elections.list?input=$INPUT"
```

Expected: the created election appears in `items`, with `candidateCount: 0`.

```bash
# Publish — status should become "active" (dates span from 2020 to 2099, so "now" falls inside)
curl -s -b cookies.txt -X POST http://localhost:3000/api/trpc/elections.publish \
  -H "Content-Type: application/json" \
  -d "{\"json\":{\"id\":\"$ID\"}}"
```

Expected: 200, `status: "active"`.

```bash
# Publish again — should fail, already published
curl -s -b cookies.txt -X POST http://localhost:3000/api/trpc/elections.publish \
  -H "Content-Type: application/json" \
  -d "{\"json\":{\"id\":\"$ID\"}}"
```

Expected: error response, `BAD_REQUEST`, "Only draft elections can be published".

```bash
# Close — status should become "closed"
curl -s -b cookies.txt -X POST http://localhost:3000/api/trpc/elections.close \
  -H "Content-Type: application/json" \
  -d "{\"json\":{\"id\":\"$ID\"}}"
```

Expected: 200, `status: "closed"`.

```bash
# Delete — clean up
curl -s -b cookies.txt -X POST http://localhost:3000/api/trpc/elections.delete \
  -H "Content-Type: application/json" \
  -d "{\"json\":{\"id\":\"$ID\"}}"
```

Expected: 200, the deleted election returned. Confirm it's gone via `elections.list` again.

Delete `cookies.txt` when done.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/elections.ts src/server/api/root.ts
git commit -m "Add admin elections tRPC router with publish/close lifecycle"
```

---

### Task 5: Candidates tRPC router

**Files:**
- Create: `src/server/api/routers/candidates.ts`
- Modify: `src/server/api/root.ts`

**Interfaces:**
- Consumes: `createCandidateSchema`, `updateCandidateSchema` (Task 1); `adminProcedure` (Auth phase); `candidates` table from `@/server/db/schema` (Foundation phase).
- Produces: `candidatesRouter` registered as `candidates` on `appRouter`, exposing `candidates.list`, `candidates.getById`, `candidates.create`, `candidates.update`, `candidates.delete`.

- [ ] **Step 1: Write the candidates router**

```ts
import { z } from "zod";
import { eq, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, adminProcedure } from "@/server/api/trpc";
import { candidates } from "@/server/db/schema";
import { createCandidateSchema, updateCandidateSchema } from "@/schemas/candidate";

const POSTGRES_FK_RESTRICT_CODE = "23503";

function toWriteValues(input: {
  fullName: string;
  photoUrl?: string;
  biography?: string;
  politicalParty?: string;
  position?: string;
  manifesto?: string;
  education?: string;
  experience?: string;
  campaignMessage?: string;
  socialLinks?: Record<string, string | undefined>;
  status: "active" | "withdrawn";
}) {
  return {
    fullName: input.fullName,
    photoUrl: input.photoUrl || null,
    biography: input.biography || null,
    politicalParty: input.politicalParty || null,
    position: input.position || null,
    manifesto: input.manifesto || null,
    education: input.education || null,
    experience: input.experience || null,
    campaignMessage: input.campaignMessage || null,
    socialLinks: input.socialLinks ?? null,
    status: input.status,
  };
}

export const candidatesRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z.object({
        electionId: z.uuid(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.pageSize;

      const [items, totalRow] = await Promise.all([
        ctx.db.query.candidates.findMany({
          where: eq(candidates.electionId, input.electionId),
          orderBy: (fields, { desc }) => [desc(fields.createdAt)],
          limit: input.pageSize,
          offset,
        }),
        ctx.db
          .select({ total: count() })
          .from(candidates)
          .where(eq(candidates.electionId, input.electionId)),
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
      const candidate = await ctx.db.query.candidates.findFirst({
        where: eq(candidates.id, input.id),
      });

      if (!candidate) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found" });
      }

      return candidate;
    }),

  create: adminProcedure.input(createCandidateSchema).mutation(async ({ ctx, input }) => {
    const [candidate] = await ctx.db
      .insert(candidates)
      .values({
        electionId: input.electionId,
        ...toWriteValues(input),
      })
      .returning();

    return candidate;
  }),

  update: adminProcedure.input(updateCandidateSchema).mutation(async ({ ctx, input }) => {
    const [candidate] = await ctx.db
      .update(candidates)
      .set(toWriteValues(input))
      .where(eq(candidates.id, input.id))
      .returning();

    if (!candidate) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found" });
    }

    return candidate;
  }),

  delete: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const [deleted] = await ctx.db
          .delete(candidates)
          .where(eq(candidates.id, input.id))
          .returning();

        if (!deleted) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found" });
        }

        return deleted;
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === POSTGRES_FK_RESTRICT_CODE
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Cannot delete a candidate that already has votes",
          });
        }
        throw error;
      }
    }),
});
```

Save as `src/server/api/routers/candidates.ts`.

- [ ] **Step 2: Register the router**

In `src/server/api/root.ts`, add the import and registration (keep `uploads` and `elections` from Tasks 3–4):

```ts
import { createTRPCRouter } from "@/server/api/trpc";
import { healthRouter } from "@/server/api/routers/health";
import { uploadsRouter } from "@/server/api/routers/uploads";
import { electionsRouter } from "@/server/api/routers/elections";
import { candidatesRouter } from "@/server/api/routers/candidates";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  uploads: uploadsRouter,
  elections: electionsRouter,
  candidates: candidatesRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 4: Verify against the running dev server**

Sign in as admin, create a throwaway election to attach candidates to, then exercise the candidate CRUD:

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/trpc/elections.create \
  -H "Content-Type: application/json" \
  -d '{"json":{"title":"Task 5 Verify Election","visibility":"public","startDate":"2020-01-01T00:00:00.000Z","endDate":"2099-01-01T00:00:00.000Z"}}'
```

Copy the election `id` as `$ELECTION_ID`.

```bash
# Create a candidate
curl -s -b cookies.txt -X POST http://localhost:3000/api/trpc/candidates.create \
  -H "Content-Type: application/json" \
  -d "{\"json\":{\"electionId\":\"$ELECTION_ID\",\"fullName\":\"Task 5 Test Candidate\",\"status\":\"active\"}}"
```

Expected: 200, candidate returned with `electionId: $ELECTION_ID`, `status: "active"`. Copy its `id` as `$CANDIDATE_ID`.

```bash
# List candidates for this election
INPUT=$(node -e "console.log(encodeURIComponent(JSON.stringify({json:{electionId:'$ELECTION_ID',page:1,pageSize:20}})))")
curl -s -b cookies.txt "http://localhost:3000/api/trpc/candidates.list?input=$INPUT"
```

Expected: the created candidate appears, `total: 1`.

```bash
# Update
curl -s -b cookies.txt -X POST http://localhost:3000/api/trpc/candidates.update \
  -H "Content-Type: application/json" \
  -d "{\"json\":{\"id\":\"$CANDIDATE_ID\",\"electionId\":\"$ELECTION_ID\",\"fullName\":\"Task 5 Test Candidate (Updated)\",\"status\":\"withdrawn\"}}"
```

Expected: 200, `fullName` and `status` updated.

```bash
# Delete candidate, then delete the throwaway election
curl -s -b cookies.txt -X POST http://localhost:3000/api/trpc/candidates.delete \
  -H "Content-Type: application/json" -d "{\"json\":{\"id\":\"$CANDIDATE_ID\"}}"
curl -s -b cookies.txt -X POST http://localhost:3000/api/trpc/elections.delete \
  -H "Content-Type: application/json" -d "{\"json\":{\"id\":\"$ELECTION_ID\"}}"
```

Delete `cookies.txt` when done.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/candidates.ts src/server/api/root.ts
git commit -m "Add admin candidates tRPC router"
```

---

### Task 6: Textarea component + shared ImageUpload widget

**Files:**
- Create: `src/components/ui/textarea.tsx` (via shadcn CLI)
- Create: `src/components/shared/image-upload.tsx`

**Interfaces:**
- Consumes: `trpc` client from `@/lib/trpc/client` (Foundation phase, `uploads.getSignature` added in Task 3).
- Produces: `Textarea` from `@/components/ui/textarea`; `ImageUpload` component from `@/components/shared/image-upload`, props `{ folder: "elections/banners" | "candidates/photos"; value?: string; onChange: (url: string) => void }`.

- [ ] **Step 1: Install the Textarea component**

Run: `pnpm dlx shadcn@latest add textarea --yes`
Expected: creates `src/components/ui/textarea.tsx`. If it reports the file already exists, skip (shouldn't happen — it isn't in the current component set).

- [ ] **Step 2: Write the ImageUpload component**

```tsx
"use client"

import * as React from "react"
import { ImageIcon, Loader2, Upload, X } from "lucide-react"

import { trpc } from "@/lib/trpc/client"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

type ImageUploadProps = {
  folder: "elections/banners" | "candidates/photos"
  value?: string
  onChange: (url: string) => void
}

export function ImageUpload({ folder, value, onChange }: ImageUploadProps) {
  const utils = trpc.useUtils()
  const [isDragging, setIsDragging] = React.useState(false)
  const [isUploading, setIsUploading] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    setError(null)
    setIsUploading(true)
    setProgress(0)

    try {
      const signature = await utils.uploads.getSignature.fetch({ folder })

      const formData = new FormData()
      formData.append("file", file)
      formData.append("api_key", signature.apiKey)
      formData.append("timestamp", String(signature.timestamp))
      formData.append("signature", signature.signature)
      formData.append("folder", signature.folder)

      const url = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("POST", `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`)
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setProgress(Math.round((event.loaded / event.total) * 100))
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const response = JSON.parse(xhr.responseText) as { secure_url: string }
            resolve(response.secure_url)
          } else {
            reject(new Error("Upload failed"))
          }
        }
        xhr.onerror = () => reject(new Error("Upload failed"))
        xhr.send(formData)
      })

      onChange(url)
    } catch {
      setError("Could not upload image. Please try again.")
    } finally {
      setIsUploading(false)
    }
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file")
      return
    }
    void uploadFile(file)
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative w-full max-w-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Uploaded preview"
            className="aspect-video w-full rounded-lg border object-cover"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="absolute top-2 right-2"
            onClick={() => onChange("")}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            "flex w-full max-w-xs flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors",
            isDragging && "border-primary bg-muted",
            isUploading && "pointer-events-none opacity-70"
          )}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            handleFiles(e.dataTransfer.files)
          }}
        >
          {isUploading ? (
            <>
              <Loader2 className="text-muted-foreground size-6 animate-spin" />
              <Progress value={progress} className="w-full" />
            </>
          ) : (
            <>
              <ImageIcon className="text-muted-foreground size-6" />
              <p className="text-muted-foreground text-xs">Drag and drop an image, or</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="size-3.5" />
                Browse
              </Button>
            </>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}
```

Save as `src/components/shared/image-upload.tsx`.

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors). If `trpc.useUtils` or `.uploads.getSignature.fetch` errors, confirm Task 3's router is registered in `root.ts` and re-check the exact tRPC React Query v11 API for imperative fetches (`useUtils()` returning a per-procedure `.fetch(input)` method is the standard pattern for this tRPC version).

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/textarea.tsx src/components/shared/image-upload.tsx
git commit -m "Add Textarea component and shared Cloudinary image upload widget"
```

---

### Task 7: Election status badge component

**Files:**
- Create: `src/features/elections/components/election-status-badge.tsx`

**Interfaces:**
- Consumes: `getEffectiveStatus`, `ElectionForStatus` (Task 2).
- Produces: `ElectionStatusBadge` component from `@/features/elections/components/election-status-badge`, prop `{ election: ElectionForStatus }`.

- [ ] **Step 1: Write the badge component**

```tsx
import { Badge } from "@/components/ui/badge"
import {
  getEffectiveStatus,
  type ElectionForStatus,
  type EffectiveElectionStatus,
} from "@/lib/election-status"

const STATUS_LABELS: Record<EffectiveElectionStatus, string> = {
  draft: "Draft",
  upcoming: "Upcoming",
  active: "Active",
  ended: "Ended",
  closed: "Closed",
}

const STATUS_VARIANTS: Record<
  EffectiveElectionStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "outline",
  upcoming: "secondary",
  active: "default",
  ended: "outline",
  closed: "destructive",
}

export function ElectionStatusBadge({ election }: { election: ElectionForStatus }) {
  const status = getEffectiveStatus(election)

  return <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
}
```

Save as `src/features/elections/components/election-status-badge.tsx`.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors). If a `Badge` `variant` value errors as invalid, check `src/components/ui/badge.tsx`'s `badgeVariants` for the exact set of valid variant names and adjust `STATUS_VARIANTS` to only use ones that exist there.

- [ ] **Step 3: Commit**

```bash
git add src/features/elections/components/election-status-badge.tsx
git commit -m "Add election status badge component"
```

---

### Task 8: Election form component

**Files:**
- Create: `src/features/elections/components/election-form.tsx`

**Interfaces:**
- Consumes: `createElectionSchema`, `CreateElectionInput` (Task 1); `ImageUpload` (Task 6); `trpc` client (Foundation phase, `elections.create`/`elections.update` from Task 4).
- Produces: `ElectionForm` component from `@/features/elections/components/election-form`, props `{ election?: { id: string; title: string; description: string | null; category: string | null; bannerUrl: string | null; startDate: Date; endDate: Date; visibility: "public" | "private"; maxVotesAllowed: number | null; rules: string | null; instructions: string | null } }` (omitted = create mode).

- [ ] **Step 1: Write the election form**

```tsx
"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import {
  createElectionSchema,
  electionVisibilityValues,
  type CreateElectionInput,
} from "@/schemas/election"
import { trpc } from "@/lib/trpc/client"
import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

type ElectionFormProps = {
  election?: {
    id: string
    title: string
    description: string | null
    category: string | null
    bannerUrl: string | null
    startDate: Date
    endDate: Date
    visibility: "public" | "private"
    maxVotesAllowed: number | null
    rules: string | null
    instructions: string | null
  }
}

function toDatetimeLocal(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function ElectionForm({ election }: ElectionFormProps) {
  const router = useRouter()
  const utils = trpc.useUtils()

  const form = useForm<CreateElectionInput>({
    resolver: zodResolver(createElectionSchema),
    defaultValues: {
      title: election?.title ?? "",
      description: election?.description ?? "",
      category: election?.category ?? "",
      bannerUrl: election?.bannerUrl ?? "",
      startDate: election ? toDatetimeLocal(election.startDate) : "",
      endDate: election ? toDatetimeLocal(election.endDate) : "",
      visibility: election?.visibility ?? "public",
      maxVotesAllowed: election?.maxVotesAllowed ?? undefined,
      rules: election?.rules ?? "",
      instructions: election?.instructions ?? "",
    },
  })

  const createMutation = trpc.elections.create.useMutation({
    onSuccess: async (created) => {
      await utils.elections.list.invalidate()
      toast.success("Election created")
      router.push(`/admin/elections/${created.id}`)
    },
    onError: (error) => toast.error(error.message),
  })

  const updateMutation = trpc.elections.update.useMutation({
    onSuccess: async () => {
      await utils.elections.list.invalidate()
      if (election) await utils.elections.getById.invalidate({ id: election.id })
      toast.success("Election updated")
    },
    onError: (error) => toast.error(error.message),
  })

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  function onSubmit(values: CreateElectionInput) {
    if (election) {
      updateMutation.mutate({ ...values, id: election.id })
    } else {
      createMutation.mutate(values)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bannerUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Banner image</FormLabel>
              <FormControl>
                <ImageUpload
                  folder="elections/banners"
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start date</FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End date</FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="visibility"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Visibility</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select visibility" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {electionVisibilityValues.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value === "public" ? "Public" : "Private"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="maxVotesAllowed"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Max votes allowed (optional)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="rules"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Rules</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="instructions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Instructions</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : election ? "Save changes" : "Create election"}
        </Button>
      </form>
    </Form>
  )
}
```

Save as `src/features/elections/components/election-form.tsx`.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors). If `Select`'s `value`/`onValueChange` props error, check `src/components/ui/select.tsx`'s `Select` export (`SelectPrimitive.Root`) for its actual prop names and adjust — Base UI's Select root is expected to mirror this common `value`/`onValueChange` convention, but confirm against the installed version's type definitions if it doesn't typecheck.

- [ ] **Step 3: Commit**

```bash
git add src/features/elections/components/election-form.tsx
git commit -m "Add election create/edit form"
```

---

### Task 9: Elections list page

**Files:**
- Create: `src/features/elections/components/elections-table.tsx`
- Create: `src/app/admin/elections/page.tsx`

**Interfaces:**
- Consumes: `trpc.elections.list` (Task 4); `ElectionStatusBadge` (Task 7); `trpc.elections.delete` (Task 4).
- Produces: `ElectionsTable` component from `@/features/elections/components/elections-table`.

- [ ] **Step 1: Write the elections table**

```tsx
"use client"

import * as React from "react"
import Link from "next/link"
import { MoreHorizontal } from "lucide-react"
import { toast } from "sonner"

import { trpc } from "@/lib/trpc/client"
import { ElectionStatusBadge } from "./election-status-badge"
import { Button } from "@/components/ui/button"
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

export function ElectionsTable() {
  const [page, setPage] = React.useState(1)
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null)
  const pageSize = 10

  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.elections.list.useQuery({ page, pageSize })

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

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading elections…</p>
  }

  if (!data || data.items.length === 0) {
    return <p className="text-muted-foreground text-sm">No elections yet.</p>
  }

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize))

  return (
    <div className="space-y-4">
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
                <Link href={`/admin/elections/${election.id}`} className="font-medium hover:underline">
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
                      <DropdownMenuItem onClick={() => publishMutation.mutate({ id: election.id })}>
                        Publish
                      </DropdownMenuItem>
                    )}
                    {election.status !== "draft" && election.status !== "closed" && (
                      <DropdownMenuItem onClick={() => closeMutation.mutate({ id: election.id })}>
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
                className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <Dialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete election?</DialogTitle>
            <DialogDescription>
              This permanently deletes the election and all of its candidates. This cannot be undone.
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

Save as `src/features/elections/components/elections-table.tsx`.

`DropdownMenuItem`'s `variant="destructive"` prop (used on the Delete item above) is confirmed to exist on the installed component (`src/components/ui/dropdown-menu.tsx`, `variant?: "default" | "destructive"`).

- [ ] **Step 2: Write the elections list page**

```tsx
import Link from "next/link"
import { Plus } from "lucide-react"

import { ElectionsTable } from "@/features/elections/components/elections-table"
import { Button } from "@/components/ui/button"

export default function AdminElectionsPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Elections</h1>
        <Button render={<Link href="/admin/elections/new" />}>
          <Plus className="size-4" />
          New Election
        </Button>
      </div>
      <ElectionsTable />
    </div>
  )
}
```

Save as `src/app/admin/elections/page.tsx`.

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 4: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds, `/admin/elections` appears in the route table.

- [ ] **Step 5: Verify in the browser**

Log in as admin (`ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD`), navigate to `http://localhost:3000/admin/elections`. Confirm the page loads, shows "No elections yet." if empty (or the list if Task 4/5's verification data wasn't fully cleaned up), and the "New Election" button links to `/admin/elections/new` (404 is fine at this point — that page doesn't exist until Task 10).

- [ ] **Step 6: Commit**

```bash
git add src/features/elections/components/elections-table.tsx src/app/admin/elections/page.tsx
git commit -m "Add admin elections list page"
```

---

### Task 10: Election create and edit pages

**Files:**
- Create: `src/app/admin/elections/new/page.tsx`
- Create: `src/app/admin/elections/[electionId]/page.tsx`

**Interfaces:**
- Consumes: `ElectionForm` (Task 8); `trpc.elections.getById` (Task 4); `ElectionsTable`'s sibling pattern for candidates — this task adds a nested `CandidatesTable` placeholder reference that Task 12 will fill in; for now, render candidates management as a simple "Manage candidates" link to a route Task 12 completes, not an inline table yet, to avoid this task depending on Task 12's not-yet-written component.
- Produces: working `/admin/elections/new` and `/admin/elections/[electionId]` routes.

- [ ] **Step 1: Write the create page**

```tsx
import { ElectionForm } from "@/features/elections/components/election-form"

export default function NewElectionPage() {
  return (
    <div className="max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">New election</h1>
      <ElectionForm />
    </div>
  )
}
```

Save as `src/app/admin/elections/new/page.tsx`.

- [ ] **Step 2: Write a server-side election fetch helper used by the edit page**

This page needs the election server-side (to redirect on not-found and to pass typed defaults into the client form). Since there's no existing server-callable helper for a single election outside the tRPC router, call the router's server-side caller directly via `db` — simplest is a direct Drizzle query, matching the pattern of other server components in this codebase that use `db` directly (e.g. none yet do this for a single row by param, so introduce it plainly):

```tsx
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"

import { db } from "@/server/db"
import { elections } from "@/server/db/schema"
import { ElectionForm } from "@/features/elections/components/election-form"
import { ElectionStatusBadge } from "@/features/elections/components/election-status-badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function EditElectionPage({
  params,
}: {
  params: Promise<{ electionId: string }>
}) {
  const { electionId } = await params

  const election = await db.query.elections.findFirst({
    where: eq(elections.id, electionId),
  })

  if (!election) {
    notFound()
  }

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{election.title}</h1>
          <ElectionStatusBadge election={election} />
        </div>
        <Button
          variant="outline"
          render={<Link href={`/admin/elections/${election.id}/candidates/new`} />}
        >
          Manage candidates
        </Button>
      </div>
      <ElectionForm election={election} />
    </div>
  )
}
```

Save as `src/app/admin/elections/[electionId]/page.tsx`.

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 4: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds, `/admin/elections/new` and `/admin/elections/[electionId]` both appear in the route table.

- [ ] **Step 5: Verify in the browser — full create/edit/publish/close/delete cycle**

Log in as admin. Navigate to `/admin/elections/new`, fill in a title, start/end dates (pick dates that span "now" so it becomes active), visibility, submit. Confirm redirect to `/admin/elections/[id]` and the form is pre-filled with what you entered. Change the title, save, confirm the toast and that the title updates. Go back to `/admin/elections`, use the row menu to Publish it, confirm the badge changes to "Active". Use the row menu to Close it, confirm the badge changes to "Closed". Delete it via the row menu's confirmation dialog, confirm it disappears from the list.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/elections/new/page.tsx "src/app/admin/elections/[electionId]/page.tsx"
git commit -m "Add election create and edit pages"
```

---

### Task 11: Candidate form component

**Files:**
- Create: `src/features/candidates/components/candidate-form.tsx`

**Interfaces:**
- Consumes: `createCandidateSchema`, `CreateCandidateInput`, `candidateStatusValues` (Task 1); `ImageUpload` (Task 6); `trpc.candidates.create`/`trpc.candidates.update` (Task 5).
- Produces: `CandidateForm` component from `@/features/candidates/components/candidate-form`, props `{ electionId: string; candidate?: { id: string; fullName: string; photoUrl: string | null; biography: string | null; politicalParty: string | null; position: string | null; manifesto: string | null; education: string | null; experience: string | null; campaignMessage: string | null; socialLinks: { website?: string; twitter?: string; facebook?: string; instagram?: string; linkedin?: string } | null; status: "active" | "withdrawn" } }`.

- [ ] **Step 1: Write the candidate form**

```tsx
"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import {
  createCandidateSchema,
  candidateStatusValues,
  type CreateCandidateInput,
} from "@/schemas/candidate"
import { trpc } from "@/lib/trpc/client"
import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

type CandidateFormProps = {
  electionId: string
  candidate?: {
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
}

export function CandidateForm({ electionId, candidate }: CandidateFormProps) {
  const router = useRouter()
  const utils = trpc.useUtils()

  const form = useForm<CreateCandidateInput>({
    resolver: zodResolver(createCandidateSchema),
    defaultValues: {
      electionId,
      fullName: candidate?.fullName ?? "",
      photoUrl: candidate?.photoUrl ?? "",
      biography: candidate?.biography ?? "",
      politicalParty: candidate?.politicalParty ?? "",
      position: candidate?.position ?? "",
      manifesto: candidate?.manifesto ?? "",
      education: candidate?.education ?? "",
      experience: candidate?.experience ?? "",
      campaignMessage: candidate?.campaignMessage ?? "",
      socialLinks: {
        website: candidate?.socialLinks?.website ?? "",
        twitter: candidate?.socialLinks?.twitter ?? "",
        facebook: candidate?.socialLinks?.facebook ?? "",
        instagram: candidate?.socialLinks?.instagram ?? "",
        linkedin: candidate?.socialLinks?.linkedin ?? "",
      },
      status: candidate?.status ?? "active",
    },
  })

  const createMutation = trpc.candidates.create.useMutation({
    onSuccess: async () => {
      await utils.candidates.list.invalidate({ electionId })
      toast.success("Candidate created")
      router.push(`/admin/elections/${electionId}`)
    },
    onError: (error) => toast.error(error.message),
  })

  const updateMutation = trpc.candidates.update.useMutation({
    onSuccess: async () => {
      await utils.candidates.list.invalidate({ electionId })
      if (candidate) await utils.candidates.getById.invalidate({ id: candidate.id })
      toast.success("Candidate updated")
    },
    onError: (error) => toast.error(error.message),
  })

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  function onSubmit(values: CreateCandidateInput) {
    if (candidate) {
      updateMutation.mutate({ ...values, id: candidate.id })
    } else {
      createMutation.mutate(values)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="photoUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Photo</FormLabel>
              <FormControl>
                <ImageUpload
                  folder="candidates/photos"
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="politicalParty"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Political party</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="position"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Position running for</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="biography"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Biography</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="manifesto"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Manifesto</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="education"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Education</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="experience"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Experience</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="campaignMessage"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Campaign message</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="socialLinks.website"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Website</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="socialLinks.twitter"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Twitter</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="socialLinks.facebook"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Facebook</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="socialLinks.instagram"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Instagram</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="socialLinks.linkedin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>LinkedIn</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {candidateStatusValues.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value === "active" ? "Active" : "Withdrawn"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : candidate ? "Save changes" : "Add candidate"}
        </Button>
      </form>
    </Form>
  )
}
```

Save as `src/features/candidates/components/candidate-form.tsx`.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 3: Commit**

```bash
git add src/features/candidates/components/candidate-form.tsx
git commit -m "Add candidate create/edit form"
```

---

### Task 12: Candidates table + candidate create/edit pages

**Files:**
- Create: `src/features/candidates/components/candidates-table.tsx`
- Create: `src/app/admin/elections/[electionId]/candidates/new/page.tsx`
- Create: `src/app/admin/elections/[electionId]/candidates/[candidateId]/page.tsx`
- Modify: `src/app/admin/elections/[electionId]/page.tsx`

**Interfaces:**
- Consumes: `trpc.candidates.list`/`trpc.candidates.delete` (Task 5); `CandidateForm` (Task 11).
- Produces: candidates fully manageable from within an election's detail page.

- [ ] **Step 1: Write the candidates table**

```tsx
"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { trpc } from "@/lib/trpc/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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

  return (
    <div className="space-y-4">
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
          {data.items.map((candidate) => (
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

      <Dialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
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

Save as `src/features/candidates/components/candidates-table.tsx`.

- [ ] **Step 2: Write the candidate create page**

```tsx
import { CandidateForm } from "@/features/candidates/components/candidate-form"

export default async function NewCandidatePage({
  params,
}: {
  params: Promise<{ electionId: string }>
}) {
  const { electionId } = await params

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">New candidate</h1>
      <CandidateForm electionId={electionId} />
    </div>
  )
}
```

Save as `src/app/admin/elections/[electionId]/candidates/new/page.tsx`.

- [ ] **Step 3: Write the candidate edit page**

```tsx
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"

import { db } from "@/server/db"
import { candidates } from "@/server/db/schema"
import { CandidateForm } from "@/features/candidates/components/candidate-form"

export default async function EditCandidatePage({
  params,
}: {
  params: Promise<{ electionId: string; candidateId: string }>
}) {
  const { electionId, candidateId } = await params

  const candidate = await db.query.candidates.findFirst({
    where: eq(candidates.id, candidateId),
  })

  if (!candidate || candidate.electionId !== electionId) {
    notFound()
  }

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{candidate.fullName}</h1>
      <CandidateForm electionId={electionId} candidate={candidate} />
    </div>
  )
}
```

Save as `src/app/admin/elections/[electionId]/candidates/[candidateId]/page.tsx`.

- [ ] **Step 4: Wire the candidates table into the election detail page**

Read the current `src/app/admin/elections/[electionId]/page.tsx` (written in Task 10) first, then replace its "Manage candidates" button-only section with the actual embedded table. Replace the full file:

```tsx
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import Link from "next/link"
import { Plus } from "lucide-react"

import { db } from "@/server/db"
import { elections } from "@/server/db/schema"
import { ElectionForm } from "@/features/elections/components/election-form"
import { ElectionStatusBadge } from "@/features/elections/components/election-status-badge"
import { CandidatesTable } from "@/features/candidates/components/candidates-table"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

export default async function EditElectionPage({
  params,
}: {
  params: Promise<{ electionId: string }>
}) {
  const { electionId } = await params

  const election = await db.query.elections.findFirst({
    where: eq(elections.id, electionId),
  })

  if (!election) {
    notFound()
  }

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{election.title}</h1>
        <ElectionStatusBadge election={election} />
      </div>
      <ElectionForm election={election} />

      <Separator />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Candidates</h2>
        <Button
          size="sm"
          render={<Link href={`/admin/elections/${election.id}/candidates/new`} />}
        >
          <Plus className="size-4" />
          Add candidate
        </Button>
      </div>
      <CandidatesTable electionId={election.id} />
    </div>
  )
}
```

- [ ] **Step 5: Verify it compiles**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no output (zero errors).

- [ ] **Step 6: Verify with a full production build**

Run: `pnpm build`
Expected: succeeds, `/admin/elections/[electionId]/candidates/new` and `/admin/elections/[electionId]/candidates/[candidateId]` both appear in the route table.

- [ ] **Step 7: Verify in the browser — full candidate lifecycle**

Log in as admin, open an election's detail page (create one if needed), click "Add candidate", fill in the form (including a photo upload and a couple of social links), submit. Confirm redirect back to the election page and the new candidate appears in the table. Click the candidate's name/Edit, change a field, save, confirm the update. Delete the candidate via the table's delete button + confirmation dialog, confirm it disappears.

- [ ] **Step 8: Commit**

```bash
git add src/features/candidates/components/candidates-table.tsx \
  "src/app/admin/elections/[electionId]/candidates" \
  "src/app/admin/elections/[electionId]/page.tsx"
git commit -m "Add candidates table and candidate create/edit pages"
```

---

### Task 13: Full end-to-end verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full production build**

Run: `pnpm build`
Expected: `Compiled successfully`, zero TypeScript errors, route table includes `/admin/elections`, `/admin/elections/new`, `/admin/elections/[electionId]`, `/admin/elections/[electionId]/candidates/new`, `/admin/elections/[electionId]/candidates/[candidateId]`, alongside every route from the Foundation and Auth phases.

- [ ] **Step 2: Full lifecycle browser walkthrough**

Log in as admin. Create a new election with a banner image, start date in the past and end date in the future (so it'll read "Active" once published). Add two candidates to it, each with a photo and a couple of filled-in fields. Publish the election — confirm the status badge updates correctly across the list page and the detail page. Edit the election's title and one candidate's bio — confirm both save correctly. Close the election — confirm the badge shows "Closed" instead of the date-computed status even though the end date hasn't passed. Delete one candidate, then delete the whole election (which cascades to the remaining candidate, per the Foundation-phase schema's `onDelete: "cascade"` on `candidates.electionId`) — confirm both are gone from their respective list views.

- [ ] **Step 3: Confirm admin-only enforcement still holds**

While logged out (or logged in as a voter, if one exists — otherwise just logged out), attempt `curl -i http://localhost:3000/admin/elections` — confirm the existing Auth-phase guard redirects it exactly as it already does for `/admin/dashboard` (this phase added no new route-protection code, so this should already work; verify it does).

- [ ] **Step 4: Confirm delete-with-votes handling is at least present (can't fully exercise — no voting yet)**

Run: `pnpm exec tsc --noEmit -p tsconfig.json` — confirm the `TRPCError({ code: "CONFLICT", ... })` catch blocks in both `elections.delete` and `candidates.delete` type-check correctly. Read both files and confirm the Postgres error-code check (`23503`) is present in both — this is the mechanism that will protect against deleting an election/candidate with real votes once Phase 4 exists; it can't be triggered for real yet since no votes exist.

- [ ] **Step 5: Git and secrets check**

Run: `git status` — expect a clean tree (everything already committed).
Run: `git ls-files | grep -i "\.env"` — expect only `.env.example`.

- [ ] **Step 6: Final commit (only if cleanup left anything uncommitted)**

If `git status` shows anything (e.g. leftover scratch files), clean up and commit. Otherwise, no commit needed — the phase is complete.
