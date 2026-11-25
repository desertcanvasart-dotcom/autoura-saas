# Traveller Memory — plan

2026-11-25 · Status: PLAN ONLY — nothing built, nothing approved.

## What it is

A **Traveller Card** on each client: preferences, occasions, complaints and intents, assembled from what the client has said in the inbox, WhatsApp and the website concierge. Every fact links back to the message it came from. Staff see it on the client page and, later, inside the copilot. It suggests; it never sends anything by itself.

## What we already have (checked 2026-11-25)

- **Messages:** 1,432 in `unified_messages` since September (email 955, WhatsApp 477). Travel2Egypt holds 933; Sillage only 45.
- **Linking:** `unified_conversations.client_id` exists, but only 76 of 173 Travel2Egypt conversations are linked. Sillage 5 of 19; the other companies almost none.
- **Reusable pieces:** `client_preferences` (14 rows), `client_notes` (133), `client_followups`, `agent_memory` (3 rows, with a nightly cron endpoint), the copilot's conversation assembly (`lib/copilot-suggest.ts`), the Anthropic client with retries and timeouts, the Railway cron pattern, and `publish_enquiries` (website form: page, dates, party, message).
- **Sell and Operate** need no change for the first version.

## Decisions to settle before any code

| # | Decision | Recommendation |
|---|---|---|
| D1 | Pilot company | Travel2Egypt (volume), not Sillage |
| D2 | Extend `agent_memory` / `client_preferences`, or new tables | New `card_fact` table (the one genuinely new piece); keep `client_preferences` as the structured summary staff already use |
| D3 | Sensitive facts (health, mobility, religion) | Store only what the client states about diet and mobility needs for the trip; never infer; show them marked sensitive |
| D4 | Staff confirmation | Facts start "unconfirmed"; nothing feeds outreach or copilot drafts until staff confirm or the tenant opts in |
| D5 | Privacy | Update the privacy page (AI processing, Anthropic as processor); per-client delete and export; retention period; per-company on/off switch |
| D6 | Languages | English, Spanish, Japanese; store the fact in English with the original quote |
| D7 | Models and cost | Cheapest model that passes the accuracy check on real messages; budget alarm per company |

## Phases

**Phase 0 — Linking (2–3 days).** Without a client there is no card. Link WhatsApp numbers and email addresses to clients automatically, and show the unlinked conversations so staff can link them. Measure: share of Travel2Egypt conversations linked, before and after.

**Phase 1 — Read-only card (6–9 days).**
- Migration: `card_fact` (client, text, category, channel, source message, confidence, status unconfirmed/confirmed/rejected, extracted_at); per-company scoping like every table.
- Nightly job (Railway cron, same pattern as the others) extracts facts from new messages and from website enquiries.
- "Traveller" tab on the client page: facts with source links, confirm / reject, a visible "last updated" date, and a visible failure notice when the job could not run.
- Delete and export per client; privacy text.
- Tune on 100+ real Travel2Egypt messages before turning it on for staff. Pass mark agreed first (suggested: 9 in 10 shown facts correct).

**Phase 2 — Prompts (1.5–2 weeks).**
- Rules, no AI: quote open and silent for N days; a returning client enquires again; an enquiry about a page they asked about before.
- AI: an occasion mentioned in passing (anniversary, birthday).
- Shown in the copilot as a suggestion next to a draft, with accept / dismiss; dismissals are kept to improve it.

**Phase 3 — Later.** Backfill older history; a demand report once volume justifies it (today ~130 messages a week across all companies is too thin); marketing feed; per-company switch for other tenants.

## Risks and how the plan answers them

| Risk | Answer |
|---|---|
| Few conversations linked to clients | Phase 0 comes first and is measured |
| Wrong fact on a client card | Source link and confidence on every fact; unconfirmed by default (D4); pass mark before launch |
| Job fails silently (as the concierge did 4 Oct–12 Nov) | "Last updated" on the card; failure alert; run log |
| Sensitive data, EU travellers | D3 and D5 settled before building |
| Instructions hidden in a customer message | Message text passed to the model as quoted data; output only ever shown to staff, never sent |
| Cross-company leakage | Company scoping on every new table; tests that prove it |
| Scope creep into a CRM rebuild | Read-only until Phase 2; nothing writes to rates, quotes or itineraries |

## Effort (estimate, with Claude building)

Phase 0 2–3 days · Phase 1 6–9 days · Phase 2 1.5–2 weeks. First staff-visible card in about 2–3 weeks elapsed. AI cost is small (a few dollars to process what exists, cents a week after); measured during Phase 1, not assumed.

## Out of scope

Automatic sends, writing to Sell/Operate, inferring sensitive traits, the demand report, and a public client-facing view of the card.

## Next step

Settle D1–D7, then start with Phase 0 on a branch.
