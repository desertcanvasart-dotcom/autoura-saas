// A trip's client total, as the browser reads it: its services' client
// prices, else the stored total (itineraries.total_cost is a cache that can
// be 0 or stale). Shared by the invoice form and the "Create final invoice"
// button, so a final invoice starts from the same trip total its deposit did.

import { effectiveItineraryTotal, type PricedService } from '@/lib/itinerary-client-total'

export async function fetchItineraryClientTotal(itinerary: { id: string; total_cost?: number | null }): Promise<number> {
  try {
    const res = await fetch(`/api/itineraries/${itinerary.id}?include=days`)
    const json = await res.json()
    const data = json?.data ?? json
    const services = ((data?.itinerary_days ?? []) as Array<{ itinerary_services?: PricedService[] | null }>)
      .flatMap(d => d.itinerary_services ?? [])
    const stored = itinerary.total_cost ?? data?.total_cost
    return effectiveItineraryTotal({ total_cost: stored, margin_percent: data?.margin_percent }, services)
  } catch {
    return Number(itinerary.total_cost) || 0
  }
}
