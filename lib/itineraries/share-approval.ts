// ============================================
// What an operator approved about a shared link's price
// ============================================
// A share link for an itinerary whose services have no cost is created only
// when the operator says "share anyway". The link records exactly which gaps
// that approval covered (migration 364). The public page re-checks on every
// view and shows the price only while every current gap is one of them — a
// service that loses its cost after the link went out withholds the price
// until the operator looks again.
//
// A gap is identified by its day and service name. Pure: no database.
//
// Ported from the sibling app (travel-ops-pro #450).

import type { QuoteGap, QuoteCompleteness } from '@/lib/pricing/quote-completeness'
import { checkAmountDeliverable } from '@/lib/pricing-guards'

export interface ApprovedGap {
  day: number | null
  name: string
}

function keyOf(g: { day?: unknown; name?: unknown }): string {
  const day = Number(g.day)
  return `${Number.isFinite(day) && day > 0 ? day : ''}|${String(g.name ?? '').trim().toLowerCase()}`
}

/** The record stored on the link: day and name only — the reason is not identity. */
export function toApprovedGaps(gaps: readonly QuoteGap[]): ApprovedGap[] {
  return gaps.map(g => ({ day: g.day ?? null, name: g.name }))
}

/**
 * Current gaps the stored approval does not cover. Anything unreadable covers
 * nothing. Counted, not merely matched: a day may hold two services with the
 * same name, and approving one must not cover a second one added later.
 */
export function unapprovedGaps(current: readonly QuoteGap[], approved: unknown): QuoteGap[] {
  const remaining = new Map<string, number>()
  for (const a of Array.isArray(approved) ? approved : []) {
    if (!a || typeof a !== 'object') continue
    const k = keyOf(a as Record<string, unknown>)
    remaining.set(k, (remaining.get(k) ?? 0) + 1)
  }
  return current.filter(g => {
    const k = keyOf(g)
    const left = remaining.get(k) ?? 0
    if (left === 0) return true
    remaining.set(k, left - 1)
    return false
  })
}

export type SharePriceDecision =
  | { show: true }
  | { show: false; reason: 'unchecked' | 'draft' | 'amount' | 'new_gaps'; gaps?: QuoteGap[] }

/**
 * May the public page show this itinerary's total? FAILS CLOSED: when the
 * services could not be read the price is withheld — the itinerary itself
 * still shows, so a traveller never sees an empty page.
 */
export function sharePriceDecision(input: {
  status: string | null | undefined
  totalCost: unknown
  currency: string | null | undefined
  /** null when the services could not be read. */
  completeness: QuoteCompleteness | null
  approvedGaps: unknown
}): SharePriceDecision {
  if (!input.completeness) return { show: false, reason: 'unchecked' }
  if (input.status === 'draft') return { show: false, reason: 'draft' }
  const amount = input.totalCost == null || input.totalCost === '' ? null : Number(input.totalCost)
  if (!checkAmountDeliverable(amount, { currency: input.currency }).ok) {
    return { show: false, reason: 'amount' }
  }
  const unapproved = unapprovedGaps(input.completeness.gaps, input.approvedGaps)
  if (unapproved.length > 0) return { show: false, reason: 'new_gaps', gaps: unapproved }
  return { show: true }
}
