#!/usr/bin/env node
// ============================================================================
// Pricing-grid smoke test — verifies the live runtime wiring of the pricing
// parity change against a real staging tenant. Node 18+ (uses global fetch).
//
// The pure pricing MATH is locked by vitest (pax-range / pricing-grid-multipax /
// golden-basket). This script covers what unit tests can't: the real HTTP
// routes + RLS + DB schema for ONE authenticated tenant.
//
// USAGE
//   BASE_URL=https://your-staging.example.com \
//   GRID_COOKIE='sb-xxxx-auth-token=...; sb-xxxx-auth-token.1=...' \
//   node scripts/smoke-pricing-grid.mjs              # read-only (rates shape)
//   SMOKE_WRITE=1 ... node scripts/smoke-pricing-grid.mjs   # + save round-trip
//
// Getting GRID_COOKIE: log into the app in a browser as a user of the tenant
// you want to test, open DevTools → Application → Cookies, and copy the
// `sb-*-auth-token*` cookie(s) as a single `name=value; name=value` string.
// (Read-only mode never writes; the save round-trip creates ONE draft
// itinerary — delete it from the UI afterward, or run against a scratch tenant.)
// ============================================================================

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const COOKIE = process.env.GRID_COOKIE || ''
const TIER = process.env.TIER || 'standard'
const DO_WRITE = process.env.SMOKE_WRITE === '1'

let passed = 0
let failed = 0
const ok = (m) => { passed++; console.log(`  \x1b[32m✓\x1b[0m ${m}`) }
const bad = (m) => { failed++; console.log(`  \x1b[31m✗ ${m}\x1b[0m`) }
function assert(cond, m) { cond ? ok(m) : bad(m) }

if (!COOKIE) {
  console.error('GRID_COOKIE is required (a logged-in session cookie). See the header of this file.')
  process.exit(2)
}

async function api(path, init = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE, ...(init.headers || {}) },
  })
  let body = null
  try { body = await res.json() } catch { /* non-JSON */ }
  return { status: res.status, body }
}

// ---------------------------------------------------------------------------
// 1. RATES — the dropdown source. Must be dual-passport and tier-encoded.
// ---------------------------------------------------------------------------
console.log(`\n▶ GET /api/pricing-grid/rates?tier=${TIER}  (tenant-scoped)`)
const rates = await api(`/api/pricing-grid/rates?tier=${TIER}`)
assert(rates.status === 200, `200 OK (got ${rates.status})`)
assert(rates.body?.success === true, 'success: true')

const data = rates.body?.data || {}
const EXPECTED_SLOTS = ['route', 'guide', 'airport_services', 'hotel_services', 'tipping',
  'boat_rides', 'accommodation', 'entrance_fees', 'flights', 'experiences', 'meals', 'water', 'cruise']
for (const k of EXPECTED_SLOTS) assert(Array.isArray(data[k]), `data.${k} is an array`)

const route = data.route || []
const tierEncoded = route.filter((o) => typeof o.id === 'string' && o.id.includes('__'))
assert(route.length === 0 || tierEncoded.length > 0,
  `transport options are tier-encoded (rowId__tier) — found ${tierEncoded.length}/${route.length}`)
const withCap = tierEncoded.filter((o) => o.capacity_min != null && o.capacity_max != null)
assert(tierEncoded.length === 0 || withCap.length > 0, 'tier-encoded transport carries capacity_min/max (drives per-pax vehicle re-selection)')

const dualOk = (arr) => arr.every((o) => typeof o.rateEur === 'number' && typeof o.rateNonEur === 'number')
assert(dualOk(data.accommodation || []), 'accommodation options carry rateEur AND rateNonEur')
assert(dualOk(data.entrance_fees || []), 'entrance_fees options carry rateEur AND rateNonEur')

const acc = (data.accommodation || [])[0]
const ent = (data.entrance_fees || [])[0]
const trn = tierEncoded[0] || route[0]
console.log(`    sample: acc=${acc?.name ?? '—'}  entrance=${ent?.name ?? '—'}  transport=${trn?.name ?? '—'}`)

// ---------------------------------------------------------------------------
// 2. SAVE round-trip (opt-in) — persists a tiny B2C quote and verifies the
//    server computed passport-aware costs and scoped them to the tenant.
// ---------------------------------------------------------------------------
if (DO_WRITE) {
  console.log(`\n▶ POST /api/pricing-grid/save  (SMOKE_WRITE=1 — creates ONE draft)`)
  if (!acc || !ent) {
    bad('need at least one accommodation + one entrance rate in this tenant to run the write test')
  } else {
    const pax = 2
    const passport = 'non_eu'
    const sel = (o) => ({ rateId: o.id, name: o.name, rateEur: o.rateEur, rateNonEur: o.rateNonEur })
    const days = [{
      id: 'smoke-d1', dayNumber: 1, title: 'Smoke Day', city: acc.city || 'Cairo',
      description: 'pricing-grid smoke test', isExpanded: true, dayType: 'tour',
      slots: [
        { slotId: 'accommodation', selectedItems: [sel(acc)], customAmount: 0 },
        { slotId: 'entrance_fees', selectedItems: [sel(ent)], customAmount: 0 },
        ...(trn ? [{ slotId: 'route', selectedItems: [sel(trn)], customAmount: 0 }] : []),
      ],
    }]
    const config = {
      pax, passport, tier: TIER, clientType: 'b2c', withGuide: false, currency: 'EUR',
      marginPercent: 25, exchangeRate: null, startDate: new Date().toISOString().split('T')[0],
      clientName: 'SMOKE TEST (delete me)', clientEmail: '', clientPhone: '',
      tourName: 'Pricing-grid smoke', nationality: '', itineraryId: null, itineraryCode: null,
      partnerId: null, partnerName: '', clientId: null,
    }
    // Expected supplier cost (non-EUR rates): accommodation is per-person (×pax),
    // entrance per-person (×pax), transport group (×1). Mirrors calculator.ts.
    const expectSupplier =
      (ent.rateNonEur * pax) + (acc.rateNonEur * pax) + (trn ? trn.rateNonEur : 0)
    const totals = { costPerPerson: 0, totalCost: 0, marginAmount: 0, sellingPricePerPerson: 0, sellingPriceTotal: 0 }

    const save = await api('/api/pricing-grid/save', { method: 'POST', body: JSON.stringify({ config, days, totals }) })
    assert(save.status === 200, `200 OK (got ${save.status}) ${save.status !== 200 ? JSON.stringify(save.body) : ''}`)
    assert(save.body?.success === true, 'success: true')
    assert(typeof save.body?.itineraryId === 'string', 'returns itineraryId')
    assert(save.body?.daysCreated >= 1, `daysCreated >= 1 (got ${save.body?.daysCreated})`)
    assert(save.body?.servicesCreated >= (trn ? 3 : 2), `servicesCreated >= ${trn ? 3 : 2} (got ${save.body?.servicesCreated})`)
    console.log(`    created draft itinerary ${save.body?.itineraryId} (${save.body?.itineraryCode}) — \x1b[33mdelete it from the UI\x1b[0m`)
    console.log(`    expected supplier cost ≈ €${expectSupplier.toFixed(2)} (non-EUR rates: acc×${pax} + entrance×${pax} + transport×1)`)
    console.log(`    → open /itineraries/${save.body?.itineraryId} and confirm services show non-zero costs and the header total is supplier×1.25`)
  }
} else {
  console.log('\n(skipping save round-trip — set SMOKE_WRITE=1 to also test persistence)')
}

console.log(`\n${failed === 0 ? '\x1b[32mPASS' : '\x1b[31mFAIL'}\x1b[0m — ${passed} passed, ${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
