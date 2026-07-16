import { describe, it, expect } from 'vitest'
import { validateDepartureSync, mapSyncStatus, durationDays } from '@/lib/departure-mirror'

const VALID = {
  brand: 'sawa-tours',
  event: 'departure.sync',
  departure: {
    externalId: 1037, route: 'Giza Pyramids day tour', type: 'day_tour',
    date: '2026-10-07', endDate: null, time: '09:00', city: 'Cairo',
    minSeats: 4, maxSeats: 12, seatsTaken: 3, status: 'open', priceFrom: 52, currency: 'USD',
  },
}

describe('validateDepartureSync', () => {
  it('accepts a valid snapshot (numeric externalId included)', () => {
    expect(validateDepartureSync(VALID).ok).toBe(true)
  })
  it('requires brand, externalId, route, date and a known status', () => {
    for (const strip of [
      (p: any) => delete p.brand,
      (p: any) => delete p.departure.externalId,
      (p: any) => delete p.departure.route,
      (p: any) => (p.departure.date = '07/10/2026'),
      (p: any) => (p.departure.status = 'exploded'),
    ]) {
      const p = JSON.parse(JSON.stringify(VALID))
      strip(p)
      expect(validateDepartureSync(p).ok).toBe(false)
    }
  })
  it('rejects a malformed endDate but accepts null', () => {
    const p = JSON.parse(JSON.stringify(VALID))
    p.departure.endDate = 'soon'
    expect(validateDepartureSync(p).ok).toBe(false)
    p.departure.endDate = null
    expect(validateDepartureSync(p).ok).toBe(true)
  })
})

describe('mapSyncStatus', () => {
  it('maps the Sawa lifecycle onto tour_departures statuses', () => {
    expect(mapSyncStatus('open')).toEqual({ status: 'open', isGuaranteed: false })
    expect(mapSyncStatus('minimum_reached')).toEqual({ status: 'guaranteed', isGuaranteed: true })
    expect(mapSyncStatus('supplier_confirmed')).toEqual({ status: 'guaranteed', isGuaranteed: true })
    expect(mapSyncStatus('closed')).toEqual({ status: 'full', isGuaranteed: false })
    expect(mapSyncStatus('cancelled')).toEqual({ status: 'cancelled', isGuaranteed: false })
  })
  it('refuses to mirror pending_review (Sawa-internal state)', () => {
    expect(mapSyncStatus('pending_review')).toBeNull()
  })
})

describe('durationDays', () => {
  it('day tour = 1; package = inclusive span; garbage falls back to 1', () => {
    expect(durationDays('2026-10-07', null)).toBe(1)
    expect(durationDays('2026-10-07', '2026-10-11')).toBe(5)
    expect(durationDays('2026-10-07', '2026-10-01')).toBe(1)
  })
})
