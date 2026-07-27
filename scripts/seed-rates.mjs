#!/usr/bin/env node
// ============================================================================
// Load operator rates into meal_rates / vehicles / guides.
// ============================================================================
//
//   node scripts/seed-rates.mjs rates.json            # dry run, validates only
//   node scripts/seed-rates.mjs rates.json --apply
//
// DRY RUN BY DEFAULT. Nothing is written without --apply.
//
// There is no default data in this file and there never should be. Every number
// here becomes a client's quoted price, and a plausible-looking invented rate is
// indistinguishable from a real one once it is in the table — which is the exact
// failure the hole mechanism (lib/ai/generation-holes.ts) exists to prevent.
// Seeding guesses would defeat it: rows would exist, no hole would fire, and
// generation would produce confident wrong prices instead of honest drafts.
//
// Column names are the REAL ones, verified against the live schema:
//   meal_rates  meal_type + tier + base_rate_eur   (NOT lunch_rate_eur/dinner_rate_eur)
//   vehicles    daily_rate + passenger_capacity    (NOT daily_rate_eur/capacity_min/max)
//   guides      daily_rate + languages + tier      (NOT daily_rate_eur)
//
// See rates.example.json for the shape.
// ============================================================================

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const TIERS = ['budget', 'standard', 'deluxe', 'luxury']
const MEAL_TYPES = ['lunch', 'dinner']

const file = process.argv[2]
const APPLY = process.argv.includes('--apply')

function die(msg) {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}

if (!file || file.startsWith('--')) {
  die('usage: node scripts/seed-rates.mjs <rates.json> [--apply]')
}
if (!fs.existsSync(file)) die(`no such file: ${file}`)

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) die('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required')

const supabase = createClient(url, key, { auth: { persistSession: false } })
const input = JSON.parse(fs.readFileSync(file, 'utf8'))

// ---------------------------------------------------------------------------
// Validation. A bad rate rejected here is a quote that never goes out wrong.
// ---------------------------------------------------------------------------
const errors = []
const rate = (v, where) => {
  const n = typeof v === 'string' ? Number(v) : v
  if (!Number.isFinite(n) || n <= 0) {
    errors.push(`${where}: rate must be a positive number, got ${JSON.stringify(v)}`)
    return null
  }
  return n
}

const meals = (input.meal_rates ?? []).map((m, i) => {
  const w = `meal_rates[${i}]`
  if (!MEAL_TYPES.includes(m.meal_type)) errors.push(`${w}: meal_type must be one of ${MEAL_TYPES.join('/')}`)
  if (!TIERS.includes(m.tier)) errors.push(`${w}: tier must be one of ${TIERS.join('/')}`)
  return { meal_type: m.meal_type, tier: m.tier, base_rate_eur: rate(m.base_rate_eur, w),
           restaurant_name: m.restaurant_name ?? null, city: m.city ?? null,
           per_person_rate: m.per_person_rate !== false, is_active: true }
})

const vehicles = (input.vehicles ?? []).map((v, i) => {
  const w = `vehicles[${i}]`
  if (!v.vehicle_type) errors.push(`${w}: vehicle_type is required`)
  if (!TIERS.includes(v.tier)) errors.push(`${w}: tier must be one of ${TIERS.join('/')}`)
  const cap = Number(v.passenger_capacity)
  if (!Number.isInteger(cap) || cap <= 0) errors.push(`${w}: passenger_capacity must be a positive integer`)
  return { vehicle_type: v.vehicle_type, tier: v.tier, passenger_capacity: cap,
           daily_rate: rate(v.daily_rate, w), name: v.name ?? v.vehicle_type,
           city: v.city ?? null, is_preferred: v.is_preferred === true, is_active: true }
})

const guides = (input.guides ?? []).map((g, i) => {
  const w = `guides[${i}]`
  if (!g.full_name) errors.push(`${w}: full_name is required`)
  if (!TIERS.includes(g.tier)) errors.push(`${w}: tier must be one of ${TIERS.join('/')}`)
  if (!Array.isArray(g.languages) || g.languages.length === 0) {
    errors.push(`${w}: languages must be a non-empty array, e.g. ["English"]`)
  }
  return { full_name: g.full_name, tier: g.tier, languages: g.languages,
           daily_rate: rate(g.daily_rate, w), half_day_rate: g.half_day_rate ?? null,
           city: g.city ?? null, is_preferred: g.is_preferred === true, is_active: true }
})

if (errors.length) {
  console.error(`\n✗ ${errors.length} problem(s):`)
  for (const e of errors) console.error(`   ${e}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Coverage report — what generation will and will not be able to price.
// ---------------------------------------------------------------------------
console.log(`\n${APPLY ? 'APPLYING' : 'DRY RUN'} — ${meals.length} meal, ${vehicles.length} vehicle, ${guides.length} guide row(s)\n`)

console.log('coverage by tier:')
for (const t of TIERS) {
  const lunch = meals.some(m => m.tier === t && m.meal_type === 'lunch')
  const dinner = meals.some(m => m.tier === t && m.meal_type === 'dinner')
  const veh = vehicles.filter(v => v.tier === t)
  const gds = guides.filter(g => g.tier === t)
  const caps = veh.map(v => v.passenger_capacity).sort((a, b) => a - b)
  const ok = lunch && dinner && veh.length && gds.length
  console.log(
    `  ${ok ? '✅' : '⚠️ '} ${t.padEnd(9)} lunch:${lunch ? 'y' : 'n'} dinner:${dinner ? 'y' : 'n'} ` +
    `vehicles:${veh.length}${caps.length ? ` (seats ${caps.join(',')})` : ''} guides:${gds.length}` +
    `${gds.length ? ` [${[...new Set(gds.flatMap(g => g.languages))].join(', ')}]` : ''}`
  )
}
console.log('\n  A tier missing anything above will still generate — it just stays an unpriced draft.')

if (!APPLY) {
  console.log('\nDry run — nothing written. Re-run with --apply.')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Write. tenant_id is set explicitly: this runs as service_role, which has no
// auth.uid(), so the auto_set_tenant_id trigger cannot resolve it (migration
// 245's note). Rows are replaced per tenant so a re-run is idempotent rather
// than duplicating.
// ---------------------------------------------------------------------------
const { data: tenants, error: tErr } = await supabase.from('tenants').select('id, company_name')
if (tErr) die(`cannot read tenants: ${tErr.message}`)

const only = input.tenant_id ? tenants.filter(t => t.id === input.tenant_id) : tenants
if (!only.length) die('no matching tenant — check tenant_id in the input file')

for (const tenant of only) {
  console.log(`\n${tenant.company_name}:`)
  for (const [table, rows] of [['meal_rates', meals], ['vehicles', vehicles], ['guides', guides]]) {
    if (!rows.length) { console.log(`  ${table}: nothing supplied — left untouched`); continue }
    const { error: delErr } = await supabase.from(table).delete().eq('tenant_id', tenant.id)
    if (delErr) die(`clearing ${table} for ${tenant.company_name}: ${delErr.message}`)
    const { error: insErr } = await supabase.from(table)
      .insert(rows.map(r => ({ ...r, tenant_id: tenant.id })))
    if (insErr) die(`writing ${table} for ${tenant.company_name}: ${insErr.message}`)
    console.log(`  ${table}: ${rows.length} row(s)`)
  }
}

console.log('\n✅ done. Generate an itinerary to confirm it now prices.')
