#!/usr/bin/env node
/**
 * seed-copilot-system-prompt.mjs — give ONE company its own email-copilot
 * system prompt and switch on draft pre-generation for it.
 *
 *   node scripts/seed-copilot-system-prompt.mjs --mailbox hello@travel2egypt.org \
 *        --prompt docs/copilot/copilot-system-prompt-travel2egypt.md            # dry run
 *   node scripts/seed-copilot-system-prompt.mjs --migrations-only --apply      # 474/475 only
 *   node scripts/seed-copilot-system-prompt.mjs ... --apply                    # writes
 *
 * The company is the one whose Gmail connection is --mailbox (gmail_tokens);
 * exactly one must match. With --apply it also applies migrations 474 and 475
 * (both ADD COLUMN IF NOT EXISTS — safe to repeat), then sets
 * tenant_features.copilot_system_prompt and copilot_pregenerate_enabled = true
 * for that company only. Needs DATABASE_URL (set -a; source .env.local).
 *
 * ORDER: apply the migrations BEFORE deploying the copilot code — it reads
 * both new columns, and without them the copilot settings page fails and the
 * composer stops finding pre-generated drafts. Set the prompt AFTER deploy —
 * before it, pre-generation on writes the built-in two-option drafts.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const args = process.argv.slice(2)
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null }
const mailbox = opt('mailbox')
const promptPath = opt('prompt')
const apply = args.includes('--apply')
const migrationsOnly = args.includes('--migrations-only')
if (!migrationsOnly && (!mailbox || !promptPath)) {
  console.error('usage: --mailbox <address> --prompt <file> [--apply]')
  process.exit(2)
}
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(2) }

const prompt = migrationsOnly ? '{{RATES_BLOCK}}' : readFileSync(promptPath, 'utf8')
if (!prompt.includes('{{RATES_BLOCK}}')) { console.error('the prompt has no {{RATES_BLOCK}} — refusing'); process.exit(2) }
if (prompt.length > 20000) { console.error(`the prompt is ${prompt.length} characters; the limit is 20,000`); process.exit(2) }

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migrations = ['474_copilot_system_prompt.sql', '475_copilot_skip_reason.sql']
  .map(f => [f, readFileSync(path.join(root, 'supabase/migrations', f), 'utf8')])

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
try {
  if (migrationsOnly) {
    if (!apply) { console.log('dry run — add --apply to apply migrations 474/475.'); process.exit(0) }
    await db.query('begin')
    for (const [name, sql] of migrations) { await db.query(sql); console.log(`applied ${name}`) }
    await db.query('commit')
    process.exit(0)
  }
  const { rows: boxes } = await db.query(
    `select g.tenant_id, t.company_name from gmail_tokens g join tenants t on t.id = g.tenant_id where lower(g.email) = lower($1)`,
    [mailbox],
  )
  const tenants = [...new Map(boxes.map(b => [b.tenant_id, b])).values()]
  if (tenants.length !== 1) {
    console.error(`expected exactly one company for ${mailbox}, found ${tenants.length}`)
    process.exit(1)
  }
  const { tenant_id: tenantId, company_name: company } = tenants[0]
  console.log(`company: ${company} (${tenantId})`)
  console.log(`prompt: ${promptPath} — ${prompt.length} characters`)

  const { rows: [rates] } = await db.query(
    `select count(*)::int n from publish_pages where tenant_id = $1 and public_rate is not null and public_rate_approved_at is not null`,
    [tenantId],
  )
  console.log(`tours with an approved public rate: ${rates.n}${rates.n === 0 ? ' — every draft will say "[price to be confirmed by our team]" until rates are approved in Publish' : ''}`)

  if (!apply) {
    console.log('\ndry run — nothing written. Add --apply to apply migrations 474/475 and set the prompt.')
    process.exit(0)
  }

  await db.query('begin')
  for (const [name, sql] of migrations) {
    await db.query(sql)
    console.log(`applied ${name}`)
  }
  const { rowCount } = await db.query(
    `update tenant_features set copilot_system_prompt = $2, copilot_pregenerate_enabled = true where tenant_id = $1`,
    [tenantId, prompt],
  )
  if (rowCount !== 1) throw new Error(`tenant_features: expected 1 row, updated ${rowCount}`)
  await db.query('commit')
  console.log('set copilot_system_prompt and copilot_pregenerate_enabled = true')
} catch (err) {
  await db.query('rollback').catch(() => {})
  console.error('failed, rolled back:', err.message)
  process.exitCode = 1
} finally {
  await db.end()
}
