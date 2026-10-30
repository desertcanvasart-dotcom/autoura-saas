// ============================================
// The supplier's own page (Supplier Network Phase 2A)
// ============================================
// docs/supplier-network/PLAN.md §6 stage 2A. One standing link per supplier
// per agency (migration 449): the supplier sees that agency's requests to
// them, their upcoming jobs (and can change the car or driver up to the day),
// and their done jobs. The token is the credential, like the reply links;
// everything shown goes through toPortalLine — no client price, no client
// contacts beyond the lead traveller's name, nothing of other suppliers.

import { generateShareToken, isValidShareToken } from '@/lib/itinerary-share'
import { normalizeStatus, type ServiceBookingStatus } from '@/lib/bookings/service-booking-states'
import { assignWhat, type AssignWhat } from '@/lib/supplier-reply-link'

export const generateSupplierPageToken = generateShareToken
export const isValidSupplierPageToken = isValidShareToken

/** How far back the Done section looks. */
export const DONE_DAYS = 60

export interface PortalSourceLine {
  id: string
  booking_id: string
  status: string | null
  supplier_type: string | null
  service_description: string | null
  service_date: string | null
  service_time: string | null
  pickup_location: string | null
  dropoff_location: string | null
  pax: number | null
  reply_deadline: string | null
  assigned_vehicle_plate: string | null
  assigned_guide_name: string | null
  assigned_guide_phone: string | null
  driver_note: string | null
  resource_kind: string | null
}

export interface PortalLine {
  id: string
  status: ServiceBookingStatus
  service: string
  date: string | null
  time: string | null
  pickup: string | null
  dropoff: string | null
  guests: number | null
  clientName: string | null
  replyBy: string | null
  assign: AssignWhat
  plate: string | null
  guideName: string | null
  guidePhone: string | null
  driverNote: string | null
}

const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export function toPortalLine(l: PortalSourceLine, clientName: string | null): PortalLine {
  return {
    id: l.id,
    status: normalizeStatus(l.status),
    service: s(l.service_description) ?? s(l.supplier_type) ?? 'Service',
    date: s(l.service_date)?.slice(0, 10) ?? null,
    time: s(l.service_time)?.slice(0, 5) ?? null,
    pickup: s(l.pickup_location),
    dropoff: s(l.dropoff_location),
    guests: typeof l.pax === 'number' && l.pax > 0 ? l.pax : null,
    clientName: s(clientName),
    replyBy: s(l.reply_deadline),
    assign: assignWhat(l.supplier_type),
    plate: s(l.assigned_vehicle_plate),
    guideName: s(l.assigned_guide_name),
    guidePhone: s(l.assigned_guide_phone),
    driverNote: s(l.driver_note),
  }
}

export interface PortalSections {
  requests: PortalLine[]
  upcoming: PortalLine[]
  done: PortalLine[]
}

const byDate = (a: PortalLine, b: PortalLine) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || (a.time ?? '99').localeCompare(b.time ?? '99')

/**
 * Waiting for their answer → Requests; covered and not past → Upcoming;
 * done (or covered and past) within DONE_DAYS → Done. Lines the agency
 * covers itself, Not needed, declined or unanswered-in-time lines: not shown.
 */
export function portalSections(lines: PortalLine[], today: string): PortalSections {
  const since = new Date(`${today}T00:00:00Z`)
  since.setUTCDate(since.getUTCDate() - DONE_DAYS)
  const doneFrom = since.toISOString().slice(0, 10)
  const out: PortalSections = { requests: [], upcoming: [], done: [] }
  for (const l of lines) {
    const past = l.date !== null && l.date < today
    if (l.status === 'requested') { if (!past) out.requests.push(l); continue }
    if (l.status === 'accepted' || l.status === 'assigned') { (past ? out.done : out.upcoming).push(l); continue }
    if (l.status === 'done' && (l.date ?? '') >= doneFrom) out.done.push(l)
  }
  out.requests.sort(byDate)
  out.upcoming.sort(byDate)
  out.done.sort((a, b) => byDate(b, a))
  return out
}

/** The office's WhatsApp text that sends the supplier their page. */
export function buildPortalLinkMessage(m: { supplierName?: string | null; agency?: string | null; url: string }): string {
  const first = m.supplierName?.trim().split(/\s+/)[0] || 'there'
  const from = m.agency?.trim() || 'us'
  return [
    `Hello ${first},`,
    '',
    `This is your page for bookings from ${from}: every request we send you, your upcoming jobs, and the car or guide for each — answer with one tap, no login.`,
    'Please keep it — it is the same link every time.',
    m.url,
  ].join('\n')
}
