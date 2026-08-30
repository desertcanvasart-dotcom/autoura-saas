import { describe, it, expect } from 'vitest'
import { gridCompleteness } from '@/app/pricing-grid/lib/grid-completeness'
import type { GridDay, GridConfig } from '@/app/pricing-grid/types'

// ============================================
// Rich gate (consolidation Phase B) — tests cover the component-aware
// requirements: sleep on overnight days, type-aware transport segments,
// class-aware entrances, guide on sightseeing days, hotel/airport
// services on the matching events, and the cross-cutting zero-priced
// warning. The previous lite-gate tests (which keyed on a `blocking`
// array) were replaced with this suite when the gate moved to the
// `{ complete, blocking: number, warnings: number, issues[] }` shape.
// ============================================

const pricedSlot = (slotId: string, extras: Partial<{ serviceType: string; pricingClass: 'mandatory' | 'optional' | 'free' }> = {}) => ({
  slotId,
  selectedItems: [{ rateId: 'r1', name: 'X', rateEur: 50, rateNonEur: 60, ...extras }],
  customAmount: 0,
})

const emptySlot = (slotId: string) => ({ slotId, selectedItems: [], customAmount: 0 })

const day = (n: number, slots: any[], overrides: Partial<GridDay> = {}): GridDay => ({
  id: `d${n}`,
  dayNumber: n,
  title: `Day ${n}`,
  city: 'Cairo',
  description: '',
  isExpanded: false,
  slots,
  ...overrides,
})

const cfg = (over: Partial<GridConfig> = {}): Partial<GridConfig> => ({ withGuide: true, ...over })

describe('gridCompleteness — rich gate (consolidation Phase B)', () => {
  it('returns empty-grid block on no days', () => {
    const r = gridCompleteness([], cfg())
    expect(r.complete).toBe(false)
    expect(r.issues.some((i) => i.code === 'empty-grid')).toBe(true)
  })

  it("blocks an overnight tour day with no accommodation or cruise", () => {
    const r = gridCompleteness([day(1, [])], cfg({ withGuide: false }))
    expect(r.complete).toBe(false)
    expect(r.issues.some((i) => i.code === 'missing-sleep' && i.dayNumber === 1)).toBe(true)
  })

  it('passes a tour day that has every required component priced', () => {
    const slots = [
      pricedSlot('accommodation'),
      pricedSlot('route', { serviceType: 'day_tour' }),
      pricedSlot('guide'),
    ]
    const r = gridCompleteness([day(1, slots)], cfg({ withGuide: true }))
    expect(r.complete).toBe(true)
    expect(r.blocking).toBe(0)
  })

  it('blocks a sightseeing day when withGuide is on but no guide is priced', () => {
    const slots = [
      pricedSlot('accommodation'),
      pricedSlot('route', { serviceType: 'day_tour' }),
    ]
    const r = gridCompleteness([day(1, slots)], cfg({ withGuide: true }))
    expect(r.complete).toBe(false)
    expect(r.issues.some((i) => i.code === 'missing-guide' && i.dayNumber === 1)).toBe(true)
  })

  it('does NOT require a guide on a sightseeing day when withGuide is off', () => {
    const slots = [
      pricedSlot('accommodation'),
      pricedSlot('route', { serviceType: 'day_tour' }),
    ]
    const r = gridCompleteness([day(1, slots)], cfg({ withGuide: false }))
    expect(r.complete).toBe(true)
  })

  it('blocks a tour day missing the day_tour transport segment (type-aware)', () => {
    const slots = [
      pricedSlot('accommodation'),
      pricedSlot('route', { serviceType: 'airport_transfer' }), // wrong segment
      pricedSlot('guide'),
    ]
    const r = gridCompleteness([day(1, slots)], cfg({ withGuide: true }))
    expect(r.complete).toBe(false)
    expect(r.issues.some((i) => i.code === 'missing-transport-day_tour')).toBe(true)
  })

  it('falls back to count-based transport check when selections lack serviceType', () => {
    const slots = [
      pricedSlot('accommodation'),
      pricedSlot('route'),  // no serviceType — legacy selection
      pricedSlot('guide'),
    ]
    const r = gridCompleteness([day(1, slots)], cfg({ withGuide: true }))
    expect(r.complete).toBe(true)  // count is enough for the count-based path
  })

  it('counts customAmount on the route slot toward the transport count', () => {
    const slots = [
      pricedSlot('accommodation'),
      { slotId: 'route', selectedItems: [], customAmount: 120 },
      pricedSlot('guide'),
    ]
    const r = gridCompleteness([day(1, slots)], cfg({ withGuide: true }))
    expect(r.complete).toBe(true)
  })

  it('blocks an arrival day missing airport_services', () => {
    const slots = [
      pricedSlot('accommodation'),
      pricedSlot('route', { serviceType: 'airport_transfer' }),
      pricedSlot('hotel_services'),
    ]
    const r = gridCompleteness(
      [day(1, slots, { dayType: 'arrival' })],
      cfg({ withGuide: false })
    )
    expect(r.complete).toBe(false)
    expect(r.issues.some((i) => i.code === 'missing-airport_services')).toBe(true)
  })

  it('blocks an arrival day missing hotel_services (check-in)', () => {
    const slots = [
      pricedSlot('accommodation'),
      pricedSlot('route', { serviceType: 'airport_transfer' }),
      pricedSlot('airport_services'),
    ]
    const r = gridCompleteness(
      [day(1, slots, { dayType: 'arrival' })],
      cfg({ withGuide: false })
    )
    expect(r.complete).toBe(false)
    expect(r.issues.some((i) => i.code === 'missing-hotel_services')).toBe(true)
  })

  it('blocks a transfer day missing the intercity transport segment (road)', () => {
    const slots = [
      pricedSlot('accommodation'),
      pricedSlot('route', { serviceType: 'airport_transfer' }), // wrong segment
      pricedSlot('hotel_services'),
    ]
    const r = gridCompleteness(
      [day(1, slots, { dayType: 'transfer' })],
      cfg({ withGuide: false })
    )
    expect(r.complete).toBe(false)
    expect(r.issues.some((i) => i.code === 'missing-transport-intercity_transfer')).toBe(true)
  })

  it('blocks an intercity=flight day missing the flights slot', () => {
    const slots = [
      pricedSlot('accommodation'),
      pricedSlot('hotel_services'),
    ]
    const r = gridCompleteness(
      [day(1, slots, { dayType: 'transfer', intercity: 'flight' })],
      cfg({ withGuide: false })
    )
    expect(r.complete).toBe(false)
    expect(r.issues.some((i) => i.code === 'missing-flight')).toBe(true)
  })

  it('blocks a day with a mandatory entrance that is unpriced', () => {
    const slots = [
      pricedSlot('accommodation'),
      pricedSlot('route', { serviceType: 'day_tour' }),
      pricedSlot('guide'),
      {
        slotId: 'entrance_fees',
        selectedItems: [{ rateId: 'e1', name: 'Pyramids', rateEur: 0, rateNonEur: 0, pricingClass: 'mandatory' as const }],
        customAmount: 0,
      },
    ]
    const r = gridCompleteness([day(1, slots)], cfg({ withGuide: true }))
    expect(r.complete).toBe(false)
    expect(r.issues.some((i) => i.code === 'unpriced-mandatory-entrance')).toBe(true)
  })

  it('does NOT block when an unpriced entrance is class=free', () => {
    const slots = [
      pricedSlot('accommodation'),
      pricedSlot('route', { serviceType: 'day_tour' }),
      pricedSlot('guide'),
      {
        slotId: 'entrance_fees',
        selectedItems: [{ rateId: 'e1', name: 'Free Garden', rateEur: 0, rateNonEur: 0, pricingClass: 'free' as const }],
        customAmount: 0,
      },
    ]
    const r = gridCompleteness([day(1, slots)], cfg({ withGuide: true }))
    expect(r.complete).toBe(true)
  })

  it("a 'free' day type passes with no slots — needs nothing more than overnight (already implied)", () => {
    const slots = [pricedSlot('accommodation')]
    const r = gridCompleteness(
      [day(1, slots, { dayType: 'free' })],
      cfg({ withGuide: false })
    )
    expect(r.complete).toBe(true)
  })

  it('per-day override flag can re-enable a component the preset skipped', () => {
    // tour preset: hasSightseeing=true. Override to false → no day_tour needed.
    const slots = [pricedSlot('accommodation')]
    const r = gridCompleteness(
      [day(1, slots, { hasSightseeing: false })],
      cfg({ withGuide: true })
    )
    expect(r.complete).toBe(true)
  })

  it('warns (not blocks) on a non-free selection that resolved to €0', () => {
    const slots = [
      pricedSlot('accommodation'),
      pricedSlot('route', { serviceType: 'day_tour' }),
      pricedSlot('guide'),
      {
        slotId: 'meals',
        selectedItems: [{ rateId: 'm1', name: 'Lunch', rateEur: 0, rateNonEur: 0 }],
        customAmount: 0,
      },
    ]
    const r = gridCompleteness([day(1, slots)], cfg({ withGuide: true }))
    expect(r.complete).toBe(true)  // warn, not block
    expect(r.warnings).toBeGreaterThan(0)
    expect(r.issues.some((i) => i.code === 'zero-resolved-selection' && i.severity === 'warn')).toBe(true)
  })

  it('exposes back-compat ok / blockingMessages / warningMessages fields', () => {
    const r = gridCompleteness([day(1, [])], cfg({ withGuide: false }))
    expect(r.ok).toBe(false)
    expect(Array.isArray(r.blockingMessages)).toBe(true)
    expect(r.blockingMessages.length).toBeGreaterThan(0)
    expect(Array.isArray(r.warningMessages)).toBe(true)
  })
})

describe('gridCompleteness — package-aware requirements (ported from travel-ops-pro)', () => {
  // Until the mask existed the gate enforced the FULL-PACKAGE shape on every
  // product: a tours-only trip — no hotels, no airport transfers sold — was
  // BLOCKED for having no accommodation priced on days the customer sleeps
  // in a hotel that was never ours to sell. This app additionally stamped
  // every grid-saved itinerary 'land-package' whatever it was.

  it('tours-only: an overnight-preset day needs no accommodation, hotel or airport services', () => {
    const d = day(1, [pricedSlot('guide'), pricedSlot('vehicle')], { dayType: 'arrival' })
    const r = gridCompleteness([d], cfg({ packageType: 'tours-only' }))
    expect(r.issues.map(i => i.code)).not.toContain('missing-sleep')
    expect(r.issues.map(i => i.code)).not.toContain('missing-hotel_services')
    expect(r.issues.map(i => i.code)).not.toContain('missing-airport_services')
  })

  it('land-package: hotels required, airport pickup not', () => {
    const d = day(1, [emptySlot('accommodation'), emptySlot('airport_services')], { dayType: 'arrival' })
    const r = gridCompleteness([d], cfg({ packageType: 'land-package' }))
    expect(r.issues.map(i => i.code)).toContain('missing-sleep')
    expect(r.issues.map(i => i.code)).not.toContain('missing-airport_services')
  })

  it("the operator's explicit day flag beats the package mask", () => {
    // "This tours-only trip DOES include one airport pickup, we agreed it
    // specially" — a real sale; saying so re-arms the requirement.
    const d = day(1, [emptySlot('airport_services'), pricedSlot('guide')], {
      dayType: 'arrival',
      airportArrival: true,
    })
    const r = gridCompleteness([d], cfg({ packageType: 'tours-only' }))
    expect(r.issues.map(i => i.code)).toContain('missing-airport_services')
  })

  it('no packageType (older saved configs) behaves exactly like full-package', () => {
    const d = day(1, [emptySlot('accommodation')], { dayType: 'arrival' })
    const bare = gridCompleteness([d], cfg())
    const full = gridCompleteness([d], cfg({ packageType: 'full-package' }))
    expect(bare.issues.map(i => i.code)).toEqual(full.issues.map(i => i.code))
    expect(bare.issues.map(i => i.code)).toContain('missing-sleep')
  })
})
