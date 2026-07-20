# Election Results (Phase 4B) — Design

## Context

This is Phase 4B of the Online Voting System, completing the original phase-4 scope ("Voting flow + Results") that was split into 4A (voting, complete) and 4B (this phase) due to size. It builds on Foundation (the `elections.resultsPublished` field has existed unused since then), Auth, Admin: Elections & Candidates, and Voter Voting.

This phase implements: automatic vote tallying, candidate rankings with percentages, winner determination (including ties), turnout calculation, chart/progress-bar/stat-card display, and admin control over publishing/hiding/exporting results.

It does **not** implement: notifications, search/filters, user management, dashboard polish, or profile editing (all Phase 5).

## Decisions Locked In

- **Charting library**: shadcn's chart component (Recharts under the hood) is added as a new dependency — an addition to the approved tech stack, not a replacement, same precedent as Cloudinary/Resend in the Foundation phase.
- **Turnout** = (votes cast in this election) ÷ (total active voters registered system-wide) × 100. There's no per-election voter roster, so this is a system-wide participation rate, not scoped eligibility.
- **Export** is CSV only, via a dedicated Route Handler (not tRPC, since file downloads need real `Content-Disposition` headers).
- **Voter-visible results** live on the existing election detail page (`/voter/elections/[electionId]`) — no new route.
- **Ties**: all candidates sharing the top vote count are marked as winners; no arbitrary tie-breaking.
- **Publish/hide is independent of election status** — an admin can publish live/interim results while an election is still active, or after it ends/closes; it's entirely their call.

## Data Layer

**`src/server/results.ts`**: `computeElectionResults(db, electionId)` — fetches the election and its candidates, aggregates vote counts per candidate via `GROUP BY`, computes per-candidate percentage (0 if `totalVotes === 0`, no divide-by-zero), ranks by vote count, marks winner(s) (all ties at the top), and computes turnout against a system-wide active-voter count (`role: "voter"`, `status: "active"` — admins are excluded from the denominator; if that count is `0`, turnout is `0`, not a divide-by-zero error). Returns one shape shared by both consumers below.

**tRPC additions:**
- `elections.getResults` (admin router, `adminProcedure`) — always computed, regardless of `resultsPublished`, so admins can monitor before deciding to publish.
- `elections.publishResults` / `elections.hideResults` (admin router, `adminProcedure`) — toggle `resultsPublished`.
- `voting.getResults` (voting router, `protectedProcedure`) — returns `{ published: false }` (no error) if not published, else `{ published: true, results }`.

**Export**: `GET /api/admin/elections/[electionId]/export` — a Route Handler, admin-gated via `getServerSession()`, streams a CSV (candidate, votes, percentage, rank).

## UI

**Shared presentational component** `src/features/results/components/results-panel.tsx`: stat cards (Total Votes, Turnout %, Winner), a Recharts bar chart (vote share), and a ranked candidate list with progress bars and winner badges. Takes computed results as props — no data fetching of its own.

**Admin**: new "Results" section on `admin/elections/[electionId]/page.tsx`, always showing live data, plus a Publish/Hide toggle and an "Export CSV" link.

**Voter**: new "Results" section on `voter/elections/[electionId]/page.tsx`, rendered only when `voting.getResults` reports `published: true` — otherwise nothing appears (no "not published yet" clutter). Coexists with the existing vote form/confirmation, doesn't replace them.

## Out of Scope (explicitly deferred)

Notifications, search/filters, user management, dashboard widget polish, profile editing (Phase 5).

## Verification

- As admin, view an election's Results section with zero votes — confirm graceful zero-state (no crash, no NaN percentages, no winner shown).
- Cast a few votes across candidates as different voters; confirm admin's live results update, percentages sum to 100%, ranking is correct, winner badge on the top candidate.
- Create a tie at the top; confirm both tied candidates show the winner badge.
- Publish results as admin; confirm the voter-facing election page now shows the Results section with matching data.
- Hide results; confirm the voter-facing section disappears again.
- Export CSV as admin; confirm the file downloads with correct headers and data.
- Confirm a non-admin cannot reach the export endpoint or call `publishResults`/`hideResults`/see un-published results via `voting.getResults`.
- `pnpm build` passes with zero TypeScript errors and all new routes listed.
