#!/usr/bin/env node
// ============================================================================
// One-time: put each night where its booked hotel is.
//
//   node scripts/cleanup-overnight-city.mjs                 (dry run)
//   node scripts/cleanup-overnight-city.mjs --apply
//   node scripts/cleanup-overnight-city.mjs --tenant <id>   (one company)
//
// The Pricing Grid saved each day's city — where the day is SPENT — as its
// overnight city too. A Cairo-based trip with a day trip to Alexandria said
// "Overnight in Alexandria" while the night's hotel was Mena House in Cairo
// (live ITN-S-2026-8987). New saves take the night from the hotel
// (lib/itineraries/overnight-city.ts); this corrects the days already saved.
//
// It changes a day ONLY when it can prove the night: the day carries an
// accommodation line pinned to a hotel row in Rates (rate_table
// 'accommodation_rates', migration 353) and that hotel's city differs from
// the day's overnight city. Cruise nights ("On board …") and days with no
// pinned hotel are left as they are.
// ============================================================================

import fs from 'fs'
import { pathToFileURL } from 'url'

const ON_BOARD = /^on board\b/i
const norm = s => String(s ?? '').trim().toLowerCase()

/**
 * The days to correct, from the rows read. Pure — the tests drive it.
 * lines   pinned accommodation lines { itinerary_day_id, rate_id }
 * days    those days { id, itinerary_id, day_number, overnight_city }
 * hotels  those hotel rows { id, city }
 */
export function planOvernightFixes({ lines, days, hotels }) {
  const hotelCity = new Map(hotels.map(h => [h.id, String(h.city ?? '').trim() || null]))
  // A day's night is its first pinned hotel line with a known city.
  const nightCity = new Map()
  for (const l of lines) {
    if (!l.itinerary_day_id || nightCity.has(l.itinerary_day_id)) continue
    const city = hotelCity.get(l.rate_id)
    if (city) nightCity.set(l.itinerary_day_id, city)
  }

  const fixes = []
  for (const d of days) {
    const city = nightCity.get(d.id)
    if (!city) continue
    if (ON_BOARD.test(String(d.overnight_city ?? ''))) continue
    if (norm(d.overnight_city) === norm(city)) continue
    fixes.push({ id: d.id, itinerary_id: d.itinerary_id, day_number: d.day_number, from: d.overnight_city ?? null, to: city })
  }
  return fixes.sort((a, b) => String(a.itinerary_id).localeCompare(String(b.itinerary_id)) || a.day_number - b.day_number)
}

// ── Running it ──────────────────────────────────────────────────────────────

const PAGE = 1000

async function readAll(build) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

async function readIn(build, column, ids) {
  const rows = []
  for (let i = 0; i < ids.length; i += 200) {
    rows.push(...await readAll(() => build().in(column, ids.slice(i, i + 200))))
  }
  return rows
}

async function main() {
  const APPLY = process.argv.includes('--apply')
  const tenantArg = process.argv.indexOf('--tenant')
  const TENANT = tenantArg > -1 ? process.argv[tenantArg + 1] : null
  if (tenantArg > -1 && !TENANT) {
    console.error('--tenant needs a tenant id')
    process.exit(1)
  }

  if (fs.existsSync('.env.local')) {
    for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
    }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(url, serviceKey)

  console.log(APPLY ? 'APPLYING changes\n' : 'DRY RUN — nothing will be changed. Re-run with --apply\n')

  const lines = await readAll(() => {
    let q = admin.from('itinerary_services')
      .select('id, itinerary_day_id, rate_id')
      .eq('rate_table', 'accommodation_rates')
      .not('rate_id', 'is', null)
      .not('itinerary_day_id', 'is', null)
      .order('id')
    if (TENANT) q = q.eq('tenant_id', TENANT)
    return q
  })
  if (lines.length === 0) {
    console.log('  ✓ no day carries a hotel line pinned to Rates — nothing to check.')
    return
  }
  const days = await readIn(
    () => admin.from('itinerary_days').select('id, itinerary_id, day_number, overnight_city').order('id'),
    'id', [...new Set(lines.map(l => l.itinerary_day_id))],
  )
  const hotels = await readIn(
    () => admin.from('accommodation_rates').select('id, city').order('id'),
    'id', [...new Set(lines.map(l => l.rate_id))],
  )

  const fixes = planOvernightFixes({ lines, days, hotels })
  const itineraries = fixes.length
    ? await readIn(() => admin.from('itineraries').select('id, itinerary_code').order('id'), 'id', [...new Set(fixes.map(f => f.itinerary_id))])
    : []
  const codeOf = new Map(itineraries.map(i => [i.id, i.itinerary_code]))

  console.log(`  ${days.length} day(s) with a hotel pinned to Rates checked; ${fixes.length} to correct:`)
  for (const f of fixes) {
    console.log(`    · ${codeOf.get(f.itinerary_id) ?? f.itinerary_id} day ${f.day_number}: ${f.from ?? '(none)'} → ${f.to}`)
  }

  if (!APPLY) return

  let skipped = 0
  for (const f of fixes) {
    // Only if the day still says what it said when read.
    let q = admin.from('itinerary_days').update({ overnight_city: f.to }).eq('id', f.id)
    q = f.from === null ? q.is('overnight_city', null) : q.eq('overnight_city', f.from)
    const { data, error } = await q.select('id')
    if (error) throw new Error(`day ${f.day_number} of ${codeOf.get(f.itinerary_id) ?? f.itinerary_id}: ${error.message}`)
    if (!data || data.length === 0) skipped++
  }
  if (skipped) console.log(`\n  ! ${skipped} day(s) changed while this ran — re-run to pick them up.`)
  console.log('\n  ✓ done.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
