# Autoura

Multi-tenant SaaS for tour operators and DMCs — from WhatsApp conversation to priced itinerary, branded quote, booking, and invoice.

**Stack:** Next.js (App Router) · React · TypeScript · Supabase (Postgres + Auth + RLS + pgvector) · Stripe · WhatsApp (Twilio or Meta Cloud API, switched via `WHATSAPP_PROVIDER` — see `lib/whatsapp.ts`) · Gmail OAuth · Resend · Anthropic + OpenAI

**Deployment:** Railway — web service (`railway.toml`, auto-deploys on merge to `main`) plus two cron services (`railway.cron-exchange-rates.toml`, `railway.cron-agent-memory.toml`). See [docs/CRON-JOBS.md](docs/CRON-JOBS.md) before touching cron config — the start command comes from the config file, not the dashboard.

## Getting started

```bash
npm install
npm run dev        # requires .env.local (Supabase, Stripe, Twilio, Resend, Anthropic, OpenAI keys)
```

Database migrations live in `supabase/migrations/` (the only migration directory — enforced by test) and are applied by hand in the Supabase SQL editor, then recorded in the `schema_migrations` table.

## Key commands

| Command | What it does |
|---|---|
| `npm test` | Full vitest suite |
| `npm run verify:deploy` | Proves which commit production serves + auth gate is up |
| `npm run verify:rls` | Anon key must read nothing; service role must read everything |
| `npm run lint:ratchet` | Lint debt must not exceed `scripts/lint-baseline.json` |
| `npm run check:bundle` | Gzipped client-JS budget |
| `npm run plans:check` | Billing plan config vs generated `plans.json` drift |
| `npm run stripe:plans` | Sync Stripe products/prices from plan config (dry-run by default) |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the invariants and patterns that keep this codebase safe; **read this first**
- [docs/PRICING-HARNESS-PLAN.md](docs/PRICING-HARNESS-PLAN.md) and [docs/PRICING-CONSOLIDATION-PLAN.md](docs/PRICING-CONSOLIDATION-PLAN.md) — the pricing engine's design docs (referenced throughout the code)
- [docs/CRON-JOBS.md](docs/CRON-JOBS.md) — Railway scheduled jobs
- [docs/I18N-PHASE1.md](docs/I18N-PHASE1.md) — customer-document i18n plan
- [docs/PRICING-PARITY-SMOKE-TEST.md](docs/PRICING-PARITY-SMOKE-TEST.md) — live pricing-grid smoke test runbook
- `docs/archive/` — historical audit and phase notes (local working files, mostly gitignored)
