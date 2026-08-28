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

Read the release notes first: they list new environment variables and anything
that needs a decision. Then, in order:

```bash
git fetch --tags && git checkout <new release tag>
npm ci
DATABASE_URL=postgres://... node scripts/migrate.mjs --dry-run   # read this
DATABASE_URL=postgres://... node scripts/migrate.mjs
npm run build && restart
npm run doctor                                                    # prove it
```

The `--dry-run` step is not ceremony: it lists exactly which files are about to
run, which is your last chance to notice you are further behind than you thought.
The `doctor` step at the end is what tells you the upgrade actually took.

Migration doctrine (enforced by the replay test in CI): files are
**append-only** — a released migration's meaning never changes — and every
new migration must apply cleanly to BOTH a fresh database and one at the
previous release. Deploy order is free in either direction for exactly that
reason.

### When a migration fails

**Do not restore a database snapshot.** The runner applies files one at a time
and records each only after it succeeds, so a failure leaves the database at the
last good migration and nothing half-applied. Restoring a snapshot would throw
away every booking taken since it was made, to fix a problem that has already
stopped by itself.

What to do instead:

1. Read the error. The runner stops on the first failure and prints the file and
   the message.
2. Fix the cause — usually a permission, an extension the project does not have,
   or a Supabase-managed surface (`docs/SELF-HOSTING.md` lists the seven
   migrations that touch those).
3. Re-run `node scripts/migrate.mjs`. It resumes from the file that failed,
   because that one was never recorded.

If you cannot get past it, run `npm run doctor -- --bundle` and send the file —
`support-bundle.json` names the pending migration, which is usually the whole
diagnosis.

## Scheduled jobs

Five jobs run on a schedule. **On a self-hosted install, running them is yours
to arrange** — this app does not schedule anything itself. Point your scheduler
(cron, systemd timers, your platform's job runner) at these, each authenticated
with `CRON_SECRET`:

| Job | Endpoint | Suggested schedule |
|---|---|---|
| Exchange rates | `POST /api/cron/refresh-exchange-rates` | daily, 01:00 |
| Agent memory | `POST /api/cron/process-agent-memory` | daily, 02:00 |
| Reminders | `GET /api/cron/send-reminders` | daily, 06:00 |
| Task reminders | `GET /api/cron/task-reminders` | daily, 06:00 |
| Document retention | `GET /api/cron/purge-traveller-documents` | daily, 03:45 |

The bundled `scripts/cron-*.mjs` drivers call them for you and exit with the
right code, so a scheduler records success or failure.

**Exchange rates is the one to get right.** Without it, every historical
conversion in the P&L and the financial reports silently falls back to today's
rate. Nothing errors; the numbers just stop being true.

Each run records itself in `job_runs`, so `npm run doctor` can tell you whether
your scheduler is actually working — including a job that ran for months and
then quietly stopped.

## When something goes wrong

Run the doctor. It talks to Postgres directly and reads the migration files off
disk, so it works whether or not the app is running — which matters, because
the app not running is the case you most need it for.

```bash
npm run doctor                            # check, print findings
npm run doctor -- --bundle                # also write support-bundle.json
npm run doctor -- --logs /var/log/app.log # include that log, scrubbed
npm run doctor -- --url https://your-app  # also probe the running app
```

It prints a pass/fail line per check and then plain-language findings — most
problems are a missing environment variable or an unapplied migration, and it
names both along with the command that fixes them.

A running install can produce the same thing from the app: sign in as a
super-admin and fetch `/api/support-bundle`. The script sees one thing the
endpoint cannot — which migrations are PENDING, because that needs the
migration files and those are not in a built image.

### A running install's own monitoring

`GET /api/health` is public and answers one question: is the process up and can
it reach the database. Point an uptime monitor at it.

`GET /api/health/deep` answers the more useful question — is anything degraded —
and is therefore gated. Two ways in, because a monitor cannot hold a session:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/health/deep
```

or a super-admin session in a browser. It returns 503 when a dependency is
actually down, so a monitor pages; a scheduler that has stopped is REPORTED but
does not page, because it is a real problem and it is not an outage, and a
monitor that cries wolf gets muted.

### Sending it to support

`support-bundle.json` is written for you to read before you send it. It
contains:

- environment variable **names** only — no value ever, not even a prefix
- table **counts** only — no client names, emails, passports or any row content
- error lines scrubbed of addresses, keys, tokens, ids and document numbers
- only variables this product defines; your own are not reported at all

Hostnames can appear, deliberately: a failure like `ENOTFOUND db.internal` keeps
the host, because which host failed is the useful half of the message.

**Nothing is sent anywhere by the script or the endpoint.** They print and write
a file; emailing it is your decision.

### How support works

In order, and it stops as soon as the problem is solved:

1. **You send the bundle.** Most issues end here — the answer is usually a
   missing environment variable or an unapplied migration, and the findings name
   both along with the command that fixes them.
2. **A screen share, with you driving.** No credentials change hands and you see
   every command run. This covers almost everything the bundle does not.
3. **Time-boxed access you grant and revoke** — a read-only database role or a
   temporary server account, created for the session and removed at the end. If
   your support agreement does not describe this, it should, before you need it.

**Support never needs your service-role key or your database password.** That
key bypasses row-level security entirely; once it is in a mailbox it is in that
mailbox forever, and in every backup of it. Anyone asking for either by email is
not us.

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
