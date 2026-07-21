# Notifications & Admin User Management (Phase 5B) — Design

## Context

This is Phase 5B, the second and final half of the original Phase 5 scope ("Dashboards, notifications, search/filters, user management, profile"), split from Phase 5A ("Dashboards, Profile & Search/Filters", complete) for size. It covers the two areas that needed genuinely new subsystems rather than extending existing pages: notifications (the `notifications` table has existed unused since Foundation) and admin user management (no UI or router exists at all for this today — an admin can currently only see users indirectly, e.g. via the Phase 5A dashboard's voter count).

It builds on all six prior phases (Foundation, Auth, Admin: Elections & Candidates, Voter Voting, Election Results, Dashboards/Profile/Search).

## Decisions Locked In

- **User management does NOT adopt Better Auth's built-in admin plugin.** Investigated during brainstorming: the plugin's ban system uses new `banned`/`banReason`/`banExpires` fields entirely separate from this app's existing `status: "active"|"suspended"` enum, which is already checked throughout `middleware.ts`, both role layouts, and every `protectedProcedure`/`adminProcedure` across five prior phases. Adopting the plugin would mean either running two parallel suspension systems or rewiring every existing access check — high risk, no real benefit over a focused hand-rolled router matching the codebase's established pattern (`elections.ts`/`candidates.ts`: `adminProcedure`, Zod input schemas, direct Drizzle queries).
- **User management is genuinely server-paginated from the start** (unlike Phase 5A's client-side-filtered lists) — the `user` table will typically have more rows than `elections`, so `users.list` follows the same server-side search/filter architecture Phase 5A built for the admin elections table (`ilike` on name/email, status filter, applied to both the paginated query and its `count()`).
- **Two safety guards on `suspend`/`setRole`**: an admin cannot act on their own account (prevents accidental self-lockout), and no action may leave the system with zero active admins (a `count()` check against `role: "admin", status: "active"` before allowing a demotion or suspension that would remove the last one).
- **Voting-history view shows which elections a user voted in, never their candidate choice** — the same ballot-secrecy principle already established for the Phase 5A admin activity feed (vote-cast log entries there also omit candidate identity).
- **Notification trigger scope is deliberately narrow for v1**: only `elections.publishResults` fans out notifications, one row per voter who has a vote in that election. No notification on election creation/publish, no admin-side notifications (the Phase 5A admin dashboard's activity feed already covers admin's "what happened" needs).
- **Hiding results does not retract already-sent notifications.** They're treated as an immutable historical record, matching the Phase 5A activity log's design. If a voter later clicks through to a hidden-again election's results, they see the existing, already-correct "nothing published" state — a minor, accepted edge case.

## Admin User Management

**Data layer**: new `src/server/api/routers/users.ts` (`adminProcedure` throughout):
- `list({ page, pageSize, search?, status?, role? })` — server-side `ilike` on `name`/`email`, `status`/`role` equality filters, applied to both the paginated `findMany` and its `count()`, returning `{ items, total, page, pageSize }` (identical shape to `elections.list`).
- `getById({ id })` — the user row plus their voting history: `votes` joined to `elections` for `{ electionId, electionTitle, votedAt }`, no candidate reference.
- `suspend({ id })` / `activate({ id })` — toggle `status`. `suspend` throws `BAD_REQUEST` if `id === ctx.session.user.id` (self-action) or if the target is the last active admin (`role: "admin", status: "active"` count would hit 0).
- `setRole({ id, role })` — same two guards as `suspend` apply when demoting an admin to voter (self-action and last-admin checks); promoting a voter to admin has no guard needed.

**UI**: `/admin/users/page.tsx` — table (name, email, role badge, status badge, actions dropdown: suspend/activate, promote/demote with a confirmation dialog for role changes given the higher stakes) with a search input + role/status `Select`s above it, same visual pattern as Phase 5A's admin elections table. `/admin/users/[userId]/page.tsx` — profile summary + a list of elections voted in (title + date) + the same suspend/promote actions. `AdminNav` gains a "Users" link.

## Notifications

**Data layer**:
- `src/server/api/routers/notifications.ts` (`protectedProcedure` throughout, scoped to `ctx.session.user.id`):
  - `list()` — the caller's notifications, newest-first, plus an `unreadCount`.
  - `markRead({ id })` — sets `isRead: true` on one notification owned by the caller (ownership-checked, `NOT_FOUND` if it belongs to someone else).
  - `markAllRead()` — bulk-updates all the caller's unread notifications.
- Fan-out trigger added to the existing `elections.publishResults` mutation (Phase 4B): after toggling `resultsPublished`, `SELECT DISTINCT userId FROM votes WHERE electionId = X`, then bulk-insert one `notifications` row per distinct voter (`type: "results_published"`, `title`, `message`, `metadata: { electionId }`).

**UI**:
- `NotificationBell` component in `VoterNav` — bell icon with an unread-count badge, a dropdown listing recent notifications (title, relative time, unread visually distinguished), a "Mark all as read" action, and each item links to `/voter/elections/[electionId]` and marks itself read on click.
- `/voter/notifications/page.tsx` — full history beyond the dropdown's recent slice, same mark-read interactions.

## Out of Scope

Admin-side notifications, notification triggers beyond results-published, retracting notifications when results are hidden again, email/push notification delivery (in-app only).

## Verification

- Admin: create several users (via registration + one promoted to admin), confirm `users.list` search/filter/pagination all work correctly against real data; confirm suspend/activate correctly gates the affected voter's access (already-existing `status` check in middleware/layouts/tRPC, unchanged — just now toggleable from a UI); confirm the two safety guards (can't self-suspend/self-demote, can't remove the last active admin) both actually block with a clear error, not just in theory.
- Admin: view a user's detail page, confirm their voting history lists the correct elections with no candidate information anywhere in the response or UI.
- Notifications: as admin, publish results for an election with 2+ voters; confirm each of those voters (and only those voters) gets exactly one notification. Confirm the bell's unread count updates, the dropdown shows it, marking it read clears the badge, "mark all as read" works, the full notifications page shows history beyond the dropdown.
- Confirm hiding results again doesn't delete/retract the notification, and clicking through to that election afterward shows the existing (already correct) no-results state.
- `pnpm build` passes with zero TypeScript errors and the new routes present.
