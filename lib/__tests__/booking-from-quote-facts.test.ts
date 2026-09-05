import { describe, it, expect } from 'vitest'
import {
  b2bNumTravelers,
  b2bTotalAmount,
  b2cNumTravelers,
  b2cTotalAmount,
  calculatorTripFacts,
  type B2bQuoteForBooking,
} from '@/lib/bookings/from-quote-facts'

// ============================================
// Booking facts from a B2B quote
// ============================================
// /api/bookings/from-quote used to freeze total_amount = 0 and
// num_travelers = 2 on every B2B booking. These pin the replacement:
// real columns win, legacy pricing tables answer when they can, and a
// quote that holds nothing is REFUSED — never frozen as zero or two.

const quote = (over: Partial<B2bQuoteForBooking>): B2bQuoteForBooking => ({
  selling_price: null,
  pricing_table: [],
  num_adults: null,
  num_children: null,
  ...over,
})

describe('b2bNumTravelers', () => {
  it('adds adults and children (migration 270 columns)', () => {
    expect(b2bNumTravelers(quote({ num_adults: 2, num_children: 1 }))).toEqual({ ok: true, value: 3 })
  })

  it('answers from a single-row pricing sheet on legacy quotes', () => {
    expect(
      b2bNumTravelers(quote({ pricing_table: [{ pax: 4, total: 2000 }] }))
    ).toEqual({ ok: true, value: 4 })
  })

  it('refuses when the quote does not say — never a default of 2', () => {
    const res = b2bNumTravelers(quote({ pricing_table: [{ pax: 2, total: 900 }, { pax: 4, total: 1600 }] }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/how many travellers/)
  })
})

describe('b2bTotalAmount', () => {
  it('uses selling_price when it is a usable number', () => {
    expect(b2bTotalAmount(quote({ selling_price: 1234.5 }), 2)).toEqual({ ok: true, value: 1234.5 })
  })

  it('falls back to the pricing-table row for the booking pax count', () => {
    const q = quote({ pricing_table: [{ pax: 2, total: 900 }, { pax: 4, total: 1600 }] })
    expect(b2bTotalAmount(q, 4)).toEqual({ ok: true, value: 1600 })
  })

  it('uses the only row there is when pax does not match exactly', () => {
    const q = quote({ pricing_table: [{ pax: 3, total: 1500 }] })
    expect(b2bTotalAmount(q, 4)).toEqual({ ok: true, value: 1500 })
  })

  it('refuses an unpriced quote — a zero is never frozen', () => {
    const res = b2bTotalAmount(quote({ selling_price: 0 }), 2)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/no priced total/)
  })

  it('ignores junk rows in the pricing table', () => {
    const q = quote({ pricing_table: [null, 'x', { pax: 'two' }, { pax: 2, total: 'a lot' }] })
    expect(b2bTotalAmount(q, 2).ok).toBe(false)
  })
})

describe('calculatorTripFacts', () => {
  const variation = { variation_name: 'Classic Nile 5D', template_name: 'Classic Nile', duration_days: 5 }

  it('derives dates from travel date + programme duration', () => {
    const res = calculatorTripFacts({ trip_name: null, travel_date: '2026-10-01', variation })
    expect(res).toEqual({
      ok: true,
      value: {
        trip_name: 'Classic Nile — Classic Nile 5D',
        start_date: '2026-10-01',
        end_date: '2026-10-05',
        total_days: 5,
      },
    })
  })

  it('keeps a trip name the quote already has', () => {
    const res = calculatorTripFacts({ trip_name: ' Smith family ', travel_date: '2026-10-01', variation })
    expect(res.ok && res.value.trip_name).toBe('Smith family')
  })

  it('a one-day programme ends the day it starts', () => {
    const res = calculatorTripFacts({
      trip_name: null,
      travel_date: '2026-12-31',
      variation: { ...variation, duration_days: 1 },
    })
    expect(res.ok && res.value.end_date).toBe('2026-12-31')
  })

  it('crosses month boundaries correctly', () => {
    const res = calculatorTripFacts({
      trip_name: null,
      travel_date: '2026-01-30',
      variation: { ...variation, duration_days: 4 },
    })
    expect(res.ok && res.value.end_date).toBe('2026-02-02')
  })

  it('refuses without a travel date, naming the fix', () => {
    const res = calculatorTripFacts({ trip_name: null, travel_date: null, variation })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/travel date/)
  })

  it('refuses when the variation is gone', () => {
    const res = calculatorTripFacts({ trip_name: null, travel_date: '2026-10-01', variation: null })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/no longer exists/)
  })

  it('refuses a duration-less programme rather than guessing', () => {
    const res = calculatorTripFacts({
      trip_name: null,
      travel_date: '2026-10-01',
      variation: { ...variation, duration_days: null },
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/no duration/)
  })
})

// The B2C convert path froze b2cQuote.selling_price verbatim — the columns
// are NOT NULL, so the hole shows up as a 0, and a 0-total booking is a hole
// wearing a booking number. Same rule the B2B path already enforces.
describe('b2cTotalAmount', () => {
  it('a priced quote freezes its selling price', () => {
    const res = b2cTotalAmount({ selling_price: 1240.5, num_travelers: 2 })
    expect(res).toEqual({ ok: true, value: 1240.5 })
  })

  it('a zero selling price is a refusal, never a frozen zero', () => {
    const res = b2cTotalAmount({ selling_price: 0, num_travelers: 2 })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/no priced total/)
  })

  it('total_cost is NOT a fallback — cost is not a selling price', () => {
    // The helper is not even given total_cost; this pins the signature.
    const res = b2cTotalAmount({ selling_price: null, num_travelers: 2 })
    expect(res.ok).toBe(false)
  })
})

describe('b2cNumTravelers', () => {
  it('a real pax count passes through, floored', () => {
    expect(b2cNumTravelers({ selling_price: 100, num_travelers: 3 })).toEqual({ ok: true, value: 3 })
  })

  it('zero travellers is a refusal, never a default', () => {
    const res = b2cNumTravelers({ selling_price: 100, num_travelers: 0 })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/how many travellers/)
  })
})
