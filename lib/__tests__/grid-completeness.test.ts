import { describe, it, expect } from 'vitest'
import { gridCompleteness, resolveComponents } from '@/app/pricing-grid/lib/grid-completeness'
import { createEmptySlots } from '@/app/pricing-grid/lib/slot-mapping'
import {
  DEFAULT_CONFIG,
  type GridDay,
  type DayType,
  type DayComponents,
  type GridConfig,
  type PricingClass,
  type SlotSelection,
} from '@/app/pricing-grid/types'

// Consolidation Phase B (B-full): the grid completeness gate — component-driven,
// transport type-aware, entrance class-aware. See PRICING-CONSOLIDATION-PLAN.md.

interface DayOpts {
  priced?: Record<string, number> // simple slots → resolvedRate
  routeSegs?: Array<{ serviceType?: string; rate?: number }> // route slot selections
  entrances?: Array<{ pricingClass: PricingClass; rate?: number; label?: string }>
  components?: Partial<DayComponents>
  needsHumanInput?: string // slotId carrying an unreviewed AI hint
}

function makeDay(dayNumber: number, dayType: DayType, opts: DayOpts = {}): GridDay {
  const { priced = {}, routeSegs, entrances, components = {}, needsHumanInput } = opts
  const slots = createEmptySlots().map((s) => {
    const next: any = { ...s }
    if (priced[s.slotId] !== undefined) {
      next.resolvedRate = priced[s.slotId]
      next.selectedId = 'rate-x'
    }
    if (s.slotId === 'route' && routeSegs) {
      const selections: SlotSelection[] = routeSegs.map((seg, i) => ({
        id: `route-${i}`,
        rate: seg.rate ?? 70,
        serviceType: seg.serviceType,
      }))
      next.selections = selections
      next.selectedIds = selections.map((x) => x.id)
      next.resolvedRate = selections.reduce((n, x) => n + x.rate, 0)
    }
    if (s.slotId === 'entrance_fees' && entrances) {
      const selections: SlotSelection[] = entrances.map((e, i) => ({
        id: `ent-${i}`,
        rate: e.rate ?? 20,
        pricingClass: e.pricingClass,
        label: e.label,
      }))
      next.selections = selections
      next.selectedIds = selections.map((x) => x.id)
      next.resolvedRate = selections.reduce((n, x) => n + x.rate, 0)
    }
    if (s.slotId === needsHumanInput) next.needsHumanInput = true
    return next
  })
  return { id: `d${dayNumber}`, dayNumber, title: '', city: '', description: '', isExpanded: false, slots, dayType, ...components }
}

const cfg = (over: Partial<GridConfig> = {}): GridConfig => ({ ...DEFAULT_CONFIG, ...over })
const codes = (r: ReturnType<typeof gridCompleteness>) => r.issues.map((i) => i.code)

describe('resolveComponents — day-type presets + overrides', () => {
  it('fills defaults from the day type', () => {
    const c = resolveComponents(makeDay(1, 'arrival'))
    expect(c.airportArrival).toBe(true)
    expect(c.hotelCheckIn).toBe(true)
    expect(c.overnight).toBe(true)
    expect(c.hasSightseeing).toBe(false)
  })
  it('explicit flags override the preset', () => {
    const c = resolveComponents(makeDay(1, 'tour', { components: { hasSightseeing: false } }))
    expect(c.hasSightseeing).toBe(false)
  })
})

describe('gridCompleteness — sleep, guide, transport (type-aware)', () => {
  it('a complete tour day is complete', () => {
    const day = makeDay(1, 'tour', {
      priced: { accommodation: 55, guide: 60 },
      routeSegs: [{ serviceType: 'day_tour' }],
    })
    expect(gridCompleteness([day], cfg({ withGuide: true })).complete).toBe(true)
  })

  it('a tour day missing the day-tour transport segment blocks (type-aware)', () => {
    const day = makeDay(1, 'tour', {
      priced: { accommodation: 55, guide: 60 },
      routeSegs: [{ serviceType: 'airport_transfer' }], // wrong kind
    })
    const r = gridCompleteness([day], cfg({ withGuide: true }))
    expect(r.complete).toBe(false)
    expect(codes(r)).toContain('missing-transport-day_tour')
  })

  it('guide only required when the Guide toggle is on', () => {
    const day = makeDay(1, 'tour', { priced: { accommodation: 55 }, routeSegs: [{ serviceType: 'day_tour' }] })
    expect(gridCompleteness([day], cfg({ withGuide: false })).complete).toBe(true)
    expect(codes(gridCompleteness([day], cfg({ withGuide: true })))).toContain('missing-guide')
  })

  it('count-based fallback when route lines lack service_type', () => {
    // needs 1 day-tour segment; route has one untyped priced line → satisfied by count
    const ok = makeDay(1, 'tour', { priced: { accommodation: 55, guide: 60 }, routeSegs: [{}] })
    expect(gridCompleteness([ok], cfg({ withGuide: true })).complete).toBe(true)
    // needs a segment but route empty → blocked
    const bad = makeDay(1, 'tour', { priced: { accommodation: 55, guide: 60 } })
    expect(codes(gridCompleteness([bad], cfg({ withGuide: true })))).toContain('missing-transport')
  })
})

describe('gridCompleteness — combined day: domestic flight + same-day sightseeing', () => {
  const components: Partial<DayComponents> = {
    overnight: true,
    hasSightseeing: true,
    airportArrival: true,
    airportDeparture: true,
    hotelCheckIn: true,
    hotelCheckOut: true,
    intercity: 'flight',
  }

  it('is complete only with both airport transfers + a day-tour + flight + services', () => {
    const day = makeDay(1, 'transfer', {
      priced: { accommodation: 55, flights: 120, guide: 60, hotel_services: 30, airport_services: 50 },
      routeSegs: [
        { serviceType: 'airport_transfer' },
        { serviceType: 'airport_transfer' },
        { serviceType: 'day_tour' },
      ],
      components,
    })
    expect(gridCompleteness([day], cfg({ withGuide: true })).complete).toBe(true)
  })

  it('blocks when only one airport transfer is priced (needs two ends)', () => {
    const day = makeDay(1, 'transfer', {
      priced: { accommodation: 55, flights: 120, guide: 60, hotel_services: 30, airport_services: 50 },
      routeSegs: [{ serviceType: 'airport_transfer' }, { serviceType: 'day_tour' }], // missing 2nd airport
      components,
    })
    const r = gridCompleteness([day], cfg({ withGuide: true }))
    expect(r.complete).toBe(false)
    expect(codes(r)).toContain('missing-transport-airport_transfer')
  })

  it('blocks when the flight itself is not priced', () => {
    const day = makeDay(1, 'transfer', {
      priced: { accommodation: 55, guide: 60, hotel_services: 30, airport_services: 50 }, // no flight
      routeSegs: [{ serviceType: 'airport_transfer' }, { serviceType: 'airport_transfer' }, { serviceType: 'day_tour' }],
      components,
    })
    expect(codes(gridCompleteness([day], cfg({ withGuide: true })))).toContain('missing-flight')
  })
})

describe('gridCompleteness — international arrival + same-day sightseeing', () => {
  it('needs airport→hotel + day-tour transport', () => {
    const components: Partial<DayComponents> = { airportArrival: true, hasSightseeing: true, hotelCheckIn: true, overnight: true }
    const complete = makeDay(1, 'arrival', {
      priced: { accommodation: 55, guide: 60, airport_services: 50, hotel_services: 30 },
      routeSegs: [{ serviceType: 'airport_transfer' }, { serviceType: 'day_tour' }],
      components,
    })
    expect(gridCompleteness([complete], cfg({ withGuide: true })).complete).toBe(true)

    const missingTour = makeDay(1, 'arrival', {
      priced: { accommodation: 55, guide: 60, airport_services: 50, hotel_services: 30 },
      routeSegs: [{ serviceType: 'airport_transfer' }], // no day-tour
      components,
    })
    expect(codes(gridCompleteness([missingTour], cfg({ withGuide: true })))).toContain('missing-transport-day_tour')
  })
})

describe('gridCompleteness — entrance fees (class-aware)', () => {
  const sightDay = (entrances: DayOpts['entrances']) =>
    makeDay(1, 'tour', { priced: { accommodation: 55, guide: 60 }, routeSegs: [{ serviceType: 'day_tour' }], entrances })

  it('a priced mandatory entrance is fine', () => {
    expect(gridCompleteness([sightDay([{ pricingClass: 'mandatory', rate: 20 }])], cfg({ withGuide: true })).complete).toBe(true)
  })
  it('a mandatory entrance with no price blocks', () => {
    const r = gridCompleteness([sightDay([{ pricingClass: 'mandatory', rate: 0, label: 'Giza Plateau' }])], cfg({ withGuide: true }))
    expect(r.complete).toBe(false)
    expect(codes(r)).toContain('unpriced-mandatory-entrance')
  })
  it('a FREE site at €0 neither blocks nor warns', () => {
    const r = gridCompleteness([sightDay([{ pricingClass: 'free', rate: 0, label: 'Old Cairo' }])], cfg({ withGuide: true }))
    expect(r.complete).toBe(true)
    expect(codes(r)).not.toContain('zero-resolved-selection')
  })
  it('an OPTIONAL site never blocks', () => {
    const r = gridCompleteness([sightDay([{ pricingClass: 'optional', rate: 0, label: 'Pyramid interior' }])], cfg({ withGuide: true }))
    expect(r.complete).toBe(true)
  })
})

describe('gridCompleteness — event services & cross-cutting', () => {
  it('requires hotel services on a check-in/out day', () => {
    const day = makeDay(1, 'transfer', { priced: { accommodation: 55, airport_services: 0 }, routeSegs: [{ serviceType: 'intercity_transfer' }] })
    expect(codes(gridCompleteness([day], cfg())).includes('missing-hotel_services')).toBe(true)
  })
  it('blocks an unreviewed AI hint', () => {
    const day = makeDay(1, 'free', { priced: { accommodation: 55 }, needsHumanInput: 'other_pp' })
    expect(codes(gridCompleteness([day], cfg()))).toContain('needs-human-input')
  })
  it('does not require meals (case-by-case)', () => {
    const day = makeDay(1, 'tour', { priced: { accommodation: 55, guide: 60 }, routeSegs: [{ serviceType: 'day_tour' }] })
    const r = gridCompleteness([day], cfg({ withGuide: true }))
    expect(r.complete).toBe(true)
    expect(codes(r).some((c) => c.includes('meal'))).toBe(false)
  })
  it('blocks an empty grid', () => {
    expect(gridCompleteness([], cfg()).issues[0].code).toBe('empty-grid')
  })
  it('departure day: no sleep required, but transport + airport + hotel services are', () => {
    const ok = makeDay(1, 'departure', { priced: { airport_services: 50, hotel_services: 30 }, routeSegs: [{ serviceType: 'airport_transfer' }] })
    expect(gridCompleteness([ok], cfg()).complete).toBe(true)
    const bad = makeDay(1, 'departure', {}) // nothing priced
    const r = gridCompleteness([bad], cfg())
    expect(r.complete).toBe(false)
    expect(codes(r)).not.toContain('missing-sleep') // departure has no overnight
  })
})
