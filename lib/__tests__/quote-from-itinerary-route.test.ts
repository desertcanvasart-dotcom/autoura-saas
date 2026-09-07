// The route must price ONLY through the engine's canonical lookups and the
// pure repricer — no private queries against rate tables (that was the
// arbitrary-first-row, wrong-currency override this replaces).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ratePin } from '@/lib/pricing/rate-pin'

const ROUTE = readFileSync(join(__dirname, '..', '..', 'app', 'api', 'b2b', 'quote-from-itinerary', 'route.ts'), 'utf8')
const SAVE = readFileSync(join(__dirname, '..', '..', 'app', 'api', 'pricing-grid', 'save', 'route.ts'), 'utf8')

describe('quote-from-itinerary route', () => {
  it('has no private rate-table queries', () => {
    for (const t of ['guides', 'guide_rates', 'accommodation_rates', 'meal_rates', 'nile_cruises', 'entrance_fees', 'vehicles']) {
      expect(ROUTE, `direct query of ${t}`).not.toMatch(new RegExp(`from\\(\\s*['"\`]${t}['"\`]`))
    }
  })
  it('prices through the facade and the pure repricer, and refuses on holes', () => {
    expect(ROUTE).toMatch(/from '@\/lib\/pricing\/rate-resolution'/)
    expect(ROUTE).toMatch(/repriceItineraryServices\(/)
    expect(ROUTE).toMatch(/holes\.length > 0[\s\S]{0,400}status: 422/)
  })
  it('the grid save records the pin for every recognised slot', () => {
    expect(SAVE).toMatch(/\.\.\.ratePin\(slot\.slotId, item\.rateId\)/)
  })
})

describe('ratePin', () => {
  const id = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
  it('pins a plain row id in a known slot', () => {
    expect(ratePin('accommodation', id)).toEqual({ rate_table: 'accommodation_rates', rate_id: id })
    expect(ratePin('cruise', id)).toEqual({ rate_table: 'nile_cruises', rate_id: id })
    expect(ratePin('meals', id)).toEqual({ rate_table: 'meal_rates', rate_id: id })
  })
  it('does not pin synthetic ids, unknown slots, or merged-table slots', () => {
    expect(ratePin('accommodation', `${id}_supp`)).toEqual({})
    expect(ratePin('experiences', `${id}__standard`)).toEqual({})
    expect(ratePin('water', 'water-standard')).toEqual({})
    expect(ratePin('route', id)).toEqual({})
    expect(ratePin('other_pp', id)).toEqual({})
  })
})
