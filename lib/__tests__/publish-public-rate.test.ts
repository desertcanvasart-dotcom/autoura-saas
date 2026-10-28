import { describe, it, expect } from 'vitest'
import { bandsOf, fromPriceOf, listCounts, priceFor, proposePublicRate, rateStatus, readSavedRate, type TierResults } from '@/lib/publish/public-rate'

// ============================================================================
// One public rate per tour (operator brief 2026-10-28). The engine proposes
// it, a manager approves it. What these prove:
//   · each traveller count takes the HIGHER of the EU and other-nationality
//     figures — no visitor is sold below the real cost;
//   · every count from the fewest to the most travellers must resolve; a gap
//     blocks approval and is named, never filled in;
//   · consecutive counts at one price are one band; "from" is the lowest;
//   · the cheapest fully covered tier is proposed.
// ============================================================================

type R = { complete?: boolean; table: Record<number, number> }
function results(tiers: Record<string, R>): TierResults {
  return new Map(Object.entries(tiers).map(([tier, r]) => [tier, {
    success: true, complete: r.complete ?? true, pricePerPerson: r.table[2] ?? 0,
    paxPricingTable: Object.entries(r.table).map(([pax, pp]) => ({ numPax: Number(pax), withoutLeader: { pricePerPerson: pp } })),
    services: [],
  }])) as unknown as TierResults
}
const range = (from: number, to: number, f: (n: number) => number) =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, f(from + i)]))

const base = {
  currency: 'EUR',
  tiers: ['standard', 'deluxe'],
  tierLabels: new Map([['standard', 'Standard'], ['deluxe', 'Deluxe']]),
  groupSizes: [{ tier: 'standard', min: 2, max: 6 }, { tier: 'deluxe', min: 2, max: 6 }],
}

describe('the proposal', () => {
  it('every count at the HIGHER of the two bases, then grouped into bands', () => {
    const p = proposePublicRate({
      ...base, tiers: ['standard'],
      eu: results({ standard: { table: { 2: 910, 3: 910, 4: 803, 5: 803, 6: 760 } } }),
      other: results({ standard: { table: { 2: 841, 3: 900, 4: 820, 5: 735, 6: 699 } } }),
    })
    expect(p.reasons).toEqual([])
    expect(p.bands).toEqual([
      { minPax: 2, maxPax: 3, perPerson: 910 },
      { minPax: 4, maxPax: 4, perPerson: 820 },
      { minPax: 5, maxPax: 5, perPerson: 803 },
      { minPax: 6, maxPax: 6, perPerson: 760 },
    ])
    expect(p).toMatchObject({ tier: 'standard', tierLabel: 'Standard', range: { min: 2, max: 6 }, missing: [] })
  })
  it('a count with no price on either basis is a gap: named, no bands, cannot be approved', () => {
    const p = proposePublicRate({
      ...base, tiers: ['standard'], groupSizes: [{ tier: 'standard', min: 2, max: 12 }],
      eu: results({ standard: { table: { 2: 900, 4: 800, 6: 700 } } }),
      other: results({ standard: { table: range(2, 12, () => 650) } }),
    })
    expect(p.bands).toEqual([])
    expect(p.missing).toEqual([3, 5, 7, 8, 9, 10, 11, 12])
    expect(p.reasons).toEqual(['No price for 3, 5 and 7–12 travellers — enter the rates these group sizes need.'])
  })
  it('an incomplete tier answers for no count — its partial figures are never used', () => {
    const p = proposePublicRate({
      ...base, tiers: ['standard'],
      eu: results({ standard: { complete: false, table: range(2, 6, () => 100) } }),
      other: results({ standard: { table: range(2, 6, () => 100) } }),
    })
    expect(p.missing).toEqual([2, 3, 4, 5, 6])
    expect(p.bands).toEqual([])
  })
  it('the cheapest tier that covers every count; a cheaper tier with a gap loses', () => {
    const p = proposePublicRate({
      ...base,
      eu: results({ standard: { table: { 2: 300, 3: 300, 4: 300, 5: 300 } }, deluxe: { table: range(2, 6, () => 800) } }),
      other: results({ standard: { table: range(2, 6, () => 300) }, deluxe: { table: range(2, 6, () => 800) } }),
    })
    expect(p.tier).toBe('deluxe')
    expect(fromPriceOf(p.bands)).toBe(800)
  })
  it('each tier its own group size', () => {
    const p = proposePublicRate({
      ...base, tiers: ['deluxe'], groupSizes: [{ tier: 'standard', min: 1, max: 20 }, { tier: 'deluxe', min: 2, max: 4 }],
      eu: results({ deluxe: { table: range(2, 4, () => 500) } }),
      other: results({ deluxe: { table: range(2, 4, () => 500) } }),
    })
    expect(p.range).toEqual({ min: 2, max: 4 })
    expect(p.bands).toEqual([{ minPax: 2, maxPax: 4, perPerson: 500 }])
  })
  it('no group size: nothing to price, and the manager is told what to set', () => {
    const p = proposePublicRate({ ...base, groupSizes: [{ tier: 'standard', min: 2, max: null }], eu: results({}), other: results({}) })
    expect(p.tier).toBeNull()
    expect(p.reasons[0]).toMatch(/Set the tour.s group size/)
  })
  it('the 2-traveller price is the engine\'s headline, even when its table row is a cent off', () => {
    const r = (t: Record<number, number>) => new Map([['standard', { success: true, complete: true, pricePerPerson: 70.89, paxPricingTable: Object.entries(t).map(([n, pp]) => ({ numPax: +n, withoutLeader: { pricePerPerson: pp } })), services: [] }]]) as unknown as TierResults
    const p = proposePublicRate({ ...base, tiers: ['standard'], groupSizes: [{ tier: 'standard', min: 2, max: 2 }], eu: r({ 2: 70.88 }), other: r({ 2: 70.88 }) })
    expect(p.bands).toEqual([{ minPax: 2, maxPax: 2, perPerson: 70.89 }])
  })
})

describe('bands', () => {
  it('group equal neighbours, find a count, and "from" is the lowest', () => {
    const bands = bandsOf([{ pax: 4, perPerson: 80 }, { pax: 2, perPerson: 90 }, { pax: 3, perPerson: 90 }, { pax: 5, perPerson: 80 }])
    expect(bands).toEqual([{ minPax: 2, maxPax: 3, perPerson: 90 }, { minPax: 4, maxPax: 5, perPerson: 80 }])
    expect(priceFor(bands, 3)).toBe(90)
    expect(priceFor(bands, 6)).toBeNull()
    expect(fromPriceOf(bands)).toBe(80)
  })
  it('counts in words', () => {
    expect(listCounts([1])).toBe('1 traveller')
    expect(listCounts([7, 8, 9])).toBe('7–9 travellers')
  })
})

describe('the stored rate', () => {
  const saved = { tier: 'standard', currency: 'EUR', bands: [{ minPax: 2, maxPax: 6, perPerson: 500 }] }
  it('is read only when well formed — a gap or overlap is no rate', () => {
    expect(readSavedRate(saved)).toEqual(saved)
    expect(readSavedRate({ ...saved, bands: [{ minPax: 2, maxPax: 3, perPerson: 1 }, { minPax: 3, maxPax: 6, perPerson: 1 }] })).toBeNull()
    expect(readSavedRate({ ...saved, bands: [] })).toBeNull()
    expect(readSavedRate(null)).toBeNull()
  })
  it('in step, changed, or none — against today\'s proposal', () => {
    const proposal = { currency: 'EUR', tier: 'standard', tierLabel: 'Standard', range: { min: 2, max: 6 }, bands: saved.bands, missing: [], reasons: [] }
    expect(rateStatus(null, proposal)).toBe('none')
    expect(rateStatus(saved, proposal)).toBe('in_step')
    expect(rateStatus(saved, { ...proposal, bands: [{ minPax: 2, maxPax: 6, perPerson: 510 }] })).toBe('changed')
    expect(rateStatus(saved, { ...proposal, tier: 'deluxe' })).toBe('changed')
  })
})
