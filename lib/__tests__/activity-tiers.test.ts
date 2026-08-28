import { describe, it, expect } from 'vitest'
import { getCurrencySymbol } from '../currency'
import {
  sanitizeTiers,
  parseTiers,
  pickTier,
  applyActivityTiers,
  type ActivityTier,
} from '../rates/activity-tiers'

// C3.3: group-size bands on the activity itself. The rules that matter: a
// band with no rate is a data-entry hole and must never price at zero,
// overlapping bands are refused outright (two prices for one group size is
// not a preference the code gets to guess at), and a group beyond every band
// still gets priced.

// The symbol comes from the currency module, never a literal — this repo's
// euro-literal ratchet exists because one tenant already bills in USD.
const SYM = getCurrencySymbol('EUR')

const BANDS: ActivityTier[] = [
  { min_pax: 1, max_pax: 4, rate_eur: 25, rate_non_eur: 30, label: 'Small boat' },
  { min_pax: 5, max_pax: 12, rate_eur: 18, rate_non_eur: null, label: null },
]

describe('sanitizeTiers', () => {
  it('accepts clean bands and sorts them by upper bound', () => {
    const out = sanitizeTiers([
      { min_pax: 5, max_pax: 12, rate_eur: 18 },
      { min_pax: 1, max_pax: 4, rate_eur: 25, label: ' Small boat ' },
    ])!
    expect(out.map(t => t.max_pax)).toEqual([4, 12])
    expect(out[0].label).toBe('Small boat')
    expect(out[0].rate_non_eur).toBeNull()
  })

  it('refuses a zero or missing rate — never prices an activity at nothing', () => {
    expect(sanitizeTiers([{ min_pax: 1, max_pax: 4, rate_eur: 0 }])).toBeNull()
    expect(sanitizeTiers([{ min_pax: 1, max_pax: 4 }])).toBeNull()
    expect(sanitizeTiers([{ min_pax: 1, max_pax: 4, rate_eur: -5 }])).toBeNull()
  })

  it('refuses overlapping bands — one group size cannot have two prices', () => {
    expect(sanitizeTiers([
      { min_pax: 1, max_pax: 6, rate_eur: 25 },
      { min_pax: 5, max_pax: 12, rate_eur: 18 },
    ])).toBeNull()
  })

  it('refuses an inverted band, and reads absent/garbage as "no tiers"', () => {
    expect(sanitizeTiers([{ min_pax: 8, max_pax: 4, rate_eur: 25 }])).toBeNull()
    expect(sanitizeTiers([])).toBeNull()
    expect(sanitizeTiers(null)).toBeNull()
    expect(sanitizeTiers('nope')).toBeNull()
  })

  it('parseTiers tolerates JSONB arriving as a string', () => {
    expect(parseTiers(JSON.stringify(BANDS))![0].rate_eur).toBe(25)
    expect(parseTiers('{broken')).toBeNull()
  })
})

describe('pickTier', () => {
  it('matches the band containing the group size', () => {
    expect(pickTier(BANDS, 1).max_pax).toBe(4)
    expect(pickTier(BANDS, 4).max_pax).toBe(4)
    expect(pickTier(BANDS, 5).max_pax).toBe(12)
  })

  it('a group beyond every band uses the last one, never nothing', () => {
    expect(pickTier(BANDS, 40).rate_eur).toBe(18)
  })
})

describe('applyActivityTiers', () => {
  it('prices per person at the matched band and explains itself', () => {
    const r = applyActivityTiers(BANDS, 3, true, SYM)
    expect(r.unitCost).toBe(25)
    expect(r.lineTotal).toBe(75)
    expect(r.quantityMode).toBe('per_pax')
    expect(r.pricingNote).toBe(`Small boat: ${SYM}25/pax × 3 = ${SYM}75`)
  })

  it('a non-EU passport uses its own rate, falling back to the EU one', () => {
    expect(applyActivityTiers(BANDS, 3, false, SYM).unitCost).toBe(30)
    // Second band has no non-EU rate — falls back rather than pricing at zero.
    expect(applyActivityTiers(BANDS, 8, false, SYM).unitCost).toBe(18)
  })

  it('the note carries the band label, or the range when unlabelled', () => {
    expect(applyActivityTiers(BANDS, 8, true, SYM).pricingNote).toContain('5-12 pax')
  })

  it('rounds the line total to cents', () => {
    const r = applyActivityTiers([{ min_pax: 1, max_pax: 9, rate_eur: 33.33 }], 3, true, SYM)
    expect(r.lineTotal).toBe(99.99)
  })
})
