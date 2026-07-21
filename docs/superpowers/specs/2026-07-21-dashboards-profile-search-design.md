# Dashboards, Profile & Search/Filters (Phase 5A) — Design

## Context

This is Phase 5A of the Online Voting System, the first half of the original Phase 5 scope ("Dashboards, notifications, search/filters, user management, profile"), split for size the same way Phase 4 split into 4A/4B. This phase covers the pieces that extend existing pages and data with no new subsystem of their own: profile editing, richer admin/voter dashboards, and search/filters on existing lists. Phase 5B (notifications, admin user management) follows separately.

It builds on all five prior phases (Foundation, Auth, Admin: Elections & Candidates, Voter Voting, Election Results). Currently: `/settings` only has password change; both dashboards are placeholder shells (a greeting and two nav cards); the `activity_logs` table has existed unused since Foundation; election/candidate lists have no search or filtering.

## Decisions Locked In

- **Profile editing** (name, avatar, email) goes through Better Auth's built-in `updateUser`/`changeEmail` client methods directly — no new tRPC procedures. Verified against the installed `better-auth@1.6.23` source: `updateUser` respects `additionalFields` `input: false` on `role`/`status`, so it cannot be used to self-elevate; `changeEmail` (once enabled in config) sends a confirmation link to the user's **current** email address (not the new one) before the change takes effect, reusing the existing `/verify-email` token-verification flow and `emailVerification.sendVerificationEmail` infrastructure already built in the Auth phase.
- **Dashboards** are each backed by one new bundled tRPC query (`elections.dashboardStats` for admin, `voting.dashboard` for voter) rather than several small queries, to avoid a waterfall of round trips for a single page.
- **Recent activity feed** (admin dashboard) reads from the existing `activity_logs` table. This phase adds write-instrumentation to existing mutations: election create/publish/close/delete, candidate create/delete (not update — field edits are too noisy to be a meaningful feed entry), and vote cast. Vote-cast entries are logged with `userId: null` and no candidate information, to avoid exposing ballot secrecy through the admin activity feed — the entry only says a vote was cast in a named election, not by whom or for which candidate.
- **Search/filters are client-side for the two unpaginated lists** (voter elections list, admin candidates table) — both already fetch their complete list in one query, so filtering the already-fetched data in the browser needs no query changes. **The admin elections table filters server-side** instead: `elections.list` already paginates (`limit`/`offset` server-side), so client-side filtering would only ever filter within the current 10-item page. `elections.list` gains optional `search`/`status` input params instead, applied to both the `findMany` and the `count()` query so pagination totals stay correct.
- **"Recently published results" ordering** (voter dashboard) uses the election row's existing `updatedAt` timestamp as a proxy for "when results were published" — there's no dedicated `publishedAt` column, and `updatedAt` already auto-bumps whenever `resultsPublished` is toggled (via Drizzle's `$onUpdate`).

## Profile Editing

Extends `/settings` (currently one card: change password) with two more cards:

- **Name & Avatar**: a form calling `authClient.updateUser({ name, image })`. Avatar upload reuses the existing `ImageUpload` component and `uploads.getSignature` tRPC procedure (Cloudinary signed upload, built in the Admin phase for candidate photos/election banners).
- **Email Address**: a form calling `authClient.changeEmail({ newEmail })`. Requires adding `user.changeEmail.enabled: true` and a `sendChangeEmailConfirmation` handler to `src/server/auth/config.ts` (same shape as the existing `sendResetPassword` handler), plus one new Resend email template. The confirmation email goes to the user's current address; the UI shows a "check your current email to confirm" message after submitting, not an immediate change.

`useSession()` (already used elsewhere for nav/session display) needs to reflect updated name/image without a full page reload — Better Auth's client hook already re-syncs on mutation, matching how the existing session-dependent UI (nav, dashboards) behaves.

## Admin Dashboard

New `elections.dashboardStats` (adminProcedure, query, no input), returning:

```
{
  totalElections: number,
  activeElections: number,       // via getEffectiveStatus over all elections
  totalVotesCast: number,
  totalVoters: number,           // user rows with role: "voter"
  endingSoon: { id, title, endDate }[],        // effectively active, endDate within 48h
  resultsNotPublished: { id, title, status }[], // effectively ended/closed, resultsPublished: false
  recentActivity: { id, action, description, createdAt }[], // latest 10 from activity_logs
}
```

UI: four stat cards at the top (Total Elections, Active Elections, Total Votes Cast, Total Voters), a "Needs Attention" section listing ending-soon and unpublished-results elections as clickable rows (linking to the election detail page), and a Recent Activity list below.

## Voter Dashboard

New `voting.dashboard` (protectedProcedure, query, no input), returning:

```
{
  openElections: { id, title, endDate }[],  // active, public, non-draft, not yet voted in
  votedCount: number,
  recentPublishedResults: { id, title }[],  // voted-in elections with resultsPublished: true, ordered by updatedAt desc, limit 5
}
```

UI: the existing two nav cards (Elections, My Votes) stay, with a new highlighted "Open for voting" list above them (falls back to the current empty-ish layout if nothing is open), a small stat ("You've voted in N elections"), and a "Recently published results" list linking straight to each election's results section.

## Search/Filters

Added identically to three existing components, all client-side:

- **Admin elections table** (`elections-table.tsx`): search input (title, case-insensitive substring) + status `Select` (All / Draft / Upcoming / Active / Ended / Closed, matching `getEffectiveStatus`'s values), passed as `elections.list` query params (server-side `ilike` on title; status derived server-side with the same date-comparison logic `getEffectiveStatus` uses, since "upcoming"/"active"/"ended" aren't stored columns). Changing a filter resets to page 1.
- **Voter elections list**: same pattern, status options limited to what voters can see (Upcoming / Active / Ended / Closed — no Draft, since `listElections` already excludes drafts entirely).
- **Admin candidates table** (`candidates-table.tsx`): search input by candidate full name, scoped to the current election's candidate list.

No new tRPC procedures or parameters — all three already fetch their full (small) list; filtering happens over the already-fetched data.

## Out of Scope (Phase 5B)

Notifications (new table already exists, unused — full CRUD, bell/dropdown UI, mark-as-read, event triggers) and admin user management (list/suspend/activate/promote voters — Better Auth ships a built-in admin plugin with `listUsers`/`banUser`/`setRole` that Phase 5B should evaluate using instead of a hand-rolled router).

## Verification

- Profile: change name/avatar, confirm it reflects immediately in nav/session-dependent UI without a manual refresh. Request an email change, confirm the email arrives at the *old* address (not the new one), confirm clicking it updates the session's email and the old address no longer works for login.
- Admin dashboard: stat cards match real counts (cross-check via direct queries); an election ending within 48h appears in "Needs Attention"; an ended election with unpublished results appears there too; recent activity shows election/candidate lifecycle events and anonymized vote-cast entries in the correct order, newest first.
- Voter dashboard: an active un-voted election appears in "Open for voting"; after voting, it disappears and the voted count increments; after an admin publishes results for a voted-in election, it appears in "Recently published results."
- Search/filters: typing a partial title narrows all three lists correctly (case-insensitive); combining search + status filter narrows further; clearing filters restores the full list; admin elections table pagination resets to page 1 on filter change.
- `pnpm build` passes with zero TypeScript errors and all routes intact.
