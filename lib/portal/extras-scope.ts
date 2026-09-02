// ============================================
// What a portal link may see, and answer, about extras
// ============================================
// Ported verbatim from travel-ops-pro (lib/portal/extras-scope.ts). The whole
// of the portal's authority over options and upgrades, as pure functions.
//
// A booking-level (family) link is the lead's: it sees the party's extras and
// each traveller's. A private per-traveller link is ONE PERSON'S and sees only
// their own — the same rule the traveller forms already follow.

import { lineAmount, type BookingExtraLine } from '@/lib/booking-extras'

/** Statuses a traveller is shown. `declined` and `withdrawn` are closed
 *  business; listing them would invite "why was this refused?" on a page
 *  with nobody there to answer it. */
export const PORTAL_VISIBLE_STATUSES = ['requested', 'offered', 'accepted', 'confirmed'] as const

export interface PortalLinkScope {
  /** NULL = the booking-level link. Set = one traveller's private link. */
  passenger_id: string | null
}

/** May this link answer for this extra? Without the second half, one
 *  traveller's private link could accept a charge on somebody else's behalf. */
export function mayAnswerExtra(link: PortalLinkScope, extra: { passenger_id: string | null }): boolean {
  if (!link.passenger_id) return true
  return extra.passenger_id === link.passenger_id
}

export interface PortalExtraView {
  id: string
  kind: string
  title: string
  description: string | null
  quantity: number
  status: string
  currency: string | null
  /** What this LINE comes to. Null when unpriced — never zero. */
  amount: number | null
}

/** The shape a traveller is sent: no unit price, no supplier cost, no
 *  supplier, no invoice link, no internal notes. */
export function portalExtraView(
  extra: BookingExtraLine & { kind?: string | null; description?: string | null; passenger_id?: string | null }
): PortalExtraView {
  return {
    id: extra.id,
    kind: extra.kind === 'upgrade' ? 'upgrade' : 'addon',
    title: extra.title,
    description: extra.description ?? null,
    quantity: Math.max(1, Math.floor(Number(extra.quantity)) || 1),
    status: extra.status,
    currency: extra.currency ?? null,
    amount: lineAmount(extra),
  }
}
