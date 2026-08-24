// ============================================
// STAFF TAP-LINK — the no-login boundary
// ============================================
// A staff link is a credential-in-a-URL for one assignment: the driver or
// guide opens it, sees their trip, and taps checkpoints. Everything that
// crosses to that page goes through toStaffView below — the same allowlist
// discipline as the customer share page, because "staff" here means "anyone
// holding the link".
//
// What staff DO see: the trip's name and dates, their own assignment window,
// their own name, and the checkpoints already logged for their assignment.
// What staff do NOT see: prices, costs, internal notes, customer contact
// details, other assignments, or anything else on the itinerary.

import { generateShareToken, isValidShareToken, str } from '@/lib/itinerary-share'

export const generateStaffToken = generateShareToken
export const isValidStaffToken = isValidShareToken

/** The kinds a tap-link can log. 'note' is office-internal and excluded. */
export const STAFF_EVENT_KINDS = [
  'departed', 'en_route', 'arrived', 'picked_up', 'dropped_off',
  'checked_in', 'checked_out', 'completed', 'delayed',
] as const
export type StaffEventKind = (typeof STAFF_EVENT_KINDS)[number]

export interface StaffView {
  /** The agency's name — the header of the page. */
  operatorName: string
  tripTitle: string
  tripStart: string | null
  tripEnd: string | null
  /** This person's own assignment. */
  memberName: string
  assignmentStart: string | null
  assignmentEnd: string | null
  /** Checkpoints already logged for THIS assignment, newest first. */
  events: Array<{ kind: StaffEventKind; occurredAt: string }>
}

export function toStaffView(
  tenant: Record<string, unknown>,
  itinerary: Record<string, unknown>,
  resource: Record<string, unknown>,
  events: Array<Record<string, unknown>>
): StaffView {
  const out: StaffView = {
    operatorName: str(tenant.company_name) ?? 'Your agency',
    tripTitle: str(itinerary.trip_name) ?? 'Trip',
    tripStart: str(itinerary.start_date),
    tripEnd: str(itinerary.end_date),
    memberName: str(resource.resource_name) ?? 'Team member',
    assignmentStart: str(resource.start_date),
    assignmentEnd: str(resource.end_date),
    events: [],
  }
  for (const e of events ?? []) {
    const kind = STAFF_EVENT_KINDS.includes(e.event_kind as StaffEventKind)
      ? (e.event_kind as StaffEventKind)
      : null
    const occurredAt = str(e.occurred_at)
    if (!kind || !occurredAt) continue
    out.events.push({ kind, occurredAt })
  }
  out.events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  return out
}

// ============================================
// ASSIGNEE CONTACT — who holds this link's phone
// ============================================
// The office hands a tap-link to a person; the natural rail is their own
// WhatsApp (wa.me deep link — the OFFICE's phone sends, never our API, so
// there is no template approval and no auto-send risk). Resolution mirrors
// the staff tap route's actor resolution: person-types only — a hotel or
// restaurant is a venue, not a link-holder.

type ContactClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> }
    }
  }
}

export async function resolveAssigneeContact(
  supabase: ContactClient,
  resource: { resource_type?: string | null; resource_id?: string | null; resource_name?: string | null }
): Promise<{ name: string | null; phone: string | null } | null> {
  try {
    const type = resource?.resource_type
    const rid = resource?.resource_id
    if (!type || !rid) return null

    const pick = (row: Record<string, unknown> | null) => {
      if (!row) return null
      const phone = str(row.whatsapp) ?? str(row.phone)
      return { name: str(row.name) ?? str(resource.resource_name), phone }
    }

    if (type === 'driver') {
      const { data } = await supabase.from('team_members').select('name, phone, whatsapp').eq('id', rid).maybeSingle()
      return pick(data)
    }
    if (type === 'vehicle') {
      const { data: v } = await supabase.from('vehicles').select('default_driver_id, default_driver_name, default_driver_phone').eq('id', rid).maybeSingle()
      if (v && typeof v.default_driver_id === 'string') {
        const { data: tm } = await supabase.from('team_members').select('name, phone, whatsapp').eq('id', v.default_driver_id).maybeSingle()
        const picked = pick(tm)
        if (picked?.phone) return picked
      }
      if (!v) return null
      return { name: str(v.default_driver_name) ?? str(resource.resource_name), phone: str(v.default_driver_phone) }
    }
    if (type === 'guide') {
      // Guides live in the SUPPLIERS table (supplier_type='guide') — that is
      // what /api/guides serves and what assignment resource_ids reference.
      // The standalone guides table is legacy; check it second so old
      // assignment rows still resolve.
      const { data: sup } = await supabase
        .from('suppliers').select('name, phone, contact_phone, whatsapp').eq('id', rid).maybeSingle()
      if (sup) {
        const phone = str(sup.whatsapp) ?? str(sup.phone) ?? str(sup.contact_phone)
        return { name: str(sup.name) ?? str(resource.resource_name), phone }
      }
      const { data: legacy } = await supabase
        .from('guides').select('name, phone, whatsapp').eq('id', rid).maybeSingle()
      return pick(legacy)
    }
    const table = type === 'airport_staff' ? 'airport_staff'
      : type === 'hotel_staff' ? 'hotel_staff'
      : null
    if (!table) return null
    const { data } = await supabase.from(table).select('name, phone, whatsapp').eq('id', rid).maybeSingle()
    return pick(data)
  } catch {
    return null
  }
}
