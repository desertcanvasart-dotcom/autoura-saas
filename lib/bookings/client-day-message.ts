// ============================================
// "Your car tomorrow" — the client's day details (Phase 1, last step)
// ============================================
// Operator, 2026-10-30: yes — the client gets the car, its plate and the
// driver's contact before the day. Sent like every other message here, from
// the office's OWN WhatsApp (D2): the text is pre-typed, a person sends it.
//
// What goes in: the day's service lines that are not Not needed, in time
// order, each with what the office set (time, pickup) and — once covered —
// the car's plate, the driver of the day and the guide. A line nobody has
// covered yet still shows its time and service, never a made-up car.
// No prices, no supplier names (the client deals with the agency).

import { lineService } from '@/lib/bookings/service-label'
import { isCovered, isCancelled } from '@/lib/bookings/service-booking-states'

export interface DayLine {
  id: string
  status: string | null
  service_date: string | null
  service_time: string | null
  service_description: string | null
  supplier_type: string | null
  pickup_location: string | null
  dropoff_location: string | null
  assigned_vehicle_plate: string | null
  assigned_guide_name: string | null
  assigned_guide_phone: string | null
  driver_note: string | null
}

const clean = (v: string | null | undefined) => (v ?? '').trim()

/** The day's lines for the client, in time order (untimed last). */
export function linesForDay(lines: DayLine[], date: string): DayLine[] {
  return lines
    .filter(l => !isCancelled(l.status) && (l.service_date ?? '').slice(0, 10) === date)
    .sort((a, b) => (clean(a.service_time) || '99').localeCompare(clean(b.service_time) || '99'))
}

/** The dates a booking has client-facing lines on, ascending. */
export function serviceDays(lines: DayLine[]): string[] {
  return [...new Set(lines.filter(l => !isCancelled(l.status) && l.service_date).map(l => (l.service_date as string).slice(0, 10)))].sort()
}

/** Has the day anything worth telling the client: a car, guide or driver named? */
export function dayHasDetails(lines: DayLine[]): boolean {
  return lines.some(l => isCovered(l.status) && !!(clean(l.assigned_vehicle_plate) || clean(l.assigned_guide_name) || clean(l.driver_note)))
}

function dayName(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}


export function buildClientDayMessage(m: {
  clientName?: string | null
  agency?: string | null
  date: string
  lines: DayLine[]
  /** "tomorrow" when the date is tomorrow; otherwise the date is named. */
  isTomorrow: boolean
}): string {
  const first = clean(m.clientName).split(/\s+/)[0] || 'there'
  const out: string[] = [`Hello ${first},`, '', m.isTomorrow ? `Here are your details for tomorrow, ${dayName(m.date)}:` : `Here are your details for ${dayName(m.date)}:`]
  for (const l of m.lines) {
    const what = lineService(l)
    const time = clean(l.service_time).slice(0, 5)
    out.push('', `${time ? `🕘 ${time} · ` : '• '}${what}`)
    if (clean(l.pickup_location)) out.push(`📍 Pickup: ${clean(l.pickup_location)}`)
    if (clean(l.dropoff_location)) out.push(`🏁 Drop-off: ${clean(l.dropoff_location)}`)
    if (isCovered(l.status)) {
      if (clean(l.assigned_vehicle_plate)) out.push(`🚗 Car: ${clean(l.assigned_vehicle_plate)}`)
      if (clean(l.driver_note)) out.push(`👤 Driver: ${clean(l.driver_note)}`)
      if (clean(l.assigned_guide_name)) out.push(`🧭 Guide: ${clean(l.assigned_guide_name)}${clean(l.assigned_guide_phone) ? ` (${clean(l.assigned_guide_phone)})` : ''}`)
    }
  }
  out.push('', `Have a wonderful day!${clean(m.agency) ? ` — ${clean(m.agency)}` : ''}`)
  return out.join('\n')
}

/** Tomorrow (UTC) as YYYY-MM-DD. */
export function tomorrowOf(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  return d.toISOString().slice(0, 10)
}

export const CLIENT_TOLD = 'client_told'
