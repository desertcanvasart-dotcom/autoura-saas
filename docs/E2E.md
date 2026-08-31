# End-to-end tests

`npm run test:e2e` — Playwright, one Chromium project, run in CI on every PR.

## What the suite covers today

The **auth boundary**, asserted with real HTTP requests against a production
build (`next start`):

- a protected page redirects an anonymous visitor to `/login`
- a protected `/api` route answers **401 JSON** — not a redirect, not a 500
- a self-authenticating route (portal / share / staff / version) is
  **reachable without a session** and still refuses a bogus token
- token-gated pages refuse an unknown token without crashing or leaking

This is deliberately the part no unit test can prove. `app/api/__tests__/
route-auth-sweep.test.ts` reads the allowlist out of `middleware.ts` and
checks each handler carries its proof markers; only a real request can catch
a middleware that **never ran** for a path, or a page that 500s before it
refuses.

## Why it needs no database

Every assertion is about refusal, so an anonymous `getUser()` returning
nobody is all the suite needs. The config supplies placeholder Supabase env,
and the app's build-safe convention (lazy clients, no module-scope
`SUPABASE_SERVICE_ROLE_KEY!`) keeps the server booting without real
credentials. That is also why this suite is safe to run anywhere: **it cannot
write to any database, because it never authenticates.**

## The portal journey (writes)

`e2e/portal-journey.spec.ts` proves the customer-facing surfaces end to end
against `next start`: the confirmation gate, traveller details, per-traveller
private links, document upload into the private bucket, change requests, and
the share-page chat landing in a staff conversation.

Unlike the auth boundary, **it writes**, so it is gated three ways and skips
unless all three hold:

1. `E2E_SUPABASE_URL` + `E2E_SUPABASE_SERVICE_ROLE_KEY` are set,
2. `E2E_TENANT_ID` names a tenant, and
3. that tenant carries `settings.e2e_fixture === true`.

(3) is the guard that matters. A harness that picks "the first tenant" will
one day pick a real agency's: on 2026-08-30 exactly that happened during
manual testing — the journey seeded into a live tenant and the chat's notify
path emailed their real contact address three times. The fixture tenant must
say out loud that it is disposable, and `scripts/seed-e2e-tenant.mjs` is the
only thing that marks one. It also refuses to seed a project that already
holds non-fixture tenants, and pins the fixture's `contact_email` to an
RFC-2606 `.invalid` address so the notify fallback has nowhere real to send.

Two further notes for anyone editing it:

- **The verify cookie is `secure` under `NODE_ENV=production`**, which is
  correct — production serves the portal over HTTPS. The suite drives plain
  `http://127.0.0.1`, where no conforming client stores such a cookie, so the
  `Session` wrapper carries the `Set-Cookie` value forward itself. The server
  still issues it, validates its HMAC and refuses without it.
- **Teardown deletes the chat's `unified_conversation` by id**, captured from
  the message row. The route takes `client_id` from the *itinerary*, which
  this fixture leaves null, so deleting by `client_id` leaks a row per run.

```bash
E2E_SUPABASE_URL=... E2E_SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/seed-e2e-tenant.mjs          # prints the tenant id
E2E_TENANT_ID=<that id> npx playwright test e2e/portal-journey.spec.ts
```

## What is deliberately NOT here

Authenticated journeys — sign in, create a rate, price a quote, confirm a
booking, open a portal link — because they **write**. They need a dedicated
throwaway Supabase project, never the live one. The reference implementation
learned this the hard way: its E2E specs create a hotel rate and a booking,
and for a while a local run pointed at production credentials.

To add them:

1. Create a separate Supabase project for CI and apply the migrations to it
   (`DATABASE_URL=… npm run migrate`).
2. Give CI these secrets, which `playwright.config.ts` already reads:
   `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`,
   `E2E_SUPABASE_SERVICE_ROLE_KEY`.
3. Seed the fixture tenant with `node scripts/seed-e2e-tenant.mjs` (it is
   idempotent and prints the tenant id), then write authed specs against it —
   `e2e/portal-journey.spec.ts` is the worked example.

Until those secrets exist, the config falls back to placeholders, the portal
journey skips, and the suite stays in its read-only, refusal-only shape. It
never silently points at production: the fallback is a placeholder URL that
resolves to nothing, not whatever happens to be in the environment.

CI wires this up already — the `Seed the E2E fixture tenant` and `E2E portal
journey` steps in `.github/workflows/ci.yml` run only when
`E2E_SUPABASE_URL` is a non-empty secret. Note the steps read the credentials
from **job-level `env`**, not from `secrets` directly: `secrets` is not an
available context in a step-level `if`.

## Running locally

```bash
npx next build          # the suite runs `next start`, not `next dev`
npm run test:e2e        # or: npm run test:e2e:ui
```
