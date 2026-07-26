# Scheduled jobs

Two background jobs run on a schedule. Both are HTTP-triggered: a tiny Node
script POSTs to an authenticated endpoint and exits with the right code so the
scheduler records success or failure.

## How cron works on Railway

Railway has **no `[[cron]]` table in `railway.toml`**. Cron is configured
per-service in the dashboard (Settings → Cron Schedule), and it runs that
service's **start command**, which must exit when finished.

So each job is its own Railway service, pointed at this same repo, with a
start command that runs once and exits. They do not serve traffic.

| Job | Config file (sets the start command) | Schedule (UTC) | Endpoint |
|---|---|---|---|
| Agent memory | `railway.cron-agent-memory.toml` | `0 2 * * *` | `POST /api/cron/process-agent-memory` |
| Exchange rates | `railway.cron-exchange-rates.toml` | `0 1 * * *` | `POST /api/cron/refresh-exchange-rates` |

### ⚠️ The start command comes from a config file, NOT the dashboard

This is the single easiest thing to get wrong, and it fails silently.

`railway.toml` sets `startCommand = "npm run start"`, and **every service built
from this repo reads it by default**. Config-as-code overrides the dashboard,
so on a cron service the Custom Start Command field is **greyed out**, showing
*"The value is set in /railway.toml"*.

The result: the cron service inherits the web service's start command, boots a
Next.js server that never exits, sits in **"Running"** forever, never fires the
job — and Railway bills for an extra web server. Nothing errors.

So each cron service must be pointed at its own config file:

**Service → Settings → Config-as-code → Railway Config File → + Add File Path**

- Exchange rates service → `railway.cron-exchange-rates.toml`
- Agent memory service → `railway.cron-agent-memory.toml`

Only `startCommand` is pinned in those files. The **cron schedule** and
**restart policy** stay editable in the dashboard.

**A cron service stuck on "Running" for more than a few seconds is this bug.**
A correct run finishes in about a second and exits.

### Why cron jobs must use an `/api/cron/` endpoint

`middleware.ts` gates **every** `/api/*` route behind a Supabase session,
except a short allowlist of routes that authenticate themselves
(`SELF_AUTH_API_PREFIXES`). `/api/cron/` is the registered prefix for
`CRON_SECRET`-authenticated jobs.

This matters more than it looks. `/api/exchange-rates/refresh` already
contained a cron-secret branch, but that route is **not** allowlisted — it is
the admin-UI route — so the middleware answered 401 before the handler ever
ran. The branch was unreachable. A scheduled job pointed at a session route
fails every single night with a 401 and no other symptom.

`app/api/__tests__/route-auth-sweep.test.ts` enforces this: every route on
disk is run through the real middleware anonymously, and each allowlisted
route must prove its self-auth mechanism in its own source. A new cron
endpoint outside `/api/cron/` will fail that sweep.

### Environment variables (on each cron service)

| Var | Value |
|---|---|
| `APP_URL` | Public URL of the **web** service, e.g. `https://getautoura.net` |
| `CRON_SECRET` | **Exactly** the value set on the web service |

`CRON_SECRET` is compared directly by the endpoint. If it is unset or differs,
the request falls through to session auth and returns **401** — the job will
fail every night with no other symptom, so check this first when a schedule
appears to run but nothing changes.

---

## Exchange rates — why this job matters

This one is not cosmetic. It is the only thing that writes FX history, and
three reports depend on that history to be accurate.

`exchange_rates` holds one live row per currency pair and is **upserted** on
every refresh, so it can only answer *"what is the rate now"*.

`exchange_rate_snapshots` (migration 234) is **append-only** and answers
*"what was the rate on the day this hotel was paid"*. The per-trip P&L,
analytics and financial reports all convert against it — they ask for the
newest rate on or before each transaction's own date.

**If this job stops running, nothing breaks loudly.** Reports keep rendering;
they fall back to today's live rate and label those figures as approximations
("converted at today's rate"). The failure mode is quietly degrading accuracy,
not an error — so watch the run log, not the error rate.

### Why daily

Daily is the granularity accounting uses (a daily closing rate) and the
granularity the reports resolve against. Hourly would multiply the table by 24
without making a single margin more accurate.

Cost is negligible: `fetchAllExchangeRates()` makes **one** upstream request
(EUR base) and derives the inverse pairs arithmetically — roughly 30 requests
a month against a 1,500/month free tier. No API key is required; without
`EXCHANGE_RATE_API_KEY` it uses the keyless `open.er-api.com` endpoint.

### Freshness guard

The refresh skips work if the live rates are less than an hour old. The cron
endpoint **forces past that guard by default**, so a scheduled run always
records a data point — skipping because a rate is "fresh" would leave a gap in
exactly the history this job exists to build.

`?force=false` respects the guard, for a manual poke you don't want to spend
an upstream request on:

```bash
curl -X POST -H "x-cron-secret: $CRON_SECRET" \
  "$APP_URL/api/cron/refresh-exchange-rates?force=false"
# -> {"success":true,"skipped":true,"message":"Rates are fresh, no refresh needed",...}
```

### Why 01:00 UTC

After the provider's daily update, and an hour before the agent-memory job, so
the two never overlap.

---

## Verifying a job

Run either script locally against a running app. It needs `APP_URL` and
`CRON_SECRET` in the environment:

```bash
APP_URL=http://localhost:3000 CRON_SECRET="$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)" npm run cron:exchange-rates
```

Success looks like:

```
cron-exchange-rates: ok — Successfully refreshed 6 exchange rates (fetchedAt=..., rates=6, snapshots=6)
```

`snapshots=6` is the number that matters. The live-rate upsert can succeed
while the history write fails; in that case the endpoint returns
`snapshotError`, the script logs it and **exits 1**, so the scheduler records
a failure rather than a misleading green run.

### Both runners report the work, not the HTTP status

This is deliberate and worth preserving. Each endpoint answers **200 with a
summary**, and that summary can describe a night where the real work failed:

| Job | 200 that is actually a failure | Runner exits |
|---|---|---|
| Exchange rates | `snapshotError` set / `snapshotsWritten: 0` — rate history not written | `1` |
| Agent memory | `runs_failed > 0` — runs found but none could be processed | `1` |

Exiting `0` on any 200 would make those nights indistinguishable from healthy
ones, and Railway would show a green run while accuracy quietly degraded.
`scripts/__tests__/cron-runners.test.ts` spawns both scripts against a stub
server and asserts these exit codes, so the behaviour cannot regress.

A run that found nothing to do (`found=0`) exits `0` — a quiet night is not a
failure.

Agent-memory success looks like:

```
cron-agent-memory: ok — found=3 processed=3 failed=0 written=7 purged=2 in 412ms
```

Then confirm the history actually grew:

```sql
select captured_at, count(*) as pairs
from exchange_rate_snapshots
group by captured_at
order by captured_at desc
limit 5;
```

You should see a new `captured_at` with one row per pair. Snapshot writes are
best-effort inside the endpoint (a failure is logged, not fatal), so a 200
alone does not prove the history grew.

### Health of the history

```sql
-- How far back can reports convert accurately?
select min(captured_at) as history_starts,
       max(captured_at) as last_run,
       count(distinct captured_at) as observations
from exchange_rate_snapshots;
```

Any transaction dated before `history_starts` converts at the live rate and is
labelled as approximate in the UI.
