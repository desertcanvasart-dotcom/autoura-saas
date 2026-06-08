import { describe, it, expect } from 'vitest'
import { calculateTourPricing, validateTour } from '@/lib/tourCalculator'
import type { Tour } from '@/app/tour-builder/types'
import {
  sampleCairoTour,
  sampleCairoExpected,
  minimalTour,
} from './fixtures/sample-tours'

// Layer 0 of the pricing harness: lock the behaviour of the PURE calculator
// (lib/tourCalculator.ts) before any Phase-1 changes. Expected numbers are
// hand-derived in the fixture file. See PRICING-HARNESS-PLAN.md.

const PAX_VALUES = [1, 2, 3, 4, 5, 10, 20, 40]

describe('calculateTourPricing — golden master (sampleCairoTour, 10 pax)', () => {
  const eur = calculateTourPricing(sampleCairoTour, sampleCairoExpected.pax, true)
  const nonEur = calculateTourPricing(sampleCairoTour, sampleCairoExpected.pax, false)

  it('matches hand-derived EUR-passport totals', () => {
    const e = sampleCairoExpected.eur
    expect(eur.totals.total_accommodation).toBe(e.total_accommodation)
    expect(eur.totals.total_meals).toBe(e.total_meals)
    expect(eur.totals.total_guides).toBe(e.total_guides)
    expect(eur.totals.total_transportation).toBe(e.total_transportation)
    expect(eur.totals.total_entrances).toBe(e.total_entrances)
    expect(eur.totals.total_additional_services).toBe(e.total_additional_services)
    expect(eur.totals.grand_total).toBe(e.grand_total)
    expect(eur.per_person).toBe(e.per_person_total)
  })

  it('matches hand-derived non-EUR-passport totals', () => {
    const e = sampleCairoExpected.nonEur
    expect(nonEur.totals.total_accommodation).toBe(e.total_accommodation)
    expect(nonEur.totals.total_meals).toBe(e.total_meals)
    expect(nonEur.totals.total_guides).toBe(e.total_guides)
    expect(nonEur.totals.total_transportation).toBe(e.total_transportation)
    expect(nonEur.totals.total_entrances).toBe(e.total_entrances)
    expect(nonEur.totals.grand_total).toBe(e.grand_total)
    expect(nonEur.per_person).toBe(e.per_person_total)
  })

  it('day-1 EUR subtotal cross-checks the documented €1,385 case', () => {
    const day1 = eur.daily_breakdown.find((d) => d.day_number === 1)
    expect(day1?.daily_total).toBe(sampleCairoExpected.eur.day1_total)
  })

  it('EUR vs non-EUR passport difference is exactly €350', () => {
    expect(eur.totals.grand_total - nonEur.totals.grand_total).toBe(
      sampleCairoExpected.passportDifference
    )
  })
})

describe('calculateTourPricing — structural invariants (all pax)', () => {
  for (const pax of PAX_VALUES) {
    for (const isEur of [true, false]) {
      const label = `pax=${pax} ${isEur ? 'EUR' : 'non-EUR'}`
      const r = calculateTourPricing(sampleCairoTour, pax, isEur)

      it(`category totals sum to grand_total (${label})`, () => {
        const sum =
          r.totals.total_accommodation +
          r.totals.total_meals +
          r.totals.total_guides +
          r.totals.total_transportation +
          r.totals.total_entrances +
          r.totals.total_additional_services
        expect(sum).toBeCloseTo(r.totals.grand_total, 6)
      })

      it(`daily totals sum to grand_total (${label})`, () => {
        const sum = r.daily_breakdown.reduce((acc, d) => acc + d.daily_total, 0)
        expect(sum).toBeCloseTo(r.totals.grand_total, 6)
      })

      it(`per_person × pax === grand_total (${label})`, () => {
        expect(r.per_person * pax).toBeCloseTo(r.totals.grand_total, 6)
      })

      it(`no negative amounts (${label})`, () => {
        expect(r.totals.grand_total).toBeGreaterThanOrEqual(0)
        for (const d of r.daily_breakdown) {
          expect(d.daily_total).toBeGreaterThanOrEqual(0)
          expect(d.accommodation).toBeGreaterThanOrEqual(0)
          expect(d.meals).toBeGreaterThanOrEqual(0)
          expect(d.guide).toBeGreaterThanOrEqual(0)
          expect(d.transportation).toBeGreaterThanOrEqual(0)
          expect(d.entrances).toBeGreaterThanOrEqual(0)
        }
      })

      it(`no NaN amounts (${label})`, () => {
        expect(Number.isNaN(r.totals.grand_total)).toBe(false)
        expect(Number.isNaN(r.per_person)).toBe(false)
      })
    }
  }
})

describe('calculateTourPricing — determinism', () => {
  it('produces byte-identical output across repeated runs', () => {
    const a = calculateTourPricing(sampleCairoTour, 7, true)
    const b = calculateTourPricing(sampleCairoTour, 7, true)
    expect(a).toEqual(b)
  })
})

describe('calculateTourPricing — room math (accommodation is per double room)', () => {
  it('charges ceil(pax/2) rooms', () => {
    // minimalTour: 1 night, €60/room EUR, no other costs
    expect(calculateTourPricing(minimalTour, 1, true).totals.grand_total).toBe(60) // 1 room
    expect(calculateTourPricing(minimalTour, 2, true).totals.grand_total).toBe(60) // 1 room
    expect(calculateTourPricing(minimalTour, 3, true).totals.grand_total).toBe(120) // 2 rooms
    expect(calculateTourPricing(minimalTour, 4, true).totals.grand_total).toBe(120) // 2 rooms
    expect(calculateTourPricing(minimalTour, 5, true).totals.grand_total).toBe(180) // 3 rooms
  })
})

describe('calculateTourPricing — guard rails', () => {
  it('throws when pax <= 0', () => {
    expect(() => calculateTourPricing(sampleCairoTour, 0, true)).toThrow()
    expect(() => calculateTourPricing(sampleCairoTour, -3, true)).toThrow()
  })

  it('throws when the tour has no days', () => {
    const empty: Tour = { ...sampleCairoTour, days: [] }
    expect(() => calculateTourPricing(empty, 2, true)).toThrow()
  })
})

describe('validateTour', () => {
  it('accepts a well-formed tour', () => {
    expect(validateTour(sampleCairoTour).valid).toBe(true)
  })

  it('reports missing required fields', () => {
    const bad: Tour = {
      ...sampleCairoTour,
      tour_name: '',
      cities: [],
      days: [],
    }
    const result = validateTour(bad)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
