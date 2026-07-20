# Voter Election Browsing & Voting (Phase 4A) — Design

## Context

This is Phase 4A of the Online Voting System, following Foundation, Auth, and Admin: Elections & Candidates. The original 5-phase breakdown grouped "Voting flow + Results" into a single Phase 4, but that phase's scope (voter browsing + vote casting + voting history, AND results computation + charts + admin publish/export) is comparable to or larger than either of the previous two phases, which each ran ~13 tasks. Per the user's decision, this is split into 4A (voting) and 4B (results), each with its own design → plan → build → verify cycle. 4B can begin once 4A is complete and reviewed.

This phase implements: voters browsing public elections, viewing election details and candidate profiles, casting exactly one vote per election with full server-side validation, seeing an inline vote confirmation, and reviewing their own voting history.

It does **not** implement: vote tallying, results display, winner determination, turnout stats, charts, or admin publish/hide/export of results (all Phase 4B). It does not implement the polished, widget-rich voter dashboard (activity feeds, notifications, quick-vote shortcuts) — that's Phase 5, per the original breakdown. The voter dashboard here gets only enough real content to not be a dead end.

## Decisions Locked In

- **Voting is single-choice only.** The `votes` table (Foundation phase) has a unique constraint on `(electionId, userId)` — one vote row per voter per election, period. `maxVotesAllowed` cannot mean "pick up to N candidates" without a schema change, which is out of scope. It remains an informational/capacity field, not enforced by any logic in this phase.
- **Private elections are hidden from voters entirely.** No invite/allowlist system exists. `visibility: "private"` elections never appear in voter browsing and are not votable via direct URL either (server-side `NOT_FOUND`, not just a hidden link).
- **Candidate profiles are a `Dialog`, not a dedicated route** — opened from the election detail page, showing full bio/manifesto/education/experience/campaign message/social links.
- **Vote confirmation is inline on the election detail page**, not a separate route — once voted, the page shows a "You voted for X" card instead of the voting form.
- **Navigation is minimal**, not a full dashboard rebuild — a small shared header on `voter/layout.tsx` (Elections / My Votes links) is enough to make the new pages reachable.

## Data Layer

**New tRPC router** `src/server/api/routers/voting.ts`, registered as `voting`, all procedures on `protectedProcedure`:

- `listElections` — public, non-draft elections only, each with `getEffectiveStatus` (reused from Phase 3's `@/lib/election-status`) computed server-side so the client can group into Active / Upcoming / Past without reimplementing status logic.
- `getElection` — election + candidates (all statuses returned, but only `status: "active"` candidates are selectable in the vote form) + whether this voter has already voted and for whom. `NOT_FOUND` for private or draft elections.
- `castVote({ electionId, candidateId })` — the integrity-critical mutation:
  1. Re-fetches the election server-side; rejects unless `visibility === "public"` and `getEffectiveStatus(election) === "active"` at the moment of the call — never trusts a client-supplied status.
  2. Re-fetches the candidate; rejects unless it belongs to the given election and `status === "active"`.
  3. Pre-checks for an existing vote and returns a friendly `TRPCError({ code: "CONFLICT" })` ("You've already voted in this election") — then still catches the database's own unique-constraint violation (Postgres `23505`) on insert as a race-condition backstop. The real guarantee is the DB constraint; the pre-check is only for a nicer error message in the common case.
  4. Writes `userId` from the session, `ipAddress` extracted server-side from request headers, `deviceInfo` from the raw `User-Agent` header, `votedAt` defaulting server-side. None of these are client-supplied.
- `myVotes` — this voter's own vote history (election title, candidate name, timestamp), unpaginated (a personal list, realistically small).

**No update or delete procedure exists anywhere in this router** — "votes cannot be edited or deleted" is enforced by the absence of any code path that could do either, not just a UI restriction.

**New utility** `src/lib/request-info.ts`: `getClientIp(headers: Headers): string | null`, reading `x-forwarded-for`/`x-real-ip`. Device info uses the raw `User-Agent` header value directly — no parsing library, since both fields are explicitly optional in the original spec.

## Voter UI

**Routes:**
- `voter/elections` — public, non-draft elections grouped Active / Upcoming / Past
- `voter/elections/[electionId]` — banner, description, rules/instructions, candidate cards with a "View full profile" Dialog trigger each; a single-select voting form if active and not yet voted; an inline "You voted for X" card if already voted; read-only if not currently active
- `voter/votes` — voting history table
- `voter/dashboard` — light real content (counts + links into the above), keeps the existing `LogoutButton`

**Navigation:** `voter/layout.tsx` (Auth phase) gains a small shared header (logo, Elections / My Votes links, theme toggle, logout).

## Out of Scope (explicitly deferred)

Vote tallying, results display, charts, winner/turnout computation, admin publish/hide/export of results (Phase 4B). Rich dashboard widgets, notifications, activity feed, search/filters, user management, profile editing (Phase 5).

## Verification

- As a voter, browse `voter/elections`, confirm only public non-draft elections appear, correctly grouped by computed status.
- Open an election detail page; confirm candidate cards render and "View full profile" opens the correct candidate's full info in a Dialog.
- Vote in an active election; confirm the vote is recorded (election/candidate/user/timestamp/IP/device), the page immediately shows the "You voted for X" confirmation without a reload, and attempting to vote again (e.g., via a replayed request) is rejected.
- Confirm a private election is fully unreachable — not in the list, and a direct URL to its detail page returns not-found.
- Confirm an election that isn't currently active (upcoming, ended, or admin-closed) shows no voting form.
- Confirm `voter/votes` shows the vote just cast.
- `pnpm build` passes with zero TypeScript errors and all new routes listed.
