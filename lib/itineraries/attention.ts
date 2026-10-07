// ============================================
// A trip's "needs attention" list, built once for every screen
// ============================================
// The itinerary page shows the list; the itineraries list shows its count.
// Both build it HERE, from the same kinds of rows, so a trip that says
// "3 need attention" in the list shows those three when it is opened.
//
// The rules themselves are tripAttention's (lib/itineraries/trip-stage);
// this gathers their inputs: where the trip stands (status, booking,
// invoice, money from the P&L), the nights whose hotel or ship has left
// Rates, the cruise sailing notes, who is missing on which day
// (lib/itineraries/coverage) and the margin (lib/itineraries/margin).
// Pure: the page, the route and the tests share it.

import { resolveItineraryMargin } from '@/lib/itinerary-client-total'
import { tripCoverage, type CoverageAssignment, type CoverageDay, type CoverageRow } from './coverage'
import { actualMargin, quotedMargin, type ActualPnlLike } from './margin'
import { overnightProperty } from './overnight-property'
import { tripAttention, type Attention, type TripFacts } from './trip-stage'

export interface AttentionService {
  service_type?: string | null
  service_name?: string | null
  description?: string | null
  supplier_name?: string | null
  total_cost?: number | string | null
  client_price?: number | string | null
  /** Whether the night's hotel or ship is still in Rates (the days API; staff only). */
  property_rate_status?: 'on_file' | 'switched_off' | 'not_on_file' | null
}

export interface AttentionDay extends CoverageDay {
  services: AttentionService[]
}

export interface AttentionPnl extends ActualPnlLike {
  total_paid: number
}

export interface AttentionSource {
  itinerary: {
    status?: string | null
    start_date?: string | null
    end_date?: string | null
    currency?: string | null
    margin_percent?: number | null
  }
  /** YYYY-MM-DD, the agency's today. */
  today: string
  hasBooking: boolean
  hasInvoice: boolean
  /** The trip's P&L (lib/trip-pnl), or null when it has not loaded. */
  pnl: AttentionPnl | null
  days: AttentionDay[]
  /** The resource assignments; null until loaded — nothing is called missing before then. */
  assignments: CoverageAssignment[] | null
  /** Cruise boarding dates the ship does not sail (migration 382). */
  cruiseNotes: string[]
  /** tenants.min_margin_percent; null = no minimum. */
  minMarginPercent: number | null
}

export interface TripAttention {
  facts: TripFacts
  coverage: CoverageRow[]
  attention: Attention[]
}

export function buildTripAttention(src: AttentionSource): TripAttention {
  const { itinerary, pnl, days } = src
  const invoiced = pnl && pnl.invoice_count > 0 ? pnl.total_revenue : null
  const facts: TripFacts = {
    status: itinerary.status,
    hasBooking: src.hasBooking,
    hasInvoice: src.hasInvoice,
    invoiced,
    paid: invoiced != null && pnl ? pnl.total_paid : null,
    startDate: itinerary.start_date,
    endDate: itinerary.end_date,
    today: src.today,
  }
  const coverage = src.assignments ? tripCoverage(days, src.assignments) : []
  const q = quotedMargin(days.flatMap(d => d.services), resolveItineraryMargin(itinerary.margin_percent))
  const attention = tripAttention({
    ...facts,
    currency: itinerary.currency || 'EUR',
    cruiseNotes: src.cruiseNotes,
    staleNights: days.flatMap(day => {
      const property = overnightProperty(day.services)
      const status = day.services.find(sv => sv.property_rate_status)?.property_rate_status
      return property && (status === 'not_on_file' || status === 'switched_off')
        ? [{ day: day.day_number, property: property.name, switchedOff: status === 'switched_off' }]
        : []
    }),
    missingResources: coverage.filter(r => r.missing.length > 0).map(r => ({ label: r.label, days: r.missing })),
    minMarginPercent: src.minMarginPercent,
    quotedMarginPercent: q.supplierCost > 0 ? q.percent : null,
    actualMargin: actualMargin(pnl),
  })
  return { facts, coverage, attention }
}
