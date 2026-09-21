// The AI itinerary generator read every rate table RAW: meals, tipping,
// airport and hotel staff, guides and entrance fees went straight into the
// pricing arithmetic with no per-rate currency conversion (migration 295).
// An EGP 6,000 hotel-staff rate was therefore spent as 6,000 of the run
// currency — and the quote's currency LABEL already claimed the run currency,
// so nothing downstream could catch it.
//
// The guard is derived, not hand-listed: RATE_MONETARY_COLUMNS is the
// authority on which tables hold convertible money, so a new rate-table read
// added to this route fails here until it is normalised too.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { RATE_MONETARY_COLUMNS } from '@/lib/rates/rate-currency'

const ROOT = join(__dirname, '..', '..')
const ROUTE = readFileSync(join(ROOT, 'app', 'api', 'ai', 'generate-itinerary', 'route.ts'), 'utf8')

/** Rate tables (per RATE_MONETARY_COLUMNS) this route queries directly. */
function moneyTablesRead(src: string): string[] {
  const read = new Set<string>()
  for (const m of src.matchAll(/\.from\(\s*['"`]([a-z_]+)['"`]\s*\)/g)) {
    if (RATE_MONETARY_COLUMNS[m[1]]) read.add(m[1])
  }
  return [...read].sort()
}

describe('the AI generator converts every rate it reads into the run currency', () => {
  it('reads the money tables it is expected to', () => {
    expect(moneyTablesRead(ROUTE)).toEqual([
      'airport_staff_rates', 'entrance_fees', 'hotel_staff_rates', 'meal_rates', 'tipping_rates',
    ])
  })

  it('every money table it reads is passed through the run-currency seam', () => {
    const unconverted = moneyTablesRead(ROUTE).filter(t => !ROUTE.includes(`inRunCurrency('${t}'`))
    expect(unconverted).toEqual([])
  })

  it('the seam converts into the TENANT run currency, not a hardcoded EUR', () => {
    expect(ROUTE).toMatch(/const inRunCurrency = [\s\S]{0,200}normalizeRateRows\(supabase, table, rows, tenantRunCurrency\)/)
  })

  it('the raw rows are not what the pricing reads: each normalised name shadows its raw_ fetch', () => {
    for (const m of ROUTE.matchAll(/const (\w+) = await inRunCurrency\('[a-z_]+', (raw_\w+)/g)) {
      const [, normalised, raw] = m
      expect(raw, normalised).toBe(`raw_${normalised}`)
      // The raw array is referenced ONLY where it is fetched and normalised —
      // never in the arithmetic below.
      expect(ROUTE.match(new RegExp(`\\b${raw}\\b`, 'g'))!.length, `${raw} leaked past the seam`).toBe(2)
    }
  })

  it('the money columns the route actually prices from are covered by the map', () => {
    // Each pairing below is a column this route reads off a fetched row; if it
    // is not in the map the normaliser silently leaves it in its contract
    // currency (the failure mode this whole test exists for).
    const priced: Array<[string, string]> = [
      ['meal_rates', 'base_rate_eur'],
      ['tipping_rates', 'rate_eur'],
      ['airport_staff_rates', 'rate_eur'],
      ['hotel_staff_rates', 'rate_eur'],
      ['entrance_fees', 'eur_rate'],
      ['entrance_fees', 'non_eur_rate'],
    ]
    for (const [table, column] of priced) {
      expect(RATE_MONETARY_COLUMNS[table], table).toContain(column)
    }
  })

  // Guides, hotels and transport are not fetched by this route at all any more:
  // they come through the tour engine's lookups (getGuideRate, getHotelRates,
  // getTransportRateFor), which convert into the run currency themselves.
  it('the guide roster, hotel contacts and fleet tables are not read', () => {
    for (const t of ['guides', 'hotel_contacts', 'vehicles']) {
      expect(ROUTE.replace(/\/\/.*$/gm, ''), t).not.toContain(`from('${t}')`)
    }
  })

  it('single-currency tables are left alone (they carry no rate_currency)', () => {
    for (const t of ['vehicles', 'hotel_contacts']) {
      expect(RATE_MONETARY_COLUMNS[t], t).toBeUndefined()
      expect(ROUTE).not.toContain(`inRunCurrency('${t}'`)
    }
  })
})
