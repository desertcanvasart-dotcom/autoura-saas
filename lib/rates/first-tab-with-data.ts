// ============================================
// Which tab should the Rates Hub open on?
// ============================================
// The hub always opened on Transportation. An account whose only rates were
// entrance fees saw "Total Services 1" in the header above an empty table
// reading "No rates found" — which looks broken and is merely the wrong tab
// (audit AUT-M01). The rule: open on the first tab, in tab-bar order, that
// has anything to show. Only the first paint is chosen for the user;
// clicking around is untouched.

export const RATES_TAB_ORDER = [
  'transportation', 'guides', 'entrances', 'accommodation', 'meals',
  'cruises', 'sleepingTrains', 'trains', 'airportStaff', 'hotelStaff', 'tipping',
] as const

export type RatesTab = (typeof RATES_TAB_ORDER)[number]

/** First tab with data, or null when every tab is empty (a brand-new
 *  install) — the caller keeps its default and the empty state shows. */
export function firstTabWithData(counts: Record<RatesTab, number>): RatesTab | null {
  return RATES_TAB_ORDER.find(tab => counts[tab] > 0) ?? null
}
