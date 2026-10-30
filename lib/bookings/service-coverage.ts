// ============================================
// A trip's supplier coverage, for the operations calendar (step 6d)
// ============================================
// docs/supplier-network/PLAN.md §5 step 6: "assignments on the operations
// calendar". The calendar's items are trips (itineraries); own cars and
// guides already show there (itinerary_resources). This adds the trip's
// service lines: how many are covered, and which still need someone —
// flagged when one of those is within SOON_DAYS. Not needed lines don't count.

import { isCovered, isCancelled, normalizeStatus, STATUS_LABEL, type ServiceBookingStatus } from '@/lib/bookings/service-booking-states'

export const SOON_DAYS = 2

export interface CoverageLine {
  id: string
  booking_id: string
  status: string | null
  supplier_name: string | null
  supplier_type: string | null
  service_description: string | null
  service_date: string | null
  service_time: string | null
  resource_kind: string | null
  assigned_vehicle_plate: string | null
  assigned_guide_name: string | null
}

export interface TripCoverage {
  booking_id: string
  total: number
  covered: number
  waiting: number
  open: number
  /** An open or waiting line within SOON_DAYS of today. */
  attention: boolean
  lines: Array<{
    id: string
    date: string | null
    time: string | null
    what: string
    supplier: string
    status: ServiceBookingStatus
    label: string
    own: boolean
    named: string | null
  }>
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`)) / 86_400_000)
}

/** Lines grouped by trip (via the booking's itinerary), with counts. */
export function coverageByTrip(
  lines: CoverageLine[],
  itineraryOfBooking: Record<string, string>,
  today: string,
): Record<string, TripCoverage> {
  const out: Record<string, TripCoverage> = {}
  for (const l of lines) {
    if (isCancelled(l.status)) continue
    const trip = itineraryOfBooking[l.booking_id]
    if (!trip) continue
    const c = (out[trip] ??= { booking_id: l.booking_id, total: 0, covered: 0, waiting: 0, open: 0, attention: false, lines: [] })
    const status = normalizeStatus(l.status)
    c.total++
    if (isCovered(status)) c.covered++
    else if (status === 'requested') c.waiting++
    else c.open++
    if (!isCovered(status) && l.service_date) {
      const d = daysBetween(today, l.service_date)
      if (d >= 0 && d <= SOON_DAYS) c.attention = true
    }
    c.lines.push({
      id: l.id,
      date: l.service_date,
      time: l.service_time ? l.service_time.slice(0, 5) : null,
      what: (l.service_description || l.supplier_type || 'Service').trim(),
      supplier: (l.supplier_name || '').trim(),
      status,
      label: STATUS_LABEL[status],
      own: l.resource_kind === 'own',
      named: l.assigned_vehicle_plate || l.assigned_guide_name || null,
    })
  }
  for (const c of Object.values(out)) {
    c.lines.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || (a.time ?? '').localeCompare(b.time ?? ''))
  }
  return out
}
