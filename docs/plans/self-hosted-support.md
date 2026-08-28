# Supporting a self-hosted install

Status: **built (S1–S3), but written on a mistaken premise.** Written
2026-08-28. Corrected 2026-08-29.

> ## Correction — read this before the plan
>
> **This plan was written into the wrong repository.** It assumes `autoura-saas`
> is installed on customers' own servers. It is not. `autoura-saas` is the
> multi-tenant SaaS that we host; agencies use it by signing up as tenants. The
> product customers install on their own hardware is **`travel-ops-pro`**.
>
> Where the mistake came from: `docs/plans/productization-from-reference.md` §1
> records the operator's answer of 2026-08-27, *"Self-hosted licensing = support
> contract → build NO entitlement/license-key code."* That settled **how
> licensing works**, not **which repository ships to customers**. Read inside a
> plan about `autoura-saas`, it was taken to mean this product was the
> self-hosted one. The licensing answer still stands — it attaches to
> `travel-ops-pro`. Confirmed by the operator 2026-08-29.
>
> **What this means for the work already merged (#254–#257):**
>
> - The code is sound and is staying. `doctor.mjs`, the support bundle and its
>   redaction rules, `job_runs`, and `/api/health/deep` all diagnose *this*
>   instance, which we host and do need to diagnose. Only the framing was wrong.
> - The reasoning below about **not owning the instance** (§1, §2, §5, §6) does
>   not apply to `autoura-saas` and should not be used to argue about it.
> - That reasoning is still correct **for `travel-ops-pro`**, where it becomes
>   T4 of `travel-ops-pro/docs/plans/self-hosting.md`. Port it there rather than
>   rewriting it — especially the redaction rules, which must not diverge.
>
> The plan is kept unedited below as the design record. `docs/SELF-HOSTING.md`,
> which it references, is now `docs/OPERATIONS.md` and has been reframed as the
> runbook for the instance we operate.

---

The self-hosted tier is sold under a support contract (`docs/SELF-HOSTING.md`).
This is how that contract gets honoured when the thing you are supporting runs
on somebody else's server, in a country you are not in, holding data you must
not casually touch.

---

## 1. What changes when you do not own the instance

Everything built for support so far assumes the opposite. The super-admin
console, tenant impersonation and the support inbox
(`/api/super-admin/support`, `/api/super-admin/impersonate`) all work because
*we* run the instance and *we* hold the service-role key. On a self-hosted
install the customer runs the whole stack — their Supabase project, their host,
their keys — and we are not super-admin anywhere in it. **None of that tooling
crosses the boundary.**

What we have that does cross it is small but real:

| Thing | What it proves | Reachable from outside? |
|---|---|---|
| `GET /api/version` | which commit is actually serving | yes, public |
| `GET /api/health` | the database is reachable | yes, public |
| `scripts/verify-deploy.mjs` | version + health + the auth gate is up | yes, given a URL |
| `scripts/migrate.mjs --status` | which migrations are applied | no — needs their DATABASE_URL |
| `scripts/verify-rls.mjs` | anon can read nothing | no — needs their keys |

The last two are the useful ones and they are exactly the two we cannot run.
That asymmetry is the whole problem.

## 2. The principle

**Design so that we almost never need access to their server.**

Two reasons, both real rather than decorative:

*Liability.* Their database holds passport numbers, invoices and travellers'
personal details. Every time we touch it we take on responsibility for it, and
we create the possibility of a "did you change something?" dispute we cannot
disprove. Their auditors will eventually ask what access the vendor has.

*Arithmetic.* One person cannot be on call for ten installs in three time
zones. Support that requires our hands does not scale past about two customers.

The target: **most incidents resolve by email; the rest by a screen share the
customer drives.** Direct access is an escalation, not a workflow.

## 3. Four layers, in order of preference

**Layer 1 — the app explains itself.** A support bundle the customer generates
and sends. This is the highest-value thing in this document: most "it's broken"
reports are answered by two lines of it, usually a missing environment variable
or an unapplied migration.

**Layer 2 — diagnostics they run.** One command, written by us, that they run on
their own machine and that tells them (and us) what is wrong.

**Layer 3 — fixes ship as releases.** Already built and possibly not noticed as
the answer: tagged releases, an idempotent migration runner, and a from-scratch
replay proven in CI. Diagnose from the bundle, fix in the repo, tag, and they
run three commands. This should be the DEFAULT path, not the fallback.

**Layer 4 — hands on the machine.** Agreed in the contract, time-boxed,
preferably with the customer driving.

## 4. What to build

### S1 — the support bundle *(build first)*

`GET /api/support-bundle` behind super-admin (theirs, not ours), plus
`node scripts/doctor.mjs --bundle` for when the app will not start — because the
cases where the app is down are exactly the cases we most need the bundle for,
and an endpoint cannot serve them.

```jsonc
{
  "generatedAt": "2026-08-28T18:00:00Z",
  "app":      { "version": "2026.08.29", "sha": "ab39887", "node": "20.11.1", "uptimeSeconds": 84213 },
  "database": { "reachable": true, "latencyMs": 41,
                "migrationsApplied": 189, "migrationsPending": ["307_x.sql"] },
  "env":      { "set": ["NEXT_PUBLIC_SUPABASE_URL", "ANTHROPIC_API_KEY"],
                "missing": ["STRIPE_SECRET_KEY"] },      // NAMES ONLY
  "integrations": { "supabase": "ok", "anthropic": "ok", "stripe": "unconfigured" },
  "crons":    [{ "name": "exchange-rates", "lastRun": null, "lastOutcome": null }],
  "counts":   { "tenants": 3, "itineraries": 412, "bookings": 88 },
  "recentErrors": ["2026-08-28T17:58Z  PATCH /api/bookings/… → 500 (column … does not exist)"]
}
```

**The redaction rules are the load-bearing part**, because a bundle that leaks
is worse than no bundle:

- environment variables by **name only**, never value — and the name list is an
  allow-list of ours, so a customer's own variable never travels
- **counts, never rows.** No client names, no emails, no passport anything
- error lines scrubbed for anything shaped like a key, a token, an email or a
  UUID that identifies a person
- no table contents, no query results, no request bodies
- the bundle is written to a file the customer reads before sending. They must
  be able to see exactly what they are handing over

### S2 — a deep health check

`/api/health` today checks one thing: can we reach the database. Right for a
public probe — it must stay secret-free, since anyone can call it.

Add `GET /api/health/deep`, super-admin only, returning the same shape as the
bundle's `database`, `integrations` and `crons` sections. Same information, but
gated, so it can afford to be specific about *what* failed.

### S3 — a record that a job ran

Nothing in this repo records that a cron ever ran. `docs/CRON-JOBS.md` describes
three jobs configured **in the Railway dashboard**, which a self-hosted customer
does not have — so on their server the jobs are whatever their own scheduler
does, and there is no way to tell from inside the app whether exchange rates
have refreshed since install.

A `job_runs` table (name, started_at, finished_at, outcome, detail) written by
each cron endpoint costs one insert and turns "the FX rates look stale" from a
conversation into a line in the bundle. It also gives self-hosted customers a
scheduling section in `SELF-HOSTING.md` that is not Railway-specific.

### S4 — the upgrade procedure, written down as a procedure

`SELF-HOSTING.md` explains a first install well. What it does not have is the
thing somebody reads at 9pm when something is broken:

```
git fetch --tags && git checkout vYYYY.MM.DD
npm ci
DATABASE_URL=… node scripts/migrate.mjs --dry-run   # read it
DATABASE_URL=… node scripts/migrate.mjs
npm run build && npm start
node scripts/doctor.mjs                             # prove it
```

Plus what to do when it goes wrong: migrations are append-only and recorded
individually, so a failed one stops without being recorded and the fix is to
correct and re-run, never to roll the database back. Say that explicitly —
somebody will otherwise try to restore a snapshot and lose a day's bookings.

### S5 — the escalation path, and the contract

In order:

1. **Bundle by email.** Most incidents end here.
2. **Screen share, customer driving.** No credentials change hands and they see
   every command. Right for almost every one-off.
3. **Time-boxed access they grant and revoke** — a read-only Postgres role, or a
   temporary server user, created at the start of the session and dropped at the
   end. Named in the contract, not negotiated during an incident.

**Never** a service-role key sent by email or chat. That key bypasses RLS
entirely; once it is in a mailbox it is in that mailbox forever, and in every
backup of that mailbox.

The support agreement should state what we can reach, under what circumstances,
who grants it and what is logged. Customers handling EU and Japanese passport
data will be asked this by their own auditors, and having it written down is
worth more than it costs to write.

## 5. What makes layer 4 rare

- **Maintenance as re-runnable scripts with `--dry-run`**, so a fix is "run this
  command from the release we just tagged" rather than "let me in". Every
  incident resolved that way becomes a script the next customer never needs us
  for.
- **Feature flags and kill switches**, so "turn that off in Settings" beats an
  emergency patch.
- **Error messages that name their own cause.** The migration runner already
  does this; the API mostly does not.

## 6. What NOT to build

**Mandatory phone-home telemetry.** The self-hosted tier is sold on the
customer's data staying on the customer's infrastructure; an install that
reports to us undermines exactly what they paid for, and it is the first thing
a security review will find.

Optional, opt-in, errors-only reporting (a DSN they configure, default off) is
fine. The support bundle is the manual alternative for everyone who declines,
which is why S1 comes first and this does not come at all until someone asks.

## 7. Risks

| Risk | Mitigation |
|---|---|
| A bundle leaks customer data | Allow-listed fields only, counts never rows, scrubbed errors, written to a file they read first |
| The bundle is useless when the app is down | `scripts/doctor.mjs` runs without the app, straight against DATABASE_URL |
| Support access becomes a standing arrangement nobody revoked | Time-boxed by contract; the customer creates and drops the credential, not us |
| We fix a customer's install by hand and forget to fix the repo | Every hands-on fix ends with either a script or a release. If it produced neither, it is not finished |
| A customer runs a version we no longer remember | `/api/version` and the bundle both carry the tag; support only covers tagged releases |

## 8. Order

S1 → S3 → S2 → S4 → S5. S1 first because it is small (mostly composition of
`verify-deploy.mjs`, `verify-rls.mjs`, `migrate.mjs --status` and
`/api/health`), and because everything else is easier to design once we have
seen what the first two real incidents actually look like.
