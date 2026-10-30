// ============================================
// What a voucher learns from the service line (Supplier Network step 6c)
// ============================================
// A booking's service line (booking_supplier_status, one per itinerary
// service since migration 446) holds what the trip itself does not: the
// pickup time and place the office set, and — once the supplier accepted —
// the car's plate, the guide, and the driver of the day (D1: the car is
// booked, the driver is a note). The voucher shows them beside that line.
// Plate / guide / driver only from a covered line: an unanswered request's
// details are not yet anyone's word. Nothing is invented: no fact, no text.

import { isCovered, isCancelled } from '@/lib/bookings/service-booking-states'

export interface ServiceLineFacts {
  status: string | null
  service_time: string | null
  pickup_location: string | null
  dropoff_location: string | null
  assigned_vehicle_plate: string | null
  assigned_guide_name: string | null
  assigned_guide_phone: string | null
  driver_note: string | null
}

export const SERVICE_LINE_FACT_COLUMNS =
  'itinerary_service_id, status, service_time, pickup_location, dropoff_location, assigned_vehicle_plate, assigned_guide_name, assigned_guide_phone, driver_note, updated_at'

/** One line per itinerary service: the live (not Not needed) row, the latest if several. */
export function factsByService(
  rows: Array<ServiceLineFacts & { itinerary_service_id: string | null; updated_at?: string | null }>,
): Record<string, ServiceLineFacts> {
  const out: Record<string, ServiceLineFacts & { updated_at?: string | null }> = {}
  for (const r of rows) {
    if (!r.itinerary_service_id || isCancelled(r.status)) continue
    const have = out[r.itinerary_service_id]
    if (!have || (r.updated_at ?? '') > (have.updated_at ?? '')) out[r.itinerary_service_id] = r
  }
  return out
}

const clean = (v: string | null | undefined) => (v ?? '').trim()

/** The supplier's answer for the voucher: car, guide, driver — covered lines only. */
export function answerParts(f: ServiceLineFacts): string[] {
  if (!isCovered(f.status)) return []
  const parts: string[] = []
  if (clean(f.assigned_vehicle_plate)) parts.push(`Car ${clean(f.assigned_vehicle_plate)}`)
  if (clean(f.assigned_guide_name)) parts.push(`Guide ${clean(f.assigned_guide_name)}${clean(f.assigned_guide_phone) ? ` (${clean(f.assigned_guide_phone)})` : ''}`)
  if (clean(f.driver_note)) parts.push(`Driver: ${clean(f.driver_note)}`)
  return parts
}

/** Time, pickup, drop-off, then the answer — the text added to the voucher line's notes. */
export function lineFactsNote(f: ServiceLineFacts): string {
  const parts: string[] = []
  if (clean(f.service_time)) parts.push(clean(f.service_time).slice(0, 5))
  if (clean(f.pickup_location)) parts.push(`Pickup: ${clean(f.pickup_location)}`)
  if (clean(f.dropoff_location)) parts.push(`Drop-off: ${clean(f.dropoff_location)}`)
  parts.push(...answerParts(f))
  return parts.join(' · ')
}

/** The line's own notes with the facts after them. */
export function notesWithFacts(notes: string | null | undefined, f: ServiceLineFacts | undefined): string | null {
  const extra = f ? lineFactsNote(f) : ''
  const own = clean(notes)
  return [own, extra].filter(Boolean).join(' · ') || (notes ?? null)
}
