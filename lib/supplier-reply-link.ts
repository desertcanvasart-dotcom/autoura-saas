// ============================================
// SUPPLIER REPLY LINK — the no-login boundary for suppliers
// ============================================
// docs/supplier-network/PLAN.md §5 step 4. The operator asks a supplier for a
// service from their OWN WhatsApp (D2): the message is pre-typed and carries
// this link. The supplier opens it — no login — and taps Accept, Decline, or
// names the car (plate) or guide, with an optional driver-of-the-day note
// (D1: the car is booked, never the driver). The token is the credential,
// like staff links (lib/staff-link.ts); it also expires the day after the
// service, because a supplier is outside the company.
//
// Everything that crosses to the page goes through toSupplierView: the
// service they are asked for, and nothing else of the trip — no other
// suppliers, no client price, no client contact details.

import { generateShareToken, isValidShareToken, str } from '@/lib/itinerary-share'
import { normalizeStatus, type ServiceBookingStatus } from '@/lib/bookings/service-booking-states'

export const generateReplyToken = generateShareToken
export const isValidReplyToken = isValidShareToken

/** The day after the service, end of day UTC; no date = no expiry yet. */
export function replyLinkExpiry(serviceDate: string | null | undefined): string | null {
  if (!serviceDate) return null
  const d = new Date(`${serviceDate.slice(0, 10)}T23:59:59Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString()
}

export function isLinkLive(link: { revoked_at?: string | null; expires_at?: string | null }, now: Date): boolean {
  if (link.revoked_at) return false
  if (link.expires_at && new Date(link.expires_at).getTime() < now.getTime()) return false
  return true
}

/** What the supplier is asked to name when they assign. */
export type AssignWhat = 'car' | 'guide' | 'none'
export function assignWhat(supplierType: string | null | undefined): AssignWhat {
  if (supplierType === 'transport') return 'car'
  if (supplierType === 'guide') return 'guide'
  return 'none'
}

export interface SupplierView {
  operatorName: string
  supplierName: string
  service: string
  serviceDate: string | null
  serviceTime: string | null
  pickup: string | null
  dropoff: string | null
  guests: number | null
  /** Lead traveller's name only — for the meeting sign. */
  clientName: string | null
  status: ServiceBookingStatus
  replyBy: string | null
  assign: AssignWhat
  plate: string | null
  guideName: string | null
  guidePhone: string | null
  driverNote: string | null
}

export function toSupplierView(
  tenant: Record<string, unknown>,
  booking: Record<string, unknown>,
  line: Record<string, unknown>,
): SupplierView {
  const service = [str(line.service_description), str(line.supplier_type)].find(Boolean) ?? 'Service'
  return {
    operatorName: str(tenant.company_name) ?? 'Your client',
    supplierName: str(line.supplier_name) ?? 'there',
    service,
    serviceDate: str(line.service_date),
    serviceTime: str(line.service_time)?.slice(0, 5) ?? null,
    pickup: str(line.pickup_location),
    dropoff: str(line.dropoff_location),
    guests: typeof line.pax === 'number' && line.pax > 0 ? line.pax : null,
    clientName: str(booking.client_name),
    status: normalizeStatus(str(line.status)),
    replyBy: str(line.reply_deadline),
    assign: assignWhat(str(line.supplier_type)),
    plate: str(line.assigned_vehicle_plate),
    guideName: str(line.assigned_guide_name),
    guidePhone: str(line.assigned_guide_phone),
    driverNote: str(line.driver_note),
  }
}

// ============================================
// What a tap does
// ============================================

export type SupplierAction =
  | { action: 'accept' }
  | { action: 'decline'; reason?: string | null }
  | { action: 'assign'; plate?: string | null; guide_name?: string | null; guide_phone?: string | null; driver_note?: string | null }

const clean = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''
  return s ? s.slice(0, max) : null
}

/** Pure: read and check the supplier's tap. */
export function parseSupplierAction(body: unknown, assign: AssignWhat):
  { ok: true; value: SupplierAction } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  if (b.action === 'accept') return { ok: true, value: { action: 'accept' } }
  if (b.action === 'decline') return { ok: true, value: { action: 'decline', reason: clean(b.reason, 500) } }
  if (b.action === 'assign') {
    const plate = clean(b.plate, 30)?.toUpperCase() ?? null
    const guideName = clean(b.guide_name, 255)
    const guidePhone = clean(b.guide_phone, 50)
    const driverNote = clean(b.driver_note, 500)
    if (assign === 'car' && !plate) return { ok: false, error: 'Please type the car’s plate number' }
    if (assign === 'guide' && !guideName) return { ok: false, error: 'Please type the guide’s name' }
    if (assign === 'none') return { ok: false, error: 'Nothing to name for this service — tap Accept' }
    return { ok: true, value: { action: 'assign', plate, guide_name: guideName, guide_phone: guidePhone, driver_note: driverNote } }
  }
  return { ok: false, error: 'Unknown answer' }
}

/** The status a tap moves the line to. */
export function targetStatus(a: SupplierAction): ServiceBookingStatus {
  return a.action === 'accept' ? 'accepted' : a.action === 'decline' ? 'declined' : 'assigned'
}

// ============================================
// The request message the operator sends from their own WhatsApp
// ============================================

function day(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export interface RequestMessageInput {
  supplierName?: string | null
  agency?: string | null
  service: string
  serviceDate?: string | null
  serviceTime?: string | null
  pickup?: string | null
  dropoff?: string | null
  guests?: number | null
  clientName?: string | null
  /** Hours to answer (4, or 1 within 48 h). */
  replyHours: number
  assign: AssignWhat
  url: string
}

export function buildServiceRequestMessage(m: RequestMessageInput): string {
  const first = m.supplierName?.trim().split(/\s+/)[0] || 'there'
  const lines: string[] = [`Hello ${first},`, '']
  lines.push(m.agency?.trim() ? `Booking request from ${m.agency.trim()}:` : 'Booking request:')
  lines.push(`🧾 ${m.service.trim()}`)
  if (m.serviceDate) lines.push(`📅 ${day(m.serviceDate)}${m.serviceTime ? ` at ${m.serviceTime.slice(0, 5)}` : ''}`)
  if (m.pickup?.trim()) lines.push(`📍 Pickup: ${m.pickup.trim()}`)
  if (m.dropoff?.trim()) lines.push(`🏁 Drop-off: ${m.dropoff.trim()}`)
  if (m.guests && m.guests > 0) lines.push(`👥 Guests: ${m.guests}`)
  if (m.clientName?.trim()) lines.push(`👤 Client: ${m.clientName.trim()}`)
  const name = m.assign === 'car' ? ' You can name the car (plate) there too.' : m.assign === 'guide' ? ' You can name the guide there too.' : ''
  lines.push('', `Please answer within ${m.replyHours} hour${m.replyHours === 1 ? '' : 's'} with one tap on this link (no login).${name}`, m.url)
  return lines.join('\n')
}

/** The "no longer needed" note for a supplier who was asked — sent from the office's own WhatsApp too. */
export function buildServiceCancelMessage(m: {
  supplierName?: string | null
  agency?: string | null
  service: string
  serviceDate?: string | null
  serviceTime?: string | null
}): string {
  const first = m.supplierName?.trim().split(/\s+/)[0] || 'there'
  const when = m.serviceDate ? ` on ${day(m.serviceDate)}${m.serviceTime ? ` at ${m.serviceTime.slice(0, 5)}` : ''}` : ''
  const from = m.agency?.trim() ? ` from ${m.agency.trim()}` : ''
  return [
    `Hello ${first},`,
    '',
    `The booking request${from} for ${m.service.trim()}${when} is no longer needed — please release it.`,
    'Thank you, and sorry for the change.',
  ].join('\n')
}
