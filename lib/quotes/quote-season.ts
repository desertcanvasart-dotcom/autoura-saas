// ============================================
// The seasonal premium a quote's departure falls in
// ============================================
// Settings → Seasonal Premiums: a dated window adds its percentage to the
// selling price, after margin, matched by the DEPARTURE date; overlapping
// windows take the higher. The B2B Calculator applied it; B2C quotes — from
// the Quote Builder, from an itinerary, or edited — did not. They all ask
// here now, so every quote prices a peak departure the same way.

import { loadSeasonWindows } from '@/lib/auto-pricing-service'
import { seasonForDate } from '@/lib/pricing/season-uplift'

export interface QuoteSeason {
  season_name: string | null
  season_percent: number
}

export const NO_SEASON: QuoteSeason = { season_name: null, season_percent: 0 }

/** The premium for a departure date, or none (no date, no calendar, ordinary date). */
export async function quoteSeasonFor(tenantId: string | null | undefined, departureDate: string | null | undefined): Promise<QuoteSeason> {
  if (!tenantId || !departureDate) return NO_SEASON
  try {
    const windows = await loadSeasonWindows(tenantId, departureDate)
    const match = seasonForDate(windows, departureDate)
    return match && match.upliftPercent > 0
      ? { season_name: match.name || null, season_percent: match.upliftPercent }
      : NO_SEASON
  } catch (e) {
    // A calendar that cannot be read must not stop a quote being saved; it
    // is priced as an ordinary departure and the failure is logged.
    console.error('quoteSeasonFor failed:', e instanceof Error ? e.message : e)
    return NO_SEASON
  }
}
