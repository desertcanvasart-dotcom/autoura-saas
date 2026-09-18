// ============================================
// Is an itinerary fully priced?
// ============================================
// An itinerary's services are its own editable rows (itinerary_services), not
// a saved snapshot, so completeness is read from those rows: a service with no
// rate AND no cost is a gap. That is this app's standing rule — a blank rate is
// an unpriced hole, never a free service — and it is what a quote's unpriced
// lines become when it converts. Lines that only make a day read whole (a meal
// already inside the hotel rate) never become rows at all
// (lib/pricing/breakdown-order isBookableLine), so a zero row is always a gap.
// Filling the cost in on the itinerary clears it.
//
// Checked against production on 2026-09-18: there are no itinerary service
// rows at all yet, so no existing itinerary starts blocking.
//
// Ported from the sibling app (travel-ops-pro #449).

import type { SupabaseClient } from '@supabase/supabase-js'
import { quoteCompleteness, type QuoteCompleteness } from './quote-completeness'

export interface ItineraryServiceRow {
  service_name?: string | null
  rate_eur?: number | string | null
  total_cost?: number | string | null
  client_price?: number | string | null
  notes?: string | null
}

export interface ItineraryDayRow {
  day_number?: number | null
  services?: ItineraryServiceRow[] | null
}

const NO_COST = 'No cost entered. Fill it in on the itinerary before sending.'

const amount = (v: unknown): number => Number(v) || 0

/** The itinerary's rows in the same shape quoteCompleteness reads. */
export function itineraryServiceLines(days: readonly ItineraryDayRow[] | null | undefined) {
  const lines: Array<{ service_name: string; day_number: number | null; unpriced?: true; issue?: string }> = []
  for (const day of days ?? []) {
    for (const s of day.services ?? []) {
      // client_price counts: a service the operator priced for the client is
      // sold even when its supplier cost has not been entered yet.
      const unpriced = amount(s.rate_eur) === 0 && amount(s.total_cost) === 0 && amount(s.client_price) === 0
      lines.push({
        service_name: String(s.service_name ?? 'Service'),
        day_number: day.day_number ?? null,
        ...(unpriced
          ? { unpriced: true as const, issue: s.notes?.trim() ? `${NO_COST} ${s.notes.trim()}` : NO_COST }
          : {}),
      })
    }
  }
  return lines
}

export function itineraryCompleteness(days: readonly ItineraryDayRow[] | null | undefined): QuoteCompleteness {
  return quoteCompleteness(itineraryServiceLines(days))
}

export type ItineraryLinesResult =
  | { ok: true; completeness: QuoteCompleteness }
  | { ok: false; status: 404 | 503; error: string }

/**
 * The itinerary's lines, loaded from the database — never from a request body,
 * which the caller controls.
 *
 * FAILS CLOSED. If ownership or the services cannot be read, the result says
 * so and the delivery route refuses: answering "no lines" on a database error
 * would let the gate read as complete, so a transient failure could send an
 * incomplete itinerary with nobody overriding anything.
 */
export async function loadItineraryCompleteness(
  supabase: SupabaseClient,
  itineraryId: string | null | undefined,
  tenantId: string | null | undefined
): Promise<ItineraryLinesResult> {
  if (!itineraryId || !tenantId) return { ok: false, status: 404, error: 'Itinerary not found' }

  const { data: owned, error: ownedError } = await supabase
    .from('itineraries')
    .select('id')
    .eq('id', itineraryId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (ownedError) return { ok: false, status: 503, error: "Could not check this itinerary's services. Try again." }
  if (!owned) return { ok: false, status: 404, error: 'Itinerary not found' }

  const { data: days, error } = await supabase
    .from('itinerary_days')
    .select('day_number, services:itinerary_services(service_name, rate_eur, total_cost, client_price, notes)')
    .eq('itinerary_id', itineraryId)
  if (error) return { ok: false, status: 503, error: "Could not check this itinerary's services. Try again." }

  return { ok: true, completeness: itineraryCompleteness((days ?? []) as ItineraryDayRow[]) }
}
