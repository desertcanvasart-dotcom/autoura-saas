# Activity Summary — Feature Spec

**Status:** Draft for review · 2026-08-01
**Origin:** A tenant asked whether they can check that remote staff are "actually working." This spec is the defensible version of that request: output-based activity, openly visible, never covert.

## Problem

Owners and managers of remote teams want to know whether staff are engaged during the workday. The raw ask ("are they sitting in front of the app?") is unanswerable by a web app and unwise to approximate with surveillance. What Autoura *can* answer credibly:

1. **Presence** — when was this person last active in the app, and roughly how much focused time did they spend today?
2. **Output** — what did they actually produce today/this week (tasks done, itineraries built, replies sent)?

## Principles (product commitments, not implementation details)

- **Transparent by design.** Members can always see their own summary — the same numbers their manager sees. The feature is documented in the public docs. No covert tracking, ever.
- **Output over presence.** Presence time is context; work counts are the headline. Low app time is explicitly NOT presented as "not working" (staff legitimately work off-app: phone calls, supplier visits).
- **Tenant-gated.** Off by default; a tenant admin enables it in Organization settings (`tenant_features.activity_summary_enabled`). Enabling shows an in-app notice to members ("Activity summaries are on for this workspace").
- **App-scoped only.** No OS idle detection, screenshots, webcams, or off-tab signals — technically impossible in a web app and out of bounds regardless.

## What already exists (shipped 2026-08-01)

- `auth.users.last_sign_in_at` surfaced as **Last login** on User Management (PR #157).
- `user_profiles.last_seen_at` (mig 266) stamped by a 5-minute heartbeat — **Last seen**.
- `team_members.user_id` link to auth users (migs 264/265) — lets the staff directory join presence and per-user work data.

## Design

### 1. Focused-time tracking (heartbeat v2)

Today's heartbeat fires every 5 min while a tab is open — it cannot distinguish "tab in background all day" from real use.

- Client (`AuthContext`): before each beat, check `document.visibilityState === 'visible'` AND any input event (keydown/pointerdown/scroll) in the last 5 minutes. Send `{ focused: boolean }`; skip the beat entirely when the tab is hidden *and* idle (keeps `last_seen_at` honest too).
- Server (`POST /api/profiles/heartbeat`): still stamps `last_seen_at`; when `focused`, also increments the daily rollup.

### 2. Data model — daily rollup, no event log

One row per user per tenant per day (UTC), no unbounded ping table:

```sql
-- migration 267 (draft)
CREATE TABLE user_activity_daily (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  active_minutes INT NOT NULL DEFAULT 0,   -- += 5 per focused heartbeat
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, user_id, day)
);
-- RLS: members read own rows; admin/manager read tenant rows; writes via service role only.
```

`active_minutes` is an estimate (±5 min granularity) and is labeled as such in the UI ("~3h 25m focused time").

### 3. Work metrics — two honest phases

Attribution audit of the current schema:

| Metric | Source | Attributable today? |
|---|---|---|
| Tasks completed | `tasks.assigned_to` (team_members) + `completed_at` | ✅ via team_members.user_id link |
| Itineraries created/edited | `itineraries.user_id` | ✅ |
| Copilot drafts reviewed/sent | Copilot Analytics' existing per-user source | ✅ reuse, don't duplicate |
| Focused time / last seen | heartbeat v2 + rollup | ✅ |
| Outbound messages sent (WhatsApp/email) | `unified_messages` has direction/channel but **no sender user** | ❌ Phase 2: add `sent_by UUID` to outbound insert paths |
| Quotes created | `b2c_quotes` has **no creator column** | ❌ Phase 2: add `created_by UUID` |
| Invoices issued | `invoices` has **no creator column** | ❌ Phase 2: add `created_by UUID` |

**Phase 1 ships with the ✅ rows only.** Phase 2 columns are additive migrations + a one-line change at each insert site; counts start from the day they land (no retroactive attribution — say so in the UI rather than fake it).

### 4. API

`GET /api/team-members/[id]/activity?range=today|7d|30d` (admin/manager, or self via user_id match):

```json
{
  "presence": { "last_login_at": "…", "last_seen_at": "…",
                "days": [{ "day": "2026-08-01", "active_minutes": 205 }] },
  "output":   { "tasks_completed": 4, "itineraries_touched": 2,
                "copilot_reviewed": 11, "copilot_sent": 7 },
  "unattributed_note": "Messages, quotes, and invoices are not yet per-user attributed."
}
```

### 5. UI

- **Team Members directory** (the natural home — it's the "people you assign work to" surface, and now links to logins): an **Activity** tab/panel on each member card showing last login, last seen, a 7-day focused-time bar, and the output counts. Members without a login (`user_id IS NULL`) show output-only where attributable (tasks via assignee).
- **Self view**: the member's own numbers on their profile page.
- Explicit footnote in both places: *"Activity reflects work inside Autoura only. Phone calls, meetings, and off-app work are not captured."*

### 6. Docs & rollout

1. Migration 267 (rollup table) → apply → `npm run types:generate`.
2. Heartbeat v2 (focus detection + rollup write) — backward compatible.
3. Activity API + Team Members UI behind `activity_summary_enabled` (default off; toggle in Organization settings; enabling requires ticking "my team has been informed").
4. Public docs: new section on the Team & Settings page; note in Getting Started.
5. Phase 2 attribution columns (`sent_by`, `created_by`) as a follow-up PR once Phase 1 proves out.

## Non-goals

Logout stamps (see mig 266 header), screenshots/keystrokes/webcam, off-tab idle detection, productivity scores/rankings, covert operation of any kind.

## Open questions for review

1. Should managers see focused-time, or only admins? (Proposal: same visibility as the rest of the directory — admin/manager.)
2. Timezone for "day" buckets: UTC (simple) vs tenant timezone (accurate)? Proposal: tenant timezone from settings, falling back to UTC.
3. Retention: keep daily rollups forever (tiny rows) or prune at 12 months? Proposal: keep 12 months.
4. Does the "team has been informed" checkbox suffice, or should enabling trigger an in-app notification to every member? Proposal: do both — checkbox + notification.
