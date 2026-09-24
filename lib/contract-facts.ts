// ============================================
// A travel contract's facts, read from the itinerary itself
// ============================================
// The contract page and the WhatsApp contract sender both filled these from
// fields an itinerary does not have (num_travelers, tour_name,
// parsed_data.duration, destinations) and then invented the rest: every
// contract read "Destinations: Cairo, Luxor, Aswan", "Total Duration: N/A",
// "Number of Travelers: persons" and a TC-2025- number (live 2026-09-24, a
// Cairo / Alexandria / Siwa trip in 2026). A legal document must state the
// trip that was sold — or leave the line blank, never make it up.

export interface ContractItinerary {
  id: string
  trip_name?: string | null
  num_adults?: number | null
  num_children?: number | null
  total_days?: number | null
  start_date?: string | null
  end_date?: string | null
}

export interface ContractDay {
  day_number?: number | null
  city?: string | null
  overnight_city?: string | null
}

/** TC-<year the contract is issued>-<first 8 of the itinerary id>. */
export function contractNumber(itineraryId: string, issuedAt: Date = new Date()): string {
  return `TC-${issuedAt.getFullYear()}-${itineraryId.slice(0, 8).toUpperCase()}`
}

export function contractTravelers(it: ContractItinerary): number | null {
  const n = (Number(it.num_adults) || 0) + (Number(it.num_children) || 0)
  return n > 0 ? n : null
}

/** "11 days" from the stored length, else from the dates; null if neither. */
export function contractDuration(it: ContractItinerary): string | null {
  let days = Number(it.total_days) || 0
  if (!days && it.start_date && it.end_date) {
    const ms = new Date(it.end_date).getTime() - new Date(it.start_date).getTime()
    if (Number.isFinite(ms) && ms >= 0) days = Math.round(ms / 86_400_000) + 1
  }
  if (!days) return null
  return `${days} day${days === 1 ? '' : 's'}`
}

/** The trip's cities in the order visited, each once — from its own days. */
export function contractDestinations(days: ContractDay[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const d of [...days].sort((a, b) => (a.day_number ?? 0) - (b.day_number ?? 0))) {
    for (const raw of [d.city, d.overnight_city]) {
      const city = (raw ?? '').trim()
      if (city && !seen.has(city.toLowerCase())) {
        seen.add(city.toLowerCase())
        out.push(city)
      }
    }
  }
  return out.join(', ')
}
