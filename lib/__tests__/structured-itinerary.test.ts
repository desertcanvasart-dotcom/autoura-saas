import { describe, it, expect } from 'vitest'
import {
  isStructuredItinerary, parseStructuredItinerary, readStructuredHeader, itineraryTemplate, namesList, matchOption,
} from '@/app/pricing-grid/lib/structured-itinerary'
import { readbackText } from '@/app/pricing-grid/lib/readback'
import type { AllRates, RateOption } from '@/app/pricing-grid/types'

const opt = (id: string, name: string, extra: Partial<RateOption> = {}): RateOption =>
  ({ id, name, rateEur: 10, rateNonEur: 10, ...extra })

const rates: AllRates = {
  route: [
    opt('t1__sedan', 'Cairo Airport Transfer · Airport Transfer', { city: 'Cairo', capacity_min: 1, capacity_max: 2, row_id: 't1' }),
    opt('t1__van', 'Cairo Airport Transfer · Airport Transfer', { city: 'Cairo', capacity_min: 3, capacity_max: 12, row_id: 't1v' }),
    opt('t2__van', 'Airport → Full Day → Airport (Sphinx) · Airport Transfer', { city: 'Cairo', capacity_min: 1, capacity_max: 12 }),
    opt('t3__sedan', 'Full day Cairo · Day Tour', { city: 'Cairo', capacity_min: 1, capacity_max: 2 }),
  ],
  accommodation: [opt('h1', 'Marriott Mena House Giza (luxury | BB)', { city: 'Giza', single_supp_eur: 50 })],
  entrance_fees: [opt('e1', 'Pyramids of Giza', { city: 'Giza' }), opt('e2', 'Egyptian Museum', { city: 'Cairo' })],
  guide: [opt('g1', 'English Egyptologist · Cairo', { city: 'Cairo' })],
  meals: [opt('m1', 'Lunch at Andrea', { city: 'Giza' })],
  airport_services: [], hotel_services: [], tipping: [], boat_rides: [], flights: [], experiences: [], water: [], cruise: [],
}

const TEXT = `Package: Full Package
Tier: luxury
Travellers: 2
Start: 2026-11-01

Day 1 — Cairo
Transport: Cairo Airport Transfer
Hotel: Marriott Mena House
Notes: Arrival

Day 2 — Giza
Transport: Full day Cairo (sedan)
Hotel: Marriott Mena House
Guide: English Egyptologist
Entrances: Pyramids of Giza; Egyptian Museum; Karnak Temple
Other (Group): 40`

let n = 0
const newId = () => `id${++n}`

describe('the structured format', () => {
  it('is told apart from free text', () => {
    expect(isStructuredItinerary(TEXT)).toBe(true)
    expect(isStructuredItinerary('Hi! We are 2 people arriving Cairo on 1 Nov.\nDay 1: arrival and transfer to the hotel, then rest.\nDay 2: pyramids.')).toBe(false)
    expect(isStructuredItinerary('Hotel: Mena House please')).toBe(false)
  })

  it('reads the header', () => {
    expect(readStructuredHeader(TEXT)).toEqual({ packageType: 'full-package', tier: 'luxury', pax: 2, startDate: '2026-11-01' })
  })

  it('matches every line to a rate, by name, without guessing', () => {
    const { days, unmatched } = parseStructuredItinerary(TEXT, rates, 4, newId)
    expect(days.map(d => [d.dayNumber, d.city])).toEqual([[1, 'Cairo'], [2, 'Giza']])
    const slot = (d: number, id: string) => days[d].slots.find(s => s.slotId === id)!
    // The plain transfer, not the layover tour; the vehicle for 2 (the header's party).
    expect(slot(0, 'route').selectedItems.map(i => i.rateId)).toEqual(['t1__sedan'])
    // The hotel with its single supplement, as a pick in the grid makes it.
    expect(slot(0, 'accommodation').selectedItems.map(i => i.rateId)).toEqual(['h1', 'h1_supp'])
    expect(days[0].description).toBe('Arrival')
    expect(slot(1, 'route').selectedItems.map(i => i.rateId)).toEqual(['t3__sedan'])
    expect(slot(1, 'guide').selectedItems.map(i => i.rateId)).toEqual(['g1'])
    expect(slot(1, 'entrance_fees').selectedItems.map(i => i.rateId)).toEqual(['e1', 'e2'])
    expect(slot(1, 'other_group').customAmount).toBe(40)
    expect(unmatched).toHaveLength(1)
    expect(unmatched[0]).toContain('Karnak Temple')
  })

  it('does not choose between two names that fit equally', () => {
    const two = [opt('a', 'Nile Palace (standard | BB)', { city: 'Luxor' }), opt('b', 'Nile Palace (standard | HB)', { city: 'Aswan' })]
    expect(matchOption('Nile Palace', two, '')).toBeNull()
    expect(matchOption('Nile Palace', two, 'Aswan')?.id).toBe('b')
  })

  it('reads back what the readback writes (copy out, paste back in)', () => {
    const first = parseStructuredItinerary(TEXT, rates, 2, newId)
    const again = parseStructuredItinerary(readbackText(first.days, { packageName: 'Full Package', tier: 'luxury', pax: 2 }), rates, 2, newId)
    const ids = (r: typeof first) => r.days.map(d => d.slots.flatMap(s => s.selectedItems.map(i => i.rateId)))
    expect(again.unmatched).toEqual([])
    expect(ids(again)).toEqual(ids(first))
  })

  it('writes a template in the agency names, that reads back clean', () => {
    const t = itineraryTemplate(rates, { packageName: 'Full Package', tier: 'luxury', pax: 2, startDate: '2026-11-01' })
    expect(t).toContain('Hotel: Marriott Mena House Giza (luxury | BB)')
    expect(isStructuredItinerary(t)).toBe(true)
    expect(parseStructuredItinerary(t, rates, 2, newId).unmatched).toEqual([])
    expect(namesList(rates)).toContain('Pyramids of Giza')
  })
})
