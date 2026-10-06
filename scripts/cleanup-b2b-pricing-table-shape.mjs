#!/usr/bin/env node
// ============================================================================
// One-time: give old B2B quotes the pricing table their pages can read.
//
//   node scripts/cleanup-b2b-pricing-table-shape.mjs                 (dry run)
//   node scripts/cleanup-b2b-pricing-table-shape.mjs --apply
//   node scripts/cleanup-b2b-pricing-table-shape.mjs --tenant <id>   (one company)
//
// Every page that shows a B2B quote — the quote, its list row, the email, the
// PDF, WhatsApp — reads pricing_table keyed by group size:
//
//     { "2": { pp, total } }
//
// Until app/pricing-grid/lib/b2b-rate-sheet.ts, a quote made from the Pricing
// Grid (by the grid's save, or by /api/b2b/quote-from-itinerary) stored it as
// a LIST of rows instead:
//
//     [{ pax: 2, cost_per_person, selling_per_person, total }]
//
// which those pages showed as one "0 pax" column with no price. This rewrites
// each such table in the keyed shape. The numbers do not change: each row
// keeps its own group size, total and per-person price. A table whose rows
// cannot all be read is LISTED for a person, never half-converted.
//
// It also LISTS, without changing anything, the duplicate quotes the grid
// made: with a partner picked, the grid's save made a quote ("Created via
// Pricing Grid") and the page then asked quote-from-itinerary for a second
// one for the same itinerary. A quote may already have gone to a partner,
// so deleting one is a person's call (Quotes → B2B → bulk delete).
// ============================================================================

import fs from 'fs'
import { pathToFileURL } from 'url'

export const GRID_SAVE_NOTE = 'Created via Pricing Grid'

const round2 = n => Math.round(n * 100) / 100

function usable(value) {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

/** One list row as a keyed entry, or why it cannot be read. */
function readRow(row) {
  if (!row || typeof row !== 'object') return { error: 'a row that is not an object' }
  const pax = usable(row.pax ?? row.numPax)
  if (pax == null || !Number.isInteger(pax)) return { error: 'a row with no whole group size' }
  const total = usable(row.total ?? row.sellingPrice ?? row.selling_price)
  if (total == null) return { error: `the ${pax}-pax row has no total` }
  const pp = usable(row.pp ?? row.selling_per_person ?? row.pricePerPerson) ?? round2(total / pax)
  return { pax, entry: { pp, total } }
}

/**
 * What the cleanup does, from the quotes it read. Pure — the tests drive it.
 * quotes: b2b_quotes rows { id, quote_number, itinerary_id, internal_notes, pricing_table }
 */
export function planQuoteTables(quotes) {
  const convert = []
  const unreadable = []

  for (const q of quotes) {
    const table = q.pricing_table
    // Keyed already, or empty: nothing a page misreads.
    if (!Array.isArray(table) || table.length === 0) continue
    const keyed = {}
    let error = null
    for (const row of table) {
      const read = readRow(row)
      if (read.error) { error = read.error; break }
      if (keyed[String(read.pax)]) { error = `two rows for ${read.pax} pax`; break }
      keyed[String(read.pax)] = read.entry
    }
    if (error) unreadable.push({ id: q.id, quote_number: q.quote_number, reason: error })
    else convert.push({ id: q.id, quote_number: q.quote_number, updated_at: q.updated_at ?? null, table: keyed })
  }

  // The grid's own quote beside another quote for the same itinerary.
  const byItinerary = new Map()
  for (const q of quotes) {
    if (!q.itinerary_id) continue
    const list = byItinerary.get(q.itinerary_id) ?? []
    list.push(q)
    byItinerary.set(q.itinerary_id, list)
  }
  const duplicates = []
  for (const [itineraryId, list] of byItinerary) {
    const gridSaves = list.filter(q => q.internal_notes === GRID_SAVE_NOTE)
    const others = list.filter(q => q.internal_notes !== GRID_SAVE_NOTE)
    if (gridSaves.length && others.length) {
      duplicates.push({
        itinerary_id: itineraryId,
        gridSave: gridSaves.map(q => q.quote_number),
        others: others.map(q => q.quote_number),
      })
    }
  }

  return { convert, unreadable, duplicates }
}

// ── Running it ──────────────────────────────────────────────────────────────

const PAGE = 1000

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

  const quotes = []
  for (let from = 0; ; from += PAGE) {
    let q = admin.from('b2b_quotes')
      .select('id, quote_number, itinerary_id, internal_notes, pricing_table, updated_at')
      .order('id')
      .range(from, from + PAGE - 1)
    if (TENANT) q = q.eq('tenant_id', TENANT)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    quotes.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }

  const plan = planQuoteTables(quotes)

  console.log(`  ${plan.convert.length} quote(s) to re-key:`)
  for (const c of plan.convert) {
    const sizes = Object.keys(c.table).join(', ')
    console.log(`    · ${c.quote_number ?? c.id}: ${sizes} pax`)
  }
  if (plan.unreadable.length) {
    console.log(`  ✗ ${plan.unreadable.length} quote(s) whose table cannot be read — LEFT AS THEY ARE, review by hand:`)
    for (const u of plan.unreadable) console.log(`    · ${u.quote_number ?? u.id}: ${u.reason}`)
  }
  if (plan.duplicates.length) {
    console.log(`  ! ${plan.duplicates.length} itinerary(ies) with a duplicate quote from the grid's save — not changed:`)
    for (const d of plan.duplicates) {
      console.log(`    · grid save ${d.gridSave.join(', ')} beside ${d.others.join(', ')}`)
    }
  }

  if (!APPLY) return

  let skipped = 0
  for (const c of plan.convert) {
    // Only if nobody changed the quote since it was read.
    let q = admin.from('b2b_quotes').update({ pricing_table: c.table }).eq('id', c.id)
    q = c.updated_at ? q.eq('updated_at', c.updated_at) : q.is('updated_at', null)
    const { data, error } = await q.select('id')
    if (error) throw new Error(`re-keying ${c.quote_number ?? c.id}: ${error.message}`)
    if (!data || data.length === 0) skipped++
  }
  if (skipped) console.log(`\n  ! ${skipped} quote(s) changed while this ran — re-run to pick them up.`)
  console.log('\n  ✓ done.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
