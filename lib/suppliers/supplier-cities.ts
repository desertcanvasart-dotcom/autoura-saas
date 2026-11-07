// ============================================
// WHICH CITIES A SUPPLIER WORKS IN (migration 461)
// ============================================
// A supplier has a BASE city (`city`), may ALSO work in other cities
// (`other_cities`), or may travel everywhere (`works_all_cities` — a
// throughout guide). Every "who works in X?" question asks this one rule.

export interface SupplierCityFields {
  city?: string | null
  other_cities?: readonly string[] | null
  works_all_cities?: boolean | null
}

const key = (c: string | null | undefined) => String(c ?? '').trim().toLowerCase()

/** The cities a supplier works in, base city first, no duplicates or blanks. */
export function citiesOf(s: SupplierCityFields): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const c of [s.city, ...(s.other_cities ?? [])]) {
    const k = key(c)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(String(c).trim())
  }
  return out
}

/** Does this supplier work in `city`? Travels-everywhere covers any city. */
export function coversCity(s: SupplierCityFields, city: string | null | undefined): boolean {
  if (s.works_all_cities) return true
  const k = key(city)
  if (!k) return false
  return citiesOf(s).some(c => key(c) === k)
}

/** "Cairo · Luxor · Aswan", or "All cities" for one who travels everywhere. */
export function citiesLabel(s: SupplierCityFields, allLabel = 'All cities'): string {
  if (s.works_all_cities) return allLabel
  return citiesOf(s).join(' · ')
}

/** The other_cities to store: trimmed, no blanks, no repeat of the base city. */
export function cleanOtherCities(base: string | null | undefined, list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const baseKey = key(base)
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of list) {
    if (typeof c !== 'string') continue
    const k = key(c)
    if (!k || k === baseKey || seen.has(k)) continue
    seen.add(k)
    out.push(c.trim())
  }
  return out
}
