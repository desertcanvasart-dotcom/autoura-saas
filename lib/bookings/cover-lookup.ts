// ============================================
// Who else could cover a service line — the database side
// ============================================
// The reads behind "Who covers it" (app/api/bookings/[id]/suppliers/[lineId]/
// cover) and the deadline job's "next to try" (app/api/cron/service-booking-
// deadlines). The rules themselves are pure, in lib/bookings/cover-options.
// Every read is scoped to the tenant, so the job may pass the admin client.

import type { SupabaseClient } from '@supabase/supabase-js'
import { SAME_SERVICE_KEYS, alternativeCost, rateColumns, type RateRow } from '@/lib/bookings/cover-options'

export interface CoverLine {
  id: string
  booking_id: string
  status: string | null
  supplier_type: string
  supplier_id: string | null
  supplier_name: string
  service_date: string | null
  quoted_cost: number | null
  itinerary_service_id: string | null
  itinerary_resource_id: string | null
}

export async function loadCoverLine(db: SupabaseClient, tenantId: string, bookingId: string, lineId: string) {
  const { data: line } = await db
    .from('booking_supplier_status')
    .select('id, booking_id, status, supplier_type, supplier_id, supplier_name, service_date, quoted_cost, itinerary_service_id, itinerary_resource_id')
    .eq('id', lineId)
    .eq('booking_id', bookingId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!line) return null
  const { data: svc } = line.itinerary_service_id
    ? await db.from('itinerary_services').select('rate_table, rate_id').eq('id', line.itinerary_service_id).maybeSingle()
    : { data: null }
  return { line: line as CoverLine, rateTable: (svc?.rate_table as string | null) ?? null, rateId: (svc?.rate_id as string | null) ?? null }
}

/** The pinned rate row and every same-sheet row that could be the same service. */
export async function loadSameServiceRates(db: SupabaseClient, tenantId: string, table: string | null, rateId: string | null) {
  if (!table || !rateId || !SAME_SERVICE_KEYS[table]) return { pinned: null, candidates: [] as RateRow[] }
  const cols = rateColumns(table)
  const { data: pinned } = await db.from(table).select(cols).eq('id', rateId).eq('tenant_id', tenantId).maybeSingle()
  if (!pinned) return { pinned: null, candidates: [] as RateRow[] }
  let q = db.from(table).select(cols).eq('tenant_id', tenantId).not('supplier_id', 'is', null)
  for (const k of SAME_SERVICE_KEYS[table]) {
    const v = (pinned as unknown as Record<string, unknown>)[k]
    q = v === null || v === undefined ? q.is(k, null) : q.eq(k, v as string)
  }
  const { data } = await q
  return { pinned: pinned as unknown as RateRow, candidates: (data ?? []) as unknown as RateRow[] }
}

export interface SupplierAlternative {
  supplier_id: string
  name: string
  cost: number | null
  no_cost_reason: string | null
  preferred: boolean
}

/** Suppliers with a rate for the same service, with what the line would cost there (cheapest first). */
export async function supplierAlternatives(
  db: SupabaseClient,
  tenantId: string,
  line: Pick<CoverLine, 'quoted_cost' | 'service_date'>,
  rateTable: string | null,
  rateId: string | null,
): Promise<SupplierAlternative[]> {
  const rates = await loadSameServiceRates(db, tenantId, rateTable, rateId)
  const supplierIds = [...new Set(rates.candidates.map(r => r.supplier_id).filter(Boolean) as string[])]
  if (supplierIds.length === 0) return []
  const { data: suppliers } = await db.from('suppliers').select('id, name, company_name').in('id', supplierIds).eq('tenant_id', tenantId)
  return (suppliers ?? []).map(s => {
    const c = alternativeCost(rateTable, line.quoted_cost, rates.pinned, rates.candidates, s.id as string, line.service_date)
    return {
      supplier_id: s.id as string,
      name: (s.name || s.company_name) as string,
      cost: c.ok ? c.cost : null,
      no_cost_reason: c.ok ? null : c.reason,
      preferred: rates.candidates.some(r => r.supplier_id === s.id && r.is_preferred === true),
    }
  }).sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity) || a.name.localeCompare(b.name))
}
