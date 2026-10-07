// ============================================
// An itinerary as the view page can render it
// ============================================
// The view page treats these fields as always-present strings and numbers —
// `client_name.replace(...)`, `status.charAt(0)`, `total_cost.toFixed(2)` —
// but the database allows them empty. The Pricing Grid saves an itinerary
// with no client name (a B2B programme, or the name left blank) as NULL, and
// "View itinerary" then crashed the whole page with "This page couldn't load"
// (live 2026-10-04). Empty values are given their neutral form here, once,
// as the data arrives — not patched at each of the many places that read it.

const text = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : v === null || v === undefined ? fallback : String(v)

const num = (v: unknown, fallback = 0): number => {
  // Number(null) and Number('') are 0 — an empty value takes the fallback.
  if (v === null || v === undefined || v === '') return fallback
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** The itinerary header: text fields never null, the total a number. */
export function normalizeItineraryForView<T extends Record<string, unknown>>(it: T): T {
  return {
    ...it,
    itinerary_code: text(it.itinerary_code),
    client_name: text(it.client_name),
    client_email: text(it.client_email),
    client_phone: text(it.client_phone),
    trip_name: text(it.trip_name),
    status: text(it.status, 'draft') || 'draft',
    currency: text(it.currency, 'EUR') || 'EUR',
    total_cost: num(it.total_cost),
    num_adults: num(it.num_adults),
    num_children: num(it.num_children),
  }
}

/** A day and its services: each service's type, name, quantity and total present. */
export function normalizeDaysForView<D extends { services?: unknown }>(days: D[]): D[] {
  return (days ?? []).map(day => ({
    ...day,
    services: (Array.isArray(day.services) ? day.services : []).map((s: Record<string, unknown>) => ({
      ...s,
      service_type: text(s.service_type, 'other') || 'other',
      service_name: text(s.service_name),
      quantity: num(s.quantity, 1),
      total_cost: num(s.total_cost),
    })),
  }))
}
