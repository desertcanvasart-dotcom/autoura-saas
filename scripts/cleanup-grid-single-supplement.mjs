#!/usr/bin/env node
// ============================================================================
// One-time: remove the single supplement the Pricing Grid wrongly saved.
//
//   node scripts/cleanup-grid-single-supplement.mjs                 (dry run)
//   node scripts/cleanup-grid-single-supplement.mjs --apply
//   node scripts/cleanup-grid-single-supplement.mjs --tenant <id>   (one company)
//
// Picking a hotel with a single supplement puts a "Single Supplement" item in
// the grid's accommodation row. The grid charges it only to a party of one,
// but until app/pricing-grid/lib/single-supplement.ts the save wrote it for
// EVERY party, × pax. So a 2-pax trip carries a line
//   "[pricing-grid:accommodation] Single Supplement", quantity 2
// that its quote never charged. The trip's price (itineraries.total_cost, the
// quote) came from the grid's own totals and is right; what is wrong is
// everything built from the service LINES:
//
//   1. the line itself — on the itinerary, its documents and share page;
//   2. itineraries.supplier_cost / profit, where an FX re-price summed the
//      lines (reprice-fx) — re-summed here from the lines that stay;
//   3. a booking's supplier list, which made the line its own supplier row
//      named "Single Supplement" (lib/bookings/booking-suppliers.ts).
//
// This removes 1, corrects 2, and removes the rows of 3 that are still
// pending with no expense. A supplier row that was confirmed, costed or has
// an expense is money someone acted on — it is LISTED for a person to review,
// never changed here.
//
// A line saved for a party of one (quantity 1) was charged and is kept.
// ============================================================================

import fs from 'fs'
import { pathToFileURL } from 'url'

export const SUPPLEMENT_TAG = '[pricing-grid:accommodation] Single Supplement'
const SUPPLEMENT_NAME = 'single supplement'

const round2 = n => Math.round(n * 100) / 100

/**
 * What the cleanup does, from the rows it read. Pure — the tests drive it.
 *
 * services     every itinerary_services row of the itineraries concerned
 * itineraries  those itineraries
 * supplierRows booking_supplier_status rows of those itineraries' bookings
 *              (each with its booking's itinerary_id)
 * expenses     expenses tied to those supplier rows
 */
export function planCleanup({ services, itineraries, supplierRows, expenses }) {
  // Saved for more than one traveller = never charged.
  const wrong = services.filter(s => s.description === SUPPLEMENT_TAG && Number(s.quantity) > 1)

  const removedByItinerary = new Map()
  for (const s of wrong) {
    removedByItinerary.set(s.itinerary_id, (removedByItinerary.get(s.itinerary_id) ?? 0) + (Number(s.total_cost) || 0))
  }

  // supplier_cost is a sum of the lines only where an FX re-price wrote it;
  // where it is unset the grid's own profit stands. Re-summed from the lines
  // that stay (as reprice-fx sums them), so a second run changes nothing.
  const wrongIds = new Set(wrong.map(s => s.id))
  const kept = new Map()
  for (const s of services) {
    if (wrongIds.has(s.id)) continue
    kept.set(s.itinerary_id, (kept.get(s.itinerary_id) ?? 0) + (Number(s.total_cost) || 0))
  }
  const itineraryUpdates = []
  for (const it of itineraries) {
    if (!removedByItinerary.has(it.id) || !(Number(it.supplier_cost) > 0)) continue
    const supplierCost = round2(kept.get(it.id) ?? 0)
    itineraryUpdates.push({
      id: it.id,
      supplier_cost: supplierCost,
      profit: round2((Number(it.total_cost) || 0) - supplierCost),
    })
  }

  const withExpense = new Set(expenses.map(e => e.booking_supplier_status_id))
  const deleteSupplierRowIds = []
  const reviewSupplierRows = []
  for (const r of supplierRows) {
    if (!removedByItinerary.has(r.itinerary_id)) continue
    if (r.supplier_id || (r.supplier_name ?? '').trim().toLowerCase() !== SUPPLEMENT_NAME) continue
    const reasons = []
    if (r.status && r.status !== 'pending') reasons.push(`status ${r.status}`)
    if (r.confirmed_cost != null) reasons.push(`confirmed cost ${r.confirmed_cost}`)
    if (withExpense.has(r.id)) reasons.push('has an expense')
    if (reasons.length) reviewSupplierRows.push({ ...r, reason: reasons.join(', ') })
    else deleteSupplierRowIds.push(r.id)
  }

  return {
    deleteServiceIds: wrong.map(s => s.id),
    removedByItinerary,
    itineraryUpdates,
    deleteSupplierRowIds,
    reviewSupplierRows,
  }
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

/** `.in()` on a few hundred ids at a time — a long list overflows the URL. */
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

  const tagged = await readAll(() => {
    let q = admin.from('itinerary_services')
      .select('id, itinerary_id, quantity')
      .eq('description', SUPPLEMENT_TAG)
      .gt('quantity', 1)
      .order('id')
    if (TENANT) q = q.eq('tenant_id', TENANT)
    return q
  })
  const itineraryIds = [...new Set(tagged.map(s => s.itinerary_id))]
  if (itineraryIds.length === 0) {
    console.log('  ✓ no itinerary carries an uncharged single supplement — nothing to do.')
    return
  }

  const services = await readIn(
    () => admin.from('itinerary_services').select('id, itinerary_id, description, quantity, total_cost').order('id'),
    'itinerary_id', itineraryIds,
  )
  const itineraries = await readIn(
    () => admin.from('itineraries').select('id, itinerary_code, total_cost, supplier_cost, profit').order('id'),
    'id', itineraryIds,
  )
  const bookings = await readIn(
    () => admin.from('bookings').select('id, itinerary_id, booking_number').order('id'),
    'itinerary_id', itineraryIds,
  )
  const bookingById = new Map(bookings.map(b => [b.id, b]))
  const supplierRows = (await readIn(
    () => admin.from('booking_supplier_status')
      .select('id, booking_id, supplier_id, supplier_name, supplier_type, service_date, status, quoted_cost, confirmed_cost')
      .order('id'),
    'booking_id', bookings.map(b => b.id),
  )).map(r => ({ ...r, itinerary_id: bookingById.get(r.booking_id)?.itinerary_id }))
  const expenses = await readIn(
    () => admin.from('expenses').select('id, booking_supplier_status_id').order('id'),
    'booking_supplier_status_id', supplierRows.map(r => r.id),
  )

  const plan = planCleanup({ services, itineraries, supplierRows, expenses })

  const codeOf = new Map(itineraries.map(i => [i.id, i.itinerary_code]))
  console.log(`  ${plan.deleteServiceIds.length} supplement line(s) on ${plan.removedByItinerary.size} itinerary(ies) to remove:`)
  for (const [id, amount] of plan.removedByItinerary) {
    console.log(`    · ${codeOf.get(id) ?? id}: ${round2(amount)}`)
  }
  console.log(`  ${plan.itineraryUpdates.length} itinerary(ies) whose supplier cost / profit summed the line:`)
  for (const u of plan.itineraryUpdates) {
    console.log(`    · ${codeOf.get(u.id) ?? u.id}: supplier cost → ${u.supplier_cost}, profit → ${u.profit}`)
  }
  console.log(`  ${plan.deleteSupplierRowIds.length} pending "Single Supplement" booking supplier row(s) to remove.`)
  if (plan.reviewSupplierRows.length) {
    console.log(`  ✗ ${plan.reviewSupplierRows.length} booking supplier row(s) someone acted on — LEFT AS THEY ARE, review by hand:`)
    for (const r of plan.reviewSupplierRows) {
      const b = bookingById.get(r.booking_id)
      console.log(`    · booking ${b?.booking_number ?? r.booking_id}, ${r.service_date ?? 'no date'}: ${r.reason}`)
    }
  }

  if (!APPLY) return

  // The lines go LAST: until they do, a re-run after a failure finds the same
  // itineraries again, and every step before is safe to repeat.
  for (let i = 0; i < plan.deleteSupplierRowIds.length; i += 200) {
    const { error } = await admin.from('booking_supplier_status').delete()
      .in('id', plan.deleteSupplierRowIds.slice(i, i + 200)).or('status.is.null,status.eq.pending')
    if (error) throw new Error(`removing booking supplier rows: ${error.message}`)
  }
  for (const u of plan.itineraryUpdates) {
    const { error } = await admin.from('itineraries')
      .update({ supplier_cost: u.supplier_cost, profit: u.profit, updated_at: new Date().toISOString() })
      .eq('id', u.id)
    if (error) throw new Error(`correcting itinerary ${codeOf.get(u.id) ?? u.id}: ${error.message}`)
  }
  for (let i = 0; i < plan.deleteServiceIds.length; i += 200) {
    const { error } = await admin.from('itinerary_services').delete()
      .in('id', plan.deleteServiceIds.slice(i, i + 200)).eq('description', SUPPLEMENT_TAG)
    if (error) throw new Error(`removing supplement lines: ${error.message}`)
  }
  console.log('\n  ✓ done.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
