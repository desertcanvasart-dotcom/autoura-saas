# Self-hosting Autoura

The self-hosted offering (productization plan §5): a customer runs the whole
stack on their own accounts — their Supabase project, their host, their API
keys — under a support contract. There is no entitlement code; this document
plus tagged releases IS the product surface.

## Prerequisites

- **Node 20+**
- **A Supabase project** (hosted supabase.com or a self-hosted Supabase
  stack). The app needs the URL, the anon key, the service-role key, and the
  Postgres connection string.
- API keys for the features you want — see `.env.example`. Only Supabase and
  (for AI features) Anthropic are required; every other integration disables
  itself cleanly when unset.

## First install

```bash
git clone <this repo>   # at a release tag — see Releases below
cd autoura-saas
npm ci
cp .env.example .env.local   # fill it in
```

Build the schema — every migration, in order, recorded in
`schema_migrations`:

```bash
DATABASE_URL=postgres://... node scripts/migrate.mjs
```

The runner applies `supabase/migrations/*.sql` alphabetically, records each
file, and stops loudly at the first failure without recording it (fix, rerun,
it retries from there). `--status` lists state, `--dry-run` previews.

The from-scratch replay is **tested in CI** (`scripts/__tests__/
migration-replay.test.ts` builds the entire schema against a real Postgres on
every run), with seven migrations exempted because they touch
Supabase-managed surfaces the test cannot stub — they apply fine on a real
Supabase project:

- `004`, `038` (storage buckets), `205` (pgvector), `261` (realtime
  publication), `273`, `277`, `283` (grant/RLS self-checks).

If one of those seven DOES fail on your project, its error message says
exactly what it checks — read the migration's header comment.

Then run the app:

```bash
npm run build
npm start          # serves on PORT (default 3000)
```

Create the first tenant through `/signup`, and put your own email in
`SUPER_ADMIN_EMAILS` for the super-admin console.

### Seed data

The **destination catalog** (countries + cities that power every city
dropdown and the AI's vocabulary) ships inside migration
`294_destination_catalog.sql` — a fresh install has Egypt fully populated
plus MEA country shells, and tenants add more through
**Settings → Destinations**. No separate seed step.

Optional starter rates: `scripts/seed-rates.mjs` (see `scripts/
rates.example.json`) and `scripts/seed-message-templates.mjs`.

## Adopting the runner on an EXISTING database

If your database was built by hand-applying migrations (the pre-runner
convention), record everything as applied without re-running any SQL:

```bash
DATABASE_URL=postgres://... node scripts/migrate.mjs --baseline
```

`--baseline` asserts "the schema already matches the repo" — only do this on
a database that is actually up to date. From then on, plain `migrate.mjs`
applies just the new files.

## Upgrading

```bash
git fetch --tags && git checkout <new release tag>
npm ci
DATABASE_URL=postgres://... node scripts/migrate.mjs
npm run build && restart
```

Migration doctrine (enforced by the replay test in CI): files are
**append-only** — a released migration's meaning never changes — and every
new migration must apply cleanly to BOTH a fresh database and one at the
previous release. Deploy order is free in either direction for exactly that
reason.

## Releases

- Tags: `vYYYY.MM.DD` (or semver if the cadence formalises). A release =
  everything on `main` at that commit, with CI green (tests, type-check,
  lint ratchet, migration replay).
- Upgrade notes live in the release description: new env vars, new
  migrations, anything operational. A migration that needs operator
  attention says so in its own header comment — the release notes point at
  it.
- Self-hosters should track release tags, not `main`.

## What the hosted product has that self-hosted doesn't

- Stripe billing (leave `STRIPE_*` unset; manage tenants in the super-admin
  console instead).
- Railway cron wiring — schedule the three cron scripts yourself
  (`scripts/cron-exchange-rates.mjs`, `cron-reminders.mjs`,
  `cron-agent-memory.mjs`) via your host's scheduler or system cron, and
  protect `/api/cron/*` with `CRON_SECRET`. See `docs/CRON-JOBS.md`.
