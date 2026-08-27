# Productization plan — porting the reference implementation's advances

**Prepared:** 2026-08-27, at the end of the travel-ops-pro finishing campaign (PRs #226–#245).
**Purpose:** THIS repo is the product. `travel-ops-pro` (same workspace) is the
operating agency's system and the reference implementation — features prove
themselves there, then port here as designs. This file is self-contained.
**Step 0 (the golden-snapshot referee) landed with this document.**

---

## 1. The decision and the goal

- **The product is the sibling** (`~/whatsapp_to_quote/autoura-saas-work`,
  remote `desertcanvasart-dotcom/autoura-saas`): a multi-tenant SaaS — any agency,
  any destination, monthly subscription per account.
- **travel-ops-pro stays the operating agency's system and the reference
  implementation.** Features prove themselves there first, then port here as designs.
  No SaaS infrastructure (billing/tenancy) gets built in travel-ops-pro.
- **Operator's answers to the open questions (2026-08-27):**
  1. Self-hosted licensing = **support contract** → build NO entitlement/license-key code.
  2. Global destination catalog = **self-serve** (tenants add countries/cities themselves).
  3. Sibling is **live on Railway with 6 tenants created, ALL EMPTY** → pre-launch
     data-wise; schema restructuring is safe; keep the 6 tenant rows.
  4. First market = **Middle East & Africa** → catalog seeding priority Egypt, Jordan,
     Morocco, UAE, Kenya, Tanzania…; flag (not scope) an eventual **Arabic/RTL UI**.

## 2. Verified facts about the sibling (re-verified 2026-08-27 against origin/main)

⚠️ First lesson, learned the hard way: **the local clone was 128 commits behind and the
first inspection was wrong because of it. ALWAYS `git fetch && git pull` before
inspecting anything.** After pulling (last commit 2026-08-25, active development):

**Has (confirmed):**
- `tenant_id` on every rate table, suppliers, tour_templates, content_library,
  writing_rules, itineraries (checked in `types/database.types.ts`).
- Full Stripe stack: `lib/stripe.ts` (tenants → stripe customers), trials
  (`TRIAL_DAYS` in `lib/pricing-config`), onboarding fee, plans sync;
  `app/api/billing/{create-checkout-session,create-portal-session,webhook,invoices,subscription,usage}`.
- Usage enforcement: `lib/usage-enforcement.ts` (+ usage-limits/grace/window) —
  structural + volume limits, grace bands, fail-open telemetry, 402 convention.
- `/signup`, public `(public)/pricing`, super-admin tenant console
  (`app/super-admin`, `app/api/super-admin/tenants`).
- Per-tenant branding: tenants carry logo_url, colors, timezone, date_format, currency.
- **Its own traveller↔office messaging**: `trip_messages` (migration
  `291_trip_messages.sql`, "the two-way thread between traveller and office") +
  trip channel integration (292). This exists — do NOT port travel-ops-pro's portal
  chat wholesale.
- Healthy test suite: **1545 tests, 94 files, all passing** (`npm test`).
- Deployment: Railway web + two cron services (`railway.cron-exchange-rates.toml`,
  `railway.cron-agent-memory.toml`). Read `docs/CRON-JOBS.md` before touching cron.

**Lacks (confirmed absent from its DB types and code):**
- `rate_currency` anywhere; `fx_frozen`; any destination vocabulary
  (`destination_cities`, `generation_brief` absent). Its `destinations` table is
  per-tenant label rows (tenant_id, destination_name, slug, country).
- Prompts are Egypt-hardcoded: `lib/constants/egypt-cities.ts`, `EGYPT_TRAVEL_GLOSSARY`
  in `lib/ai/prompt-builder.ts`, "Create a N-day Egypt itinerary."

**Drift (measured 2026-08-27):** of files sharing a path between the repos,
`lib/`: 68 of 71 diverged; `app/api/`: 237 of 239 diverged.
**Consequence: every port is a DESIGN PORT — re-implement against the sibling's schema
and conventions using travel-ops-pro's shipped code as the specification. NEVER
cherry-pick commits; they will not apply.**

## 3. Sibling repo conventions (follow these, not travel-ops-pro's)

- Migrations: `supabase/migrations/NNN_name.sql`, sequential (last: 293), applied BY
  HAND in the Supabase SQL editor, then recorded in `schema_migrations`. A test
  enforces that this is the only migration directory.
- After schema changes: regenerate `types/database.types.ts` (repo has a scripted
  pattern — see recent commits like "regenerate db types after applying migration 272").
- CI (`.github/workflows/ci.yml`): `npm ci` → `npm test` (vitest) →
  `npm run lint:ratchet` → `npx next typegen`. Keep the lint RATCHET green — it fails
  on any increase.
- Tests live in top-level `__tests__/` and per-area `app/api/__tests__/`.
- Env: Supabase, Stripe, Twilio/Meta (`WHATSAPP_PROVIDER` switch), Resend, Gmail,
  Anthropic + OpenAI.

## 4. Working rules that made the reference campaign safe (apply all of them)

1. **Golden-snapshot referee before refactoring generation or pricing**: extract the
   prompt template into a pure exported function (byte-identical move, verified by
   direct template text comparison against git HEAD), pin with `toMatchSnapshot()`,
   THEN change things under green snapshots. This is Step 0 below.
2. **Deploy-order safety**: every schema-coupled code change must work with the
   migration applied OR not, in either order. Concretely: `select('*')` instead of
   naming new columns in selects; write payloads include a new column
   only-when-present; readers treat absent column as the old default.
   (The one violation of this rule in the reference campaign — naming `rate_currency`
   in a CSV-export select — broke prod export until fixed. See travel-ops-pro #241/#242.)
3. **Gated merges**: never `gh pr checks --watch | tail` (pipes swallow the exit
   code — this merged a red PR once). Pattern:
   `gh pr checks N --watch >/dev/null 2>&1; if [ $? -eq 0 ]; then gh pr merge N --squash --delete-branch; else echo REFUSED; fi`
4. **Test migrations in PGlite before the operator applies them**: prod-shape fixture
   (create the real tables the migration touches, with a seeded row), run the SQL
   twice (idempotency), probe constraints. Supabase-only roles (`authenticated`,
   `service_role`) must be created in the fixture first.
5. **Verify UI work with writes intercepted** (Playwright `page.route` fulfilling the
   POST/PUT) so nothing touches a live database. Intercept EVERY route family the
   form might call — a transportation form once saved through `/api/resources/...`
   while `/api/rates/...` was being intercepted, causing an unintended prod write.
6. **Branch from a freshly pulled main. Every time.** Stale-base mistakes happened
   three times in the reference campaign.
7. Never assume a table name is free: probe the live DB before `CREATE TABLE`
   (a legacy `destinations` table collision broke a migration once).

## 5. Step 0 — the referee PR (start here)

Branch: `chore/generation-golden-snapshots`. Scope, measured against current main
(`lib/ai/prompt-builder.ts`, 373 lines):

- Two inline templates:
  - structured: lines **53–191** (`const prompt = \`You are a DATA CONVERTER…` →
    `NOW CONVERT THE ITINERARY TO JSON:\``). Interpolants: `EGYPT_TRAVEL_GLOSSARY,
    dayMappingSection, expectedDays, language, packageType, rawItinerary, tier, totalPax`.
  - creative: lines **287–344** (`const prompt = \`Create a ${durationDays}-day Egypt
    itinerary.` → `…Set includes_hotel to false on the last day.\``). Interpolants:
    `EGYPT_TRAVEL_GLOSSARY, TIER_DESCRIPTIONS, attractionNames, cities, clientName,
    contentContext, durationDays, includeAccommodation, includeDinner, includeLunch,
    interests, language, numAdults, numChildren, specialRequests, startDate, tier,
    tourName, writingContext`.
- Extract each into exported pure `buildStructuredPrompt(input)` /
  `buildCreativePrompt(input)`; generate functions call them. Prove byte-identity by
  comparing the moved template text against `git show HEAD:lib/ai/prompt-builder.ts`
  (normalize only the `const prompt = \`` → `return \`` wrapper line).
- Add `__tests__/prompt-builder-golden.test.ts` with fixed synthetic inputs and
  `toMatchSnapshot()` for both prompts. (Reference implementation to copy from:
  travel-ops-pro `__tests__/lib/ai/prompt-builder-golden.test.ts`.)
- Land the productization plan into the sibling's `docs/` (source:
  travel-ops-pro `docs/plans/sibling-productization.md`, post-#245 version with the
  operator's answers and corrections).
- CI green (including the lint ratchet), gated merge.

## 6. The ports, in order

Reference file paths below are in **travel-ops-pro** — the specification. Re-verify
each "sibling has/lacks" claim at port time; the repo moves.

### P1 — Global destination catalog + per-tenant selection  (size M)
Goal: shared catalog (countries, cities, coordinates, aliases/IATA, JA labels) +
per-tenant selection & voice. Egypt seeded from travel-ops-pro's data.
- Spec: `migrations/20260827_destinations.sql` (catalog shape + Egypt's 44-city seed
  with coordinates and JA labels — copy the seed VALUES), `app/components/useDestinationCities.ts`
  (session-cached hook w/ fallback), `app/settings/destinations/page.tsx` +
  `app/api/destinations{,/manage}` (self-serve UI incl. brief/glossary editors,
  city-name collision warning, aliases input).
- Sibling design decisions: catalog tables are GLOBAL (no tenant_id); a join table
  `tenant_destinations` (tenant_id, destination_id, generation_brief, glossary) carries
  per-tenant selection and voice — two agencies selling Egypt write differently.
  Migrate its existing per-tenant `destinations` label rows onto catalog entries by
  country; keep slugs. Its 6 tenants are empty, so this is low-risk.
- Self-serve per operator answer #2. Seed the catalog with MEA countries beyond Egypt
  as empty shells (names only) to make onboarding demos instant.

### P2 — Destination-parameterised generation  (size M; requires Step 0 + P1)
Goal: prompts follow the tenant's destination; Egypt output byte-identical.
- Spec: `lib/ai/destination-context.ts` (`DestinationPromptContext`: name, glossary,
  shorthandLine, constraintLines, brief, defaultCity, hasCruises;
  `egyptPromptContext()` reproduces current framing VERBATIM; loader never throws —
  fallback is Egypt), the parameterised `lib/ai/prompt-builder.ts`, and the gating of
  cruise detection on `hasCruises` in the generate route.
- Under the Step-0 snapshots: they must not change for the Egypt/default path.
- Also port: tour-matcher merging destination city names+aliases into its keyword map;
  WhatsApp parser merging city codes from catalog aliases/airport_codes.

### P3 — Per-rate currency  (size M–L; independent of P1/P2)
Goal: every rate row can carry its own currency; engine converts at the fetch
boundary; totals never silently mix currencies.
- Spec: `lib/rates/rate-currency.ts` (createRateNormalizer: per-table monetary-column
  map READ FROM THE REAL SCHEMA — do the same against the sibling's tables, never
  infer from names; JSONB shapes like activity tiers/seasons converted too; unbackable
  conversion neutralises to NULL = existing missing-rate hole, never a 50× number),
  `app/components/RateCurrencyField.tsx` + `rateCurrencyPatch` (key included
  only-when-present = deploy-order safety), migrations `20260827_rate_currency*.sql`
  (nullable + CHECK, NO backfill).
- Sibling gotchas: its rate tables are tenant-scoped — the normalizer doesn't care,
  but the FORMS and API routes are its own; audit every form's REAL save route
  (the reference campaign found one form saving through an unexpected route family,
  silently dropping the field). Re-verify its seasons shape first —
  `lib/rates/rate-seasons.ts` does NOT exist there; its "seasons" may differ or be absent.
- FX plumbing prerequisite: it has an exchange-rates cron already; find its
  currency-service equivalent and adapt `getExchangeRate` cross-pair logic if absent.

### P4 — FX freeze at approval + logged re-price  (size M; requires P3)
- Spec: `lib/itinerary-fx.ts` (FrozenFx snapshot {base, rates, frozen_at, frozen_by,
  source}; `computeFxReprice` PURE — restates lines from `supplier_cost_original` ×
  new rate; client price NEVER moves; unconvertible lines keep yesterday's value),
  freeze-once-at-first-confirm in the itinerary status transition,
  `POST /api/itineraries/[id]/reprice-fx` (admin/manager, explicit, logged).
- Sibling prerequisite: find ITS approval moment (its booking/confirm flow may differ)
  and whether `itinerary_services` there carries supplier_currency /
  supplier_cost_original / exchange_rate_used — port those columns first if absent.

### P5 — Messaging reconcile (NOT a port)  (size S–M)
The sibling has `trip_messages` (291/292). Inspect its flow, then port only what the
reference adds: the **notify-outcome model** — a six-value reason
(`sent | no-account | no-recipient | no-link | no-booking | failed`) instead of a bare
boolean, surfaced in every reply UI (spec: `lib/portal/chat-reply.ts`), and unified-
inbox channel treatment if its conversations page lacks it.

### P6 — Fix crop where UIs overlap  (size S each, opportunistic)
From travel-ops-pro #226–#242, where the sibling shares the pattern: departments
blocked-pill feedback; inbox channel-tab overflow; Create-Client prefill from
conversation (name matched to the conversation's own address — beware forwarded
threads); fixed-costs delete + real table name in bulk config; transportation
single-price-per-vehicle; bulk export `select('*')` + header mapping
(deploy-order safety — check whether its bulk export names columns).

## 7. Self-hosted deliverables (support-contract model — no entitlement code)

- **Migration runner**: a script applying `supabase/migrations/*.sql` in order against
  a fresh Postgres and recording into `schema_migrations` — the hand-in-SQL-editor
  convention does not survive self-hosting. Make migrations strictly append-only and
  idempotent from now on.
- **Install path**: env template (all providers), seed script for the global catalog,
  one documented bring-up. Catalog ships as seed data with releases (no live sync).
- **Releases**: tagged versions + upgrade notes. Self-hosters bring their own
  Anthropic/Twilio/Gmail/Stripe-less config; the `WHATSAPP_PROVIDER`-style switches
  generalise.

## 8. Risks / watch-outs

- The 6 Railway tenants are empty but the environment is LIVE — merges auto-deploy.
  Treat prod like travel-ops-pro's: deploy-order safety on every schema-coupled change.
- The lint ratchet fails CI on any new lint issue — check counts before pushing.
- `git pull` in BOTH repos before comparing anything (the 128-commits-behind lesson).
- Re-verify every claim in §2 marked from DB types if more than a few days pass.

## 9. Reference repo pointers (the specification library)

All in `~/whatsapp_to_quote/travel-ops-pro`:
- Plans: `docs/plans/sibling-productization.md`, `multi-destination.md`,
  `per-rate-currency.md`.
- Currency: `lib/rates/rate-currency.ts`, `lib/itinerary-fx.ts`,
  `app/components/RateCurrencyField.tsx`, `__tests__/lib/rate-currency.test.ts`,
  `__tests__/lib/itinerary-fx.test.ts`.
- Destinations: `lib/ai/destination-context.ts`, `app/components/useDestinationCities.ts`,
  `app/components/CityOptions.tsx`, `app/settings/destinations/page.tsx`,
  `app/api/destinations/`, `migrations/20260827_destinations.sql`,
  `__tests__/lib/ai/destination-context.test.ts`, `prompt-builder-golden.test.ts`.
- Messaging outcomes: `lib/portal/chat-reply.ts`, `__tests__/lib/portal-chat-reply.test.ts`.
- The worked accounting example (for any explanation to stakeholders): the
  "Costs in Their Own Currency" page and `docs/plans/per-rate-currency.md`.
