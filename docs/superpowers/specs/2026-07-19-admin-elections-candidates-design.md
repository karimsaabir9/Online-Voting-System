# Admin: Elections & Candidates Management — Design

## Context

This is Phase 3 of the Online Voting System, following Foundation (project scaffold, full DB schema, tRPC wiring) and Auth (registration, login, session management, role-based route protection, admin seeding). The `elections` and `candidates` tables, and the `adminProcedure`/`protectedProcedure` tRPC guards, already exist from those phases.

This phase implements admin-only CRUD for elections and candidates: creating, editing, publishing, closing, and deleting elections; creating, editing, and deleting candidates within an election; and a signed direct-to-Cloudinary image upload flow for election banners and candidate photos.

It does **not** implement: voter-facing election/candidate browsing, the actual voting flow, results, or results publishing (all Phase 4 — voting and viewing elections are tightly coupled, so they belong together); search/filter UI, notifications, or user management (Phase 5, per the original phase breakdown).

## Decisions Locked In

- **Status lifecycle:** `draft → Publish → auto`. New elections start `draft` (hidden, not votable). Admin explicitly **Publishes** a draft election, after which the displayed status (`upcoming`/`active`/`ended`) is always computed from `startDate`/`endDate` — no manual date-status transitions. Admin can still manually **Close** a published election early, which overrides date computation and ends it immediately. `draft` and `closed` are the only two states ever written by an explicit admin action; `upcoming`/`active`/`ended` are derived at read time.
- **Image uploads:** a real drag-and-drop widget, signed direct-to-Cloudinary upload (not a URL-paste field), using the Foundation phase's `getUploadSignature` helper via a new `uploads.getSignature` tRPC procedure.
- **Search/filters:** explicitly deferred to Phase 5. This phase's tables get basic column sorting and pagination only.

## Data Layer

**Status computation** (`src/lib/election-status.ts`): a pure function `getEffectiveStatus(election: { status, startDate, endDate }): "draft" | "upcoming" | "active" | "ended" | "closed"`:
- stored `status === "draft"` → `"draft"`
- stored `status === "closed"` → `"closed"` (admin override wins over dates)
- otherwise → compare `now` against `startDate`/`endDate`: before start → `"upcoming"`, within range → `"active"`, after end → `"ended"`

Used both server-side (list/filter queries, if needed) and client-side (status badges), so it lives in `src/lib` rather than `src/server`.

**Validation** (`src/schemas/election.ts`, `src/schemas/candidate.ts`): Zod schemas shared between tRPC routers (server) and React Hook Form (client) — same pattern as `src/schemas/auth.ts` from the Auth phase. Election schema validates `endDate > startDate`. Candidate schema validates social link fields as optional URLs.

**tRPC routers**, both built on `adminProcedure` (Auth phase, `src/server/api/trpc.ts`):
- `src/server/api/routers/elections.ts` — `create`, `update`, `delete`, `publish` (draft only; sets the stored `status` to `"upcoming"`, `"active"`, or `"ended"` based on comparing `now` to the election's own `startDate`/`endDate` at the moment of publishing — a one-time date comparison, not a call to `getEffectiveStatus`, since that function's job is deriving *display* status from an already-published election, not deciding what to write on publish), `close` (any non-draft status → `closed`), `list` (all elections, any status, admin's own view — paginated), `getById`
- `src/server/api/routers/candidates.ts` — `create`, `update`, `delete`, `list` (by `electionId`, paginated), `getById`
- `src/server/api/routers/uploads.ts` — `getSignature({ folder: string })`, thin wrapper around `getUploadSignature` from `@/lib/cloudinary`
- All three registered in `src/server/api/root.ts`
- `delete` mutations catch the Postgres FK-restrict violation (votes reference `elections`/`candidates` with `onDelete: restrict`, from the Foundation schema) and re-throw as a `TRPCError` with a friendly "can't delete — this has votes" message. This path can't actually trigger yet (no votes exist until Phase 4), but the handling is cheap to add now and avoids a raw DB error leaking to the client once Phase 4 ships.

## Admin UI

**Routes** (under `src/app/admin/`, already guarded by the Auth phase's `admin/layout.tsx`):
- `admin/elections` — table: title, status badge, start/end dates, candidate count, actions; pagination; "New Election" button
- `admin/elections/new` — create form
- `admin/elections/[electionId]` — edit form + nested candidates table for that election, with Publish/Close/Delete actions on the election itself
- `admin/elections/[electionId]/candidates/new` — create candidate (scoped to the election in the URL)
- `admin/elections/[electionId]/candidates/[candidateId]` — edit candidate

**Components:**
- `src/features/elections/components/election-form.tsx` — single form reused for create/edit: title, description, category, banner upload, start/end date pickers, max votes allowed, visibility (public/private), rules, instructions
- `src/features/elections/components/election-status-badge.tsx` — colored `Badge` driven by `getEffectiveStatus`
- `src/features/elections/components/elections-table.tsx`
- `src/features/candidates/components/candidate-form.tsx` — full name, photo upload, biography, political party, position, manifesto, education, experience, campaign message, social links (website/twitter/facebook/instagram/linkedin), status (active/withdrawn)
- `src/features/candidates/components/candidates-table.tsx`
- `src/components/shared/image-upload.tsx` — reusable drag-and-drop widget shared by both forms

**Upload flow:** client calls `uploads.getSignature` → gets a signed Cloudinary token → `POST`s the file directly to Cloudinary from the browser (plain `fetch` + `FormData`, no new dependency) → sets the returned `secure_url` on the form field. The Cloudinary API secret never reaches the client.

**Table actions:** row-level `DropdownMenu` (Edit / Publish [draft rows] / Close [live rows] / Delete). Delete opens a confirmation `Dialog` before mutating. Every mutation gives success/error feedback via the existing `sonner` Toaster.

## Out of Scope (explicitly deferred)

Voter-facing election/candidate browsing, voting, results, results publishing (Phase 4). Search/filter UI, notifications, user management, profile editing (Phase 5).

## Verification

- Create a draft election → confirm it does NOT appear as votable/active anywhere (no voter surface exists yet, but confirm its status badge reads "Draft" and `getEffectiveStatus` returns `"draft"` regardless of its dates).
- Publish it → confirm the badge now reflects the correct computed status based on its start/end dates (test with dates in the past/present/future to hit all three of upcoming/active/ended).
- Manually Close a published election → confirm the badge shows "Closed" even if `endDate` is in the future (override wins).
- Create, edit, and delete a candidate scoped to an election; confirm the candidates table updates.
- Upload a banner image on an election and a photo on a candidate; confirm the preview and final saved `bannerUrl`/`photoUrl` are correct Cloudinary URLs.
- Attempt to access any `admin/elections/*` route as a logged-in voter (or logged out) — confirm the existing Auth phase guard blocks it exactly as it already does for `/admin/dashboard`.
- `pnpm build` passes with zero TypeScript errors and all new routes listed.
