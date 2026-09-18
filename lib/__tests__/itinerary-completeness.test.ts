import { describe, it, expect } from 'vitest'
import {
  itineraryServiceLines,
  itineraryCompleteness,
  loadItineraryCompleteness,
} from '@/lib/pricing/itinerary-completeness'

// ============================================
// An itinerary with services that have no cost
// ============================================
// An itinerary's services are its own editable rows, so completeness is read
// from those rows: no rate AND no cost AND no client price is a gap. Checked
// against production 2026-09-18 — there are no itinerary service rows at all
// yet, so nothing starts blocking.

const day = (n: number, services: Array<Record<string, unknown>>) => ({ day_number: n, services })

describe('itineraryServiceLines', () => {
  it('marks a service with no rate, no cost and no client price', () => {
    const lines = itineraryServiceLines([day(2, [{ service_name: 'Guide', rate_eur: 0, total_cost: 0 }])])
    expect(lines[0]).toMatchObject({ service_name: 'Guide', day_number: 2, unpriced: true })
    expect(lines[0].issue).toContain('No cost entered')
  })

  it('leaves a priced service alone — by rate, by cost, or by client price', () => {
    const lines = itineraryServiceLines([
      day(1, [
        { service_name: 'Hotel', rate_eur: 120, total_cost: 0 },
        { service_name: 'Transfer', rate_eur: 0, total_cost: 45 },
        { service_name: 'Extra', rate_eur: 0, total_cost: 0, client_price: 60 },
      ]),
    ])
    expect(lines.every(l => !l.unpriced)).toBe(true)
  })

  it('carries the operator’s note into the reason, so the fix is at hand', () => {
    const lines = itineraryServiceLines([day(1, [{ service_name: 'Guide', notes: 'Waiting on supplier quote' }])])
    expect(lines[0].issue).toContain('Waiting on supplier quote')
  })

  it('reads string amounts, which is how these columns arrive', () => {
    const lines = itineraryServiceLines([day(1, [{ service_name: 'Hotel', total_cost: '120.00' }])])
    expect(lines[0].unpriced).toBeUndefined()
  })
})

describe('itineraryCompleteness', () => {
  it('an itinerary with every service priced is complete', () => {
    expect(itineraryCompleteness([day(1, [{ service_name: 'Hotel', total_cost: 120 }])]).complete).toBe(true)
  })

  it('an empty itinerary is complete — there is nothing unpriced in it', () => {
    expect(itineraryCompleteness([]).complete).toBe(true)
    expect(itineraryCompleteness(null).complete).toBe(true)
  })

  it('names the gaps with their days', () => {
    const result = itineraryCompleteness([
      day(1, [{ service_name: 'Hotel', total_cost: 120 }]),
      day(3, [{ service_name: 'Guide' }, { service_name: 'Entrance' }]),
    ])
    expect(result.complete).toBe(false)
    expect(result.gaps.map(g => `${g.name}/${g.day}`)).toEqual(['Guide/3', 'Entrance/3'])
  })
})

describe('loadItineraryCompleteness fails CLOSED', () => {
  const client = (over: Record<string, unknown>) =>
    ({
      from: (table: string) => {
        if (table === 'itineraries') {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => over.owned ?? { data: { id: 'i1' }, error: null } }) }) }),
          }
        }
        return { select: () => ({ eq: async () => over.days ?? { data: [], error: null } }) }
      },
    }) as never

  it('refuses when the ownership check errors — never reads as complete', async () => {
    const res = await loadItineraryCompleteness(client({ owned: { data: null, error: { message: 'boom' } } }), 'i1', 't1')
    expect(res).toMatchObject({ ok: false, status: 503 })
  })

  it('refuses when the services cannot be read', async () => {
    const res = await loadItineraryCompleteness(client({ days: { data: null, error: { message: 'boom' } } }), 'i1', 't1')
    expect(res).toMatchObject({ ok: false, status: 503 })
  })

  it('is a 404 for another tenant’s itinerary, and for a missing id', async () => {
    expect(await loadItineraryCompleteness(client({ owned: { data: null, error: null } }), 'i1', 't1'))
      .toMatchObject({ ok: false, status: 404 })
    expect(await loadItineraryCompleteness(client({}), '', 't1')).toMatchObject({ ok: false, status: 404 })
    expect(await loadItineraryCompleteness(client({}), 'i1', null)).toMatchObject({ ok: false, status: 404 })
  })

  it('answers with the completeness when everything reads', async () => {
    const res = await loadItineraryCompleteness(
      client({ days: { data: [{ day_number: 1, services: [{ service_name: 'Guide' }] }], error: null } }),
      'i1',
      't1'
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.completeness.complete).toBe(false)
      expect(res.completeness.gaps[0].name).toBe('Guide')
    }
  })
})
