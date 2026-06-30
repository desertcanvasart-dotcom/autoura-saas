import { describe, it, expect } from 'vitest'
import { priceAcrossPax } from '../pricing/pax-range'

// The shared multi-pax primitive the rate-sheet engine feeds
// (auto-pricing-service's calculateDayBasedPricing). Pure arithmetic — no
// rates, no I/O.

describe('priceAcrossPax — canonical decomposition', () => {
  it('without leader: groupFixed + transport(pax) + perPerson×pax, ×margin, ÷pax', () => {
    // groupFixed 120, perPerson 110, transport flat 100, margin 25%
    const rows = priceAcrossPax({
      groupFixed: 120, perPerson: 110, marginPercent: 25,
      transportAt: () => 100, tourLeaderCost: 150, paxFrom: 2, paxTo: 2,
    })
    const r = rows[0].withoutLeader
    // 120 + 100 + 110*2 = 440 ; ×1.25 = 550 ; /2 = 275
    expect(r.totalCost).toBe(440)
    expect(r.marginAmount).toBe(110)
    expect(r.sellingPrice).toBe(550)
    expect(r.pricePerPerson).toBe(275)
  })

  it('with leader: transport priced at pax+1 and leader cost added, ÷ paying pax', () => {
    const rows = priceAcrossPax({
      groupFixed: 120, perPerson: 110, marginPercent: 25,
      transportAt: (pax) => (pax <= 2 ? 100 : 150), tourLeaderCost: 150, paxFrom: 2, paxTo: 2,
    })
    const r = rows[0].withLeader
    // transport@3 = 150 ; total = 120 + 150 + 220 + 150 = 640 ; ×1.25 = 800 ; /2 = 400
    expect(r.totalCost).toBe(640)
    expect(r.tourLeaderCost).toBe(150)
    expect(r.sellingPrice).toBe(800)
    expect(r.pricePerPerson).toBe(400)
  })

  it('respects paxFrom/paxTo', () => {
    expect(priceAcrossPax({
      groupFixed: 0, perPerson: 0, marginPercent: 0,
      transportAt: () => 0, tourLeaderCost: 0, paxFrom: 3, paxTo: 7,
    }).map(r => r.numPax)).toEqual([3, 4, 5, 6, 7])
  })
})

// REGRESSION LOCK: replicate auto-pricing-service's ORIGINAL per-pax arithmetic
// exactly, and assert priceAcrossPax reproduces it across the full 1–40 range
// for representative aggregates (incl. a non-linear transport curve and a
// distinct tour-leader cost). Guards the "swap the engine underneath" refactor
// that moved calculateDayBasedPricing's inline pax loop onto this primitive:
// if the primitive ever diverges from the engine it replaced, this fails.
describe('priceAcrossPax — auto-pricing parity lock (1..40)', () => {
  const fixedCosts = 540
  const perPaxCosts = 233.5
  const tourLeaderCost = 410.25 // accommodationPPD + singleSupp + entrance + meals + water
  const marginPercent = 22

  // Vehicle tier by group size — mirrors getVehicleTypeByPax thresholds.
  const transportAt = (pax: number): number => {
    if (pax <= 2) return 180
    if (pax <= 7) return 250
    if (pax <= 14) return 360
    if (pax <= 20) return 520
    return 740
  }

  // The exact pre-refactor formula from auto-pricing-service's per-pax loop.
  function oldRow(numPax: number) {
    const totalNo = fixedCosts + transportAt(numPax) + perPaxCosts * numPax
    const marginNo = totalNo * (marginPercent / 100)
    const sellNo = totalNo + marginNo
    const totalL = fixedCosts + transportAt(numPax + 1) + perPaxCosts * numPax + tourLeaderCost
    const marginL = totalL * (marginPercent / 100)
    const sellL = totalL + marginL
    const r2 = (n: number) => Math.round(n * 100) / 100
    return {
      numPax,
      withoutLeader: {
        totalCost: r2(totalNo), marginAmount: r2(marginNo),
        sellingPrice: r2(sellNo), pricePerPerson: r2(sellNo / numPax),
      },
      withLeader: {
        totalCost: r2(totalL), tourLeaderCost: r2(tourLeaderCost), marginAmount: r2(marginL),
        sellingPrice: r2(sellL), pricePerPerson: r2(sellL / numPax),
      },
    }
  }

  it('matches the original engine arithmetic for every pax 1..40', () => {
    const rows = priceAcrossPax({
      groupFixed: fixedCosts, perPerson: perPaxCosts, marginPercent,
      transportAt, tourLeaderCost, paxFrom: 1, paxTo: 40,
    })
    expect(rows).toHaveLength(40)
    for (let pax = 1; pax <= 40; pax++) {
      expect(rows[pax - 1]).toEqual(oldRow(pax))
    }
  })
})
