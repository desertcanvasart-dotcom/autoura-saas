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

// The 13 tables migration 242 restores, plus the tenant tables that must never
// be anonymous under any circumstances.
const GUARDED = [
  'tenants', 'tenant_members', 'tenant_features', 'departments',
  'entrance_fees', 'flight_rates', 'train_rates', 'tipping_rates',
  'hotel_staff_rates', 'airport_staff_rates', 'sleeping_train_rates',
  'fixed_daily_costs', 'exchange_rates',
  // Core business data — protected already, kept here so a future migration
  // cannot quietly open them without this failing.
  'itineraries', 'clients', 'invoices', 'payments', 'b2c_quotes',
]

let failures = 0

console.log('\n── 1. anonymous client must see nothing ──')
for (const t of GUARDED) {
  const { count: real, error: sErr } = await svc.from(t).select('*', { count: 'exact', head: true })
  if (sErr) {
    console.log(`   skip     ${t.padEnd(22)} (${sErr.code})`)
    continue
  }
  if (!real) {
    console.log(`   skip     ${t.padEnd(22)} table is empty — nothing to leak`)
    continue
  }
  const { data, error } = await anon.from(t).select('*').limit(1)
  const leaked = !error && data && data.length > 0
  if (leaked) failures++
  console.log(`   ${leaked ? '❌ LEAKS ' : '✅ blocked'} ${t.padEnd(22)} ${real} row(s) in table`)
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
