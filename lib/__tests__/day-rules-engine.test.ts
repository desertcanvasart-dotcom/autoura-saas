import { describe, it, expect } from 'vitest'
import { applyDayRules, applyB2BDayRules } from '@/lib/ai/day-rules-engine'

const FULL = 'full-package'

describe('applyDayRules', () => {
  it('returns input unchanged for empty/invalid', () => {
    expect(applyDayRules([], FULL)).toEqual([])
    expect(applyDayRules(null as any, FULL)).toBeNull()
  })

  it('is pure — does not mutate the input', () => {
    const days = [{ title: 'Arrival', attractions: ['Khan El Khalili Fish Market'] }, { title: 'Departure' }]
    const snapshot = JSON.stringify(days)
    applyDayRules(days, FULL)
    expect(JSON.stringify(days)).toBe(snapshot)
  })

  it('sets arrival flags + transfer-only on a bare first day of a full package', () => {
    const [d0] = applyDayRules([{ title: 'Arrival in Cairo', attractions: [] }, { title: 'Pyramids visit' }], FULL)
    expect(d0.is_arrival).toBe(true)
    expect(d0.needs_airport_service).toBe(true)
    expect(d0.needs_hotel_service).toBe(true)
    expect(d0.is_transfer_only).toBe(true)
    expect(d0.guide_required).toBe(false)
  })

  it('keeps attractions on an arrival day that also has sightseeing', () => {
    const [d0] = applyDayRules(
      [{ title: 'Arrival + Pyramids visit', attractions: ['Giza Pyramids'] }, { title: 'Departure' }],
      FULL
    )
    expect(d0.is_arrival).toBe(true)
    expect(d0.is_transfer_only).toBeUndefined()
    expect(d0.attractions).toEqual(['Giza Pyramids'])
  })

  it('sets departure + transfer-only on the last day', () => {
    const days = applyDayRules([{ title: 'Pyramids visit' }, { title: 'Departure transfer to airport', attractions: [] }], FULL)
    const last = days[days.length - 1]
    expect(last.is_departure).toBe(true)
    expect(last.is_transfer_only).toBe(true)
    expect(last.attractions).toEqual([])
  })

  it('moves meal venues to photo_stops (no entrance fee)', () => {
    const [d] = applyDayRules([{ title: 'Old Cairo tour', attractions: ['Egyptian Museum', 'Local Restaurant'] }], 'day-trips')
    expect(d.attractions).toEqual(['Egyptian Museum'])
    expect(d.photo_stops).toContain('Local Restaurant')
  })

  it('removes geographic/vague non-attractions silently', () => {
    const [d] = applyDayRules([{ title: 'Free day', attractions: ['Red Sea', 'Free Time', 'Snorkeling Sites'] }], 'day-trips')
    expect(d.attractions).toEqual([])
  })

  it('removes cruise-bundled activities; keeps off the photo_stops on cruise days', () => {
    const [cruise] = applyDayRules([{ title: 'Cruise day', is_cruise_day: true, attractions: ['Felucca Ride', 'Kom Ombo Temple'] }], 'cruise-package')
    expect(cruise.attractions).toEqual(['Kom Ombo Temple'])
    expect(cruise.photo_stops || []).not.toContain('Felucca Ride')

    const [land] = applyDayRules([{ title: 'Aswan tour', attractions: ['Felucca Ride', 'Philae Temple'] }], 'day-trips')
    expect(land.attractions).toEqual(['Philae Temple'])
    expect(land.photo_stops).toContain('Felucca Ride')
  })

  it('clears attractions + guide on a free day', () => {
    const [d] = applyDayRules([{ title: 'Leisure', is_free_day: true, attractions: ['Egyptian Museum'], guide_required: true }], 'day-trips')
    expect(d.attractions).toEqual([])
    expect(d.guide_required).toBe(false)
  })

  it('does NOT apply arrival/departure rules for non-full packages', () => {
    const [d0] = applyDayRules([{ title: 'Arrival', attractions: [] }, { title: 'Day 2' }], 'day-trips')
    expect(d0.is_arrival).toBeUndefined()
    expect(d0.is_transfer_only).toBeUndefined()
  })
})

describe('applyB2BDayRules', () => {
  it('forces arrival/departure service flags on first/last days', () => {
    const days = applyB2BDayRules([{ title: 'Arrival' }, { title: 'Tour' }, { title: 'Departure' }])
    expect(days[0].services.airport_arrival).toBe(true)
    expect(days[0].services.hotel_checkin).toBe(true)
    expect(days[2].services.airport_departure).toBe(true)
    expect(days[2].services.hotel_checkout).toBe(true)
  })

  it('marks a bare first day transfer-only (clears attractions, no guide)', () => {
    const [d0] = applyB2BDayRules([{ title: 'Arrival', attractions: [] }, { title: 'Pyramids visit' }])
    expect(d0.attractions).toEqual([])
    expect(d0.services.guide_required).toBe(false)
  })

  it('filters meal venues from attractions', () => {
    const [d] = applyB2BDayRules([{ title: 'Cairo', attractions: ['Egyptian Museum', 'Local Restaurant'] }])
    expect(d.attractions).toEqual(['Egyptian Museum'])
  })
})
