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
