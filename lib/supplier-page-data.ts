// ============================================
// What a supplier sees from one agency — loaded once, shown twice
// ============================================
// The 2A per-agency page (/supplier/<token>) and the 2B signed-in inbox
// (/supplier-home) show the same thing for each agency: requests, upcoming
// and done jobs, days off, and what they are owed. Server only, service
// role, every read scoped to (tenant, supplier) — the caller has already
// proved the supplier may see this agency (an unrevoked link, or an
// approved sign-in claim).

import type { SupabaseClient } from '@supabase/supabase-js'
import { portalSections, toPortalLine, type PortalSections, type PortalSourceLine } from '@/lib/supplier-portal'
import type { DayOff } from '@/lib/supplier-days-off'
import { owedView, type OwedItem, type OwedSource } from '@/lib/supplier-owed'
import { lineService } from '@/lib/bookings/service-label'
import { agencyTimeZone } from '@/lib/agency-time'

const COLUMNS = 'id, booking_id, status, supplier_type, service_description, service_date, service_time, pickup_location, dropoff_location, pax, reply_deadline, assigned_vehicle_plate, assigned_guide_name, assigned_guide_phone, driver_note, resource_kind'

export interface SupplierAgencyData {
  operatorName: string
  supplierName: string
  /** The agency's clock, for deadlines (lib/agency-time). */
  timeZone: string
  sections: PortalSections
  daysOff: DayOff[]
  owed: { items: OwedItem[]; unpaid: Array<{ currency: string; amount: number }> }
}

export async function loadSupplierAgency(db: SupabaseClient, tenantId: string, supplierId: string, today: string): Promise<SupplierAgencyData | null> {
  const [{ data: tenant }, { data: supplier }, { data: rows }, { data: daysOff }, { data: expenses }] = await Promise.all([
    db.from('tenants').select('company_name, timezone, operating_country').eq('id', tenantId).maybeSingle(),
    db.from('suppliers').select('name, company_name').eq('id', supplierId).eq('tenant_id', tenantId).maybeSingle(),
    db.from('booking_supplier_status').select(COLUMNS)
      .eq('tenant_id', tenantId).eq('supplier_id', supplierId)
      .in('status', ['requested', 'accepted', 'assigned', 'done'])
      .neq('resource_kind', 'own')
      .limit(500),
    db.from('supplier_unavailable_days').select('day, note, marked_by')
      .eq('tenant_id', tenantId).eq('supplier_id', supplierId).gte('day', today).order('day').limit(200),
    // What they're owed: only expenses made from their service lines (lib/supplier-owed).
    db.from('expenses').select('id, amount, currency, status, expense_date, payment_date, booking_supplier_status_id')
      .eq('tenant_id', tenantId).eq('supplier_id', supplierId).not('booking_supplier_status_id', 'is', null)
      .in('status', ['pending', 'approved', 'paid']).order('expense_date', { ascending: false }).limit(300),
  ])
  if (!supplier) return null

  // The lead traveller's name, for the meeting sign — nothing else of the trip.
  const lines = (rows ?? []) as PortalSourceLine[]
  const bookingIds = [...new Set(lines.map(l => l.booking_id))]
  const { data: bookings } = bookingIds.length
    ? await db.from('bookings').select('id, itinerary_id').in('id', bookingIds).eq('tenant_id', tenantId)
    : { data: [] }
  const tripIds = (bookings ?? []).map(b => b.itinerary_id).filter(Boolean) as string[]
  const { data: trips } = tripIds.length ? await db.from('itineraries').select('id, client_name').in('id', tripIds) : { data: [] }
  const clientOf = (bookingId: string) => {
    const trip = (bookings ?? []).find(b => b.id === bookingId)?.itinerary_id
    return ((trips ?? []).find(t => t.id === trip)?.client_name as string | null) ?? null
  }

  // The service name of each expense's line (their own lines only).
  const expenseLineIds = [...new Set((expenses ?? []).map(e => e.booking_supplier_status_id as string))]
  const { data: expenseLines } = expenseLineIds.length
    ? await db.from('booking_supplier_status').select('id, service_description, supplier_type')
      .in('id', expenseLineIds).eq('tenant_id', tenantId).eq('supplier_id', supplierId)
    : { data: [] }
  const serviceOf = (id: string) => {
    const l = (expenseLines ?? []).find(x => x.id === id)
    return l ? lineService(l as { service_description: string | null; supplier_type: string | null }) : null
  }

  return {
    operatorName: (tenant?.company_name as string | null) ?? 'Your client',
    supplierName: ((supplier.name || supplier.company_name) as string | null) ?? 'Supplier',
    timeZone: agencyTimeZone(tenant?.timezone as string | null, tenant?.operating_country as string | null),
    sections: portalSections(lines.map(l => toPortalLine(l, clientOf(l.booking_id))), today),
    daysOff: (daysOff ?? []) as DayOff[],
    owed: owedView((expenses ?? []) as OwedSource[], serviceOf, today),
  }
}
