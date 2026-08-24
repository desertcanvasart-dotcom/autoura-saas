# Architecture — the rules that keep this codebase safe

Autoura is a multi-tenant SaaS for tour operators. This document is the distilled
version of the invariants that are otherwise scattered across file-header comments
and migration writeups. If you change code here (human or AI), read this first.

## 1. Never fabricate

The strongest rule in the repo. It grew out of real incidents where hardcoded
fallbacks (`|| 25`, `toNumber(x, 12)`, silent `0`) produced confidently wrong
customer prices.

- **Rates:** every lookup returns a real DB rate with provenance
  (`rateSource: 'db' | 'fixed'`) or `null` — never a default. A miss records a
  `PricingHole` (see `lib/pricing-types.ts`) and marks the result `complete: false`.
- **Fuzzy is not deliverable:** a keyword/tier-fallback match blocks sending
  exactly like a missing rate. `lib/pricing-guards.ts` is the single gate before
  any PDF/email/WhatsApp send path.
- **FX:** an unbacked conversion returns `basis: 'none'` + null and records an
  `FxHole` — never a guessed rate (`lib/fx-conversion.ts`). Mixed-currency
  amounts are never summed into one number (`lib/currency-totals.ts`).
- **Identity:** PDFs and emails render tenant identity from the DB; a missing
  field omits the line — there is deliberately no default brand
  (`lib/company-identity.ts`). Signer identity is passed in, never hardcoded.
- **The WhatsApp AI agent's prompt forbids it from stating or inventing any
  price** (`lib/whatsapp-ai-agent.ts`). The invariant extends to the
  conversational surface.

The correct response to missing data is always: record a hole, mark incomplete,
tell the operator what to add and where. Never invent, never silently zero.

## 2. Silent-empty is the enemy

The most recurring bug class: a discarded error, a null count, or an
RLS-hidden row being read as "zero / none / safe".

- A `null` relationship count must never mean "safe to delete"
  (`lib/delete-guard.ts`).
- RLS enabled with **no policies** returns silently empty result sets — it looks
  like "no data", not an error. `npm run verify:rls` checks both directions:
  anon reads nothing, service role reads everything.
- Service-role probes cannot test authenticated paths — they bypass RLS.

## 3. Multi-tenancy

- `tenant_id` on essentially every table, auto-filled by a BEFORE INSERT trigger
  from `get_user_tenant_id()`. One user = one tenant (`tenant_members`).
- **RLS policy pattern** (established in migration 218, extended in 259): four
  separate policies per table. SELECT allows
  `tenant_id IS NULL OR tenant_id = get_user_tenant_id()`; INSERT/UPDATE/DELETE
  require `tenant_id = get_user_tenant_id()` (never NULL). A single `FOR ALL`
  policy without `WITH CHECK` let tenants edit global seed rows — don't regress.
- **Global catalog:** `tenant_id IS NULL` rows are platform-seeded, readable by
  all tenants that opt in (`tenant_features.use_global_catalog`, migration 260),
  writable by none. Service-role readers must scope through
  `lib/catalog-scope.ts` so the app layer can't drift from RLS. Never hand-roll
  a catalog merge.
- **Super-admin is application-level, not SQL-level:** `SUPER_ADMIN_EMAILS` env
  var + service-role client (`lib/super-admin.ts`). Impersonation is a cookie
  (`x-impersonate-tenant`) handled in `lib/supabase-server.ts`; note that under
  impersonation the session/RLS client returns nothing — tenant-identity loads
  for outbound artifacts must use the admin client (`lib/sender-tenant.ts`).

## 4. Route authentication

`middleware.ts` 401s every `/api/*` route without a session unless the path is
in `SELF_AUTH_API_PREFIXES` (HMAC webhooks, CRON_SECRET crons, invitation
tokens, health/version). The sweep test
`app/api/__tests__/route-auth-sweep.test.ts` enumerates every route file on
disk and fails if a route is reachable without a registered self-auth
mechanism. Public *pages* must be listed in both `middleware.ts` and
`app/layout.tsx` (parity-tested). The `(public)` folder name grants nothing.

The only public data surface is `/share/[token]` — token-authorized, rendered
through the strict allowlist projection in `lib/itinerary-share.ts` so cost
base, margins, and internal notes can never leak.

## 5. Billing doctrine

- **The business model is not a feature.** B2C/B2B modes, pricing integrity,
  core finance, all languages, and the full rate engine are never plan-gated;
  tiers differ on throughput only (`lib/pricing-config.ts` is the canonical
  plan catalogue — snapshot-tested, synced to DB on deploy boot).
- **Fail open on undeterminable entitlement, fail closed only on a measured
  over-limit.** Every fail-open is recorded in `fail_open_events`
  (`lib/usage-limits.ts`).
- Usage windows are computed from the subscription anniversary, never stored
  and cron-advanced (`lib/usage-window.ts`).
- Enforcement ordering: check → create → increment (`lib/usage-enforcement.ts`).
- Workspace **preference** (B2C/B2B visibility) must never block data access —
  only entitlement can block (`lib/workspace-visibility.ts`).

## 6. One implementation, enforced by test

Canonical surfaces with tests that fail when a second copy or drifted mirror
appears:

- Rate lookups: `lib/pricing/rate-resolution.ts` (the only import path)
- Multi-pax pricing: `lib/pricing/pax-range.ts` (shared oracle:
  `totalCost(pax) = groupFixed + transport(pax) + perPerson × pax`)
- Plan catalogue: `lib/pricing-config.ts`
- Tenant identity: `lib/company-identity.ts`, `lib/sender-tenant.ts`
- CSV rate import: `lib/bulk-rate-service.ts` (a hand-rolled parser once
  corrupted data — kept reproducible in `rates-csv-single-path.test.ts`)
- Golden basket: `lib/__tests__/golden-basket.test.ts` locks per-person prices
  across every tier × passport combination as a drift guard.

## 6b. Generated database types

`types/database.types.ts` is generated from the **live production schema** by
`npm run types:generate` (`scripts/generate-db-types.mjs` — PostgREST OpenAPI,
because the Supabase CLI has no linked project here). Regenerate it after
applying a migration; `npm run types:check` fails if the file drifted.

- The hand-written interfaces in `types/*.ts` predate this and can drift —
  prefer `Tables<'x'>` / `TablesInsert<'x'>` / `TablesUpdate<'x'>` from
  `types/database.types.ts` for new code.
- **Annotate insert/update payloads** with `TablesInsert<'x'>`: a phantom
  column in an annotated literal is a compile error (the migration-262 bug
  class). Passing a bare literal straight into `.insert()` is NOT excess-checked
  (supabase-js's generic signature), so the annotation is where the protection
  lives.
- Adoption state: all three client factories (`lib/supabase-server.ts`,
  `app/supabase.ts`, `lib/supabase/server.ts`) carry the `Database` generic;
  their call sites were migrated 2026-07-29. `requireAuth()`/`getUserTenantId()`
  return discriminated unions — guard with `error !== null` (bare truthiness
  does not narrow; see the comment in lib/supabase-server.ts).
- `tsc --noEmit` on this repo needs `NODE_OPTIONS=--max-old-space-size=8192`.
  At the default heap it dies OOM — and a piped `grep -c "error TS"` then
  reads 0, masquerading as a clean pass. Always check tsc's exit code.

## 7. Migrations

- `supabase/migrations/` is the **only** migration directory (test-enforced),
  numbered in bands: 000–041 foundation, 100–154 catalog/seeds, 200+ hardening.
- Applied **by hand** in the Supabase SQL editor, then recorded in the
  `schema_migrations` table (created after an audit found 7 merged migrations
  that never reached production).
- House style: every migration opens with a header explaining the verified
  production bug it fixes. Keep doing this.
- Signup runs the `handle_new_user_signup()` trigger on `auth.users` — if you
  drop a column, grep the trigger. Migration 262 exists because 240 didn't.

## 8. External integrations

- **Concierge intake:** HMAC-signed webhook (`lib/concierge-webhook-auth.ts`,
  timestamped signature, 300s replay window, dual-secret rotation). Brand →
  tenant routing never falls back to a default tenant; unmapped = 422.
  Idempotency is doubled: DB partial-unique indexes and code-level
  find-before-insert.
- **Stripe:** webhook events deduped via `stripe_webhook_events`;
  version-tolerant field readers in `lib/stripe-webhook-fields.ts`.
- **Gmail:** fresh OAuth2 client per call (a shared singleton caused cross-user
  token clobbering); OAuth `state` is signed (`lib/oauth-state.ts`).
- **Sawa** (sibling seat-pooling platform) mirrors departures in via
  `/api/webhooks/departures` (read-only mirror, migration 230).

## 9. Cron / deploy

- Railway start commands are stored on each service (Config-as-Code was
  deprecated; the `railway*.toml` files were deleted 2026-08-24). The topology
  is defined in `.railway/railway.ts`.
  run. See `docs/CRON-JOBS.md`.
- Cron entrypoints are tested as spawned processes asserting **exit codes** —
  the only signal Railway records.
- `npm run verify:deploy` proves which commit production serves and that the
  auth gate is up. Run it after deploys.
