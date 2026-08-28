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
3. Add a seeded test tenant + user, and write the authed specs against it.

Until those secrets exist, the config falls back to placeholders and the
suite stays in its read-only, refusal-only shape. It never silently points at
production: the fallback is a placeholder URL that resolves to nothing, not
whatever happens to be in the environment.

## Running locally

```bash
npx next build          # the suite runs `next start`, not `next dev`
npm run test:e2e        # or: npm run test:e2e:ui
```
