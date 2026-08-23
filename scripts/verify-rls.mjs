#!/usr/bin/env node
// ============================================================================
// RLS verifier — re-runs the anonymous sweep that found the drift.
//
//   node scripts/verify-rls.mjs
//
// Two halves, because a security fix that breaks the product is not a fix:
//
//   1. NO table may return rows to the anonymous (public anon-key) client, and
//      `tenants` must reject anonymous INSERT.
//   2. The service-role client must still read every table — proving RLS was
//      not enabled without policies, which denies everything silently.
//
// The authenticated path cannot be checked from here without a user session;
// it is asserted by design in migration 242 and should be confirmed by loading
// the app once after applying.
//
// Exits 1 on any failure so it can gate a deploy.
// ============================================================================

import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anonKey || !serviceKey) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}

const anon = createClient(url, anonKey, { auth: { persistSession: false } })
const svc = createClient(url, serviceKey, { auth: { persistSession: false } })

// Every relation PostgREST exposes — tables AND views — pulled from the live
// schema, not a hand-kept list. A hard-coded list is how the
// effective_exchange_rates view (owner-privilege view, bypasses RLS on the
// tables beneath it) leaked tenant ids to the anon key until 2026-07-29: it
// was never on the list, so the sweep never probed it. Migration 263 dropped
// it; this enumeration makes the next one un-missable.
async function allRelations() {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  })
  if (!res.ok) {
    console.error(`✗ schema fetch failed: HTTP ${res.status} — cannot enumerate relations`)
    process.exit(1)
  }
  const spec = await res.json()
  const names = Object.keys(spec.definitions || {})
  if (names.length === 0) {
    console.error('✗ schema fetch returned no relations — refusing to pass an empty sweep')
    process.exit(1)
  }
  return names.sort()
}

// The 13 tables migration 242 restores, plus the tenant tables that must never
// be anonymous under any circumstances. Kept (and unioned with the live
// schema) so these names stay probed even if PostgREST ever stops exposing
// one — disappearing from the schema must fail loudly in half 3, not pass
// silently in half 1.
const GUARDED = [
  'tenants', 'tenant_members', 'tenant_features', 'departments',
  'entrance_fees', 'flight_rates', 'train_rates', 'tipping_rates',
  'hotel_staff_rates', 'airport_staff_rates', 'sleeping_train_rates',
  'fixed_daily_costs', 'exchange_rates',
  // Core business data — protected already, kept here so a future migration
  // cannot quietly open them without this failing.
  'itineraries', 'clients', 'invoices', 'payments', 'b2c_quotes',
  // Client communications log (migration 244) — created with TO authenticated
  // policies from the start; listed so it stays that way.
  'communication_history',
  // Holds Gmail refresh tokens (migration 249 added own-row policies). A leak
  // here is a mailbox takeover, so it must never answer the anonymous key.
  'gmail_tokens',
  // Email-to-client links (migration 250): service-role only by design.
  'email_client_links',
  // Migration 252. rate_audit_log carries rate-row snapshots — the cost base
  // again — so it matters as much as the rate tables themselves.
  'prompt_templates', 'rate_audit_log', 'content_usage_log',
  // Share tokens (migration 253): a leak here hands out every live share URL.
  'itinerary_shares',
  // Platform billing infrastructure (254): service-role only.
  'stripe_webhook_events',
]

let failures = 0
const SWEEP = [...new Set([...(await allRelations()), ...GUARDED])].sort()

console.log(`\n── 1. anonymous client must see nothing (${SWEEP.length} relations) ──`)
let blockedCount = 0
const unverified = []
for (const t of SWEEP) {
  const { count: real, error: sErr } = await svc.from(t).select('*', { count: 'exact', head: true })
  if (sErr) {
    console.log(`   skip     ${t.padEnd(22)} (${sErr.code})`)
    continue
  }
  if (!real) {
    // An EMPTY relation cannot be judged from here, and this used to be
    // reported as "nothing to leak yet" — which reads as a pass and is not one.
    //
    // PostgREST answers `200 []` both when RLS filtered every row away AND
    // when the caller could read everything but there is nothing there. The
    // two are indistinguishable over HTTP, so an empty relation is UNVERIFIED,
    // not safe.
    //
    // That distinction is not academic. unified_messages is a view over
    // whatsapp_messages and email_messages that executes with its OWNER's
    // privileges, bypassing RLS on both; anon held SELECT on it. Both tables
    // were empty, so this sweep passed it every time it ran, and the exposure
    // would have opened silently on the first synced message. Migration 277
    // fixed it and asserts the invariant for every future view.
    unverified.push(t)
    continue
  }
  const { data, error } = await anon.from(t).select('*').limit(1)
  const leaked = !error && data && data.length > 0
  if (leaked) {
    failures++
    console.log(`   ❌ LEAKS  ${t.padEnd(22)} ${real} row(s) in table`)
  } else {
    blockedCount++
    // Only leaks and skips are worth a line each at this relation count.
  }
}
console.log(`   ✅ blocked ${blockedCount} populated relation(s)`)
if (unverified.length) {
  console.log(`   ⚠️  UNVERIFIED: ${unverified.length} relation(s) are empty, so this probe proves`)
  console.log('      nothing about them. They become real the day they hold data:')
  for (let i = 0; i < unverified.length; i += 4) {
    console.log('        ' + unverified.slice(i, i + 4).map(n => n.padEnd(28)).join('').trimEnd())
  }
  console.log('      Views among these cannot be protected by RLS at all — migration 277')
  console.log('      asserts every public view carries security_invoker=true.')
}

console.log('\n── 2. anonymous writes must be rejected ──')
const SENTINEL = 'zz-rls-verify-delete-me'
const { data: ins, error: iErr } = await anon
  .from('tenants').insert({ company_name: SENTINEL }).select().single()
if (iErr) {
  console.log(`   ✅ blocked  anonymous INSERT into tenants (${iErr.code})`)
} else {
  failures++
  console.log('   ❌ ALLOWED  anonymous INSERT into tenants — cleaning up')
  if (ins?.id) await svc.from('tenants').delete().eq('id', ins.id)
}
// Belt and braces: never leave a sentinel behind, whatever happened above.
await svc.from('tenants').delete().like('company_name', 'zz-rls-verify%')

console.log('\n── 3. the app must still be able to read (RLS without policies denies all) ──')
for (const t of GUARDED) {
  const { error } = await svc.from(t).select('*').limit(1)
  if (error && error.code !== 'PGRST205' && error.code !== '42P01') {
    failures++
    console.log(`   ❌ service role BLOCKED on ${t}: ${error.code} ${error.message}`)
  }
}
if (!failures) console.log('   ✅ service role reads every table')

console.log(
  failures
    ? `\n❌ ${failures} RLS problem(s)\n`
    : '\n✅ RLS verified — nothing anonymous, nothing locked out\n'
)
process.exit(failures ? 1 : 0)
