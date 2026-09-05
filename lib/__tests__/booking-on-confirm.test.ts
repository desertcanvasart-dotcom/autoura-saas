import { describe, it, expect } from 'vitest'
import { itineraryBookingFacts } from '@/lib/bookings/booking-on-confirm'
import { resolveDepositRule, DEFAULT_DEPOSIT_PERCENT, DEFAULT_DEPOSIT_DUE_DAYS } from '@/lib/bookings/deposit-rule'

// ============================================
// Booking on confirm (B-item 7 / A-item 7)
// ============================================
// Confirming an itinerary creates its booking through the ORG's deposit
// rule. Two pinned behaviours: the deposit resolver's explicit → tenant →
// default precedence (mirroring resolve-margin), and the facts helper's
// refusals — a booking is a frozen snapshot, so no dates / no price / no
// pax means NO booking with the reason named, never a frozen zero.

describe('resolveDepositRule', () => {
  it('defaults with no tenant rule', () => {
    expect(resolveDepositRule({})).toEqual({
      depositPercent: DEFAULT_DEPOSIT_PERCENT,
      depositDueDays: DEFAULT_DEPOSIT_DUE_DAYS,
      source: 'default',
    })
  })

  it("the tenant's rule wins over the default — including a deliberate 0%", () => {
    expect(resolveDepositRule({ tenant: { deposit_percent: 20, deposit_due_days: 14 } })).toEqual({
      depositPercent: 20,
      depositDueDays: 14,
      source: 'tenant',
    })
    // 0 is a real rule (no deposit), not a blank.
    expect(resolveDepositRule({ tenant: { deposit_percent: 0 } }).depositPercent).toBe(0)
    expect(resolveDepositRule({ tenant: { deposit_percent: 0 } }).source).toBe('tenant')
  })

  it('an explicit request value wins over the tenant rule', () => {
    const rule = resolveDepositRule({ explicitPercent: 50, tenant: { deposit_percent: 20, deposit_due_days: 14 } })
    expect(rule.depositPercent).toBe(50)
    expect(rule.depositDueDays).toBe(14) // due days have no explicit form
    expect(rule.source).toBe('explicit')
  })

  it('out-of-range or junk values fall through, never clamp silently', () => {
    expect(resolveDepositRule({ tenant: { deposit_percent: 150 } }).depositPercent).toBe(DEFAULT_DEPOSIT_PERCENT)
    expect(resolveDepositRule({ explicitPercent: -5, tenant: { deposit_percent: 20 } }).depositPercent).toBe(20)
  })
})

describe('itineraryBookingFacts', () => {
  const priced = {
    trip_name: 'Nile Classic',
    client_name: 'Smith',
    start_date: '2026-10-01',
    end_date: '2026-10-05',
    total_days: 5,
    num_adults: 2,
    num_children: 1,
    selling_price: 2400,
    currency: 'USD',
  }

  it('books a priced, dated itinerary', () => {
    expect(itineraryBookingFacts(priced)).toEqual({
      ok: true,
      value: {
        trip_name: 'Nile Classic',
        start_date: '2026-10-01',
        end_date: '2026-10-05',
        total_days: 5,
        num_travelers: 3,
        total_amount: 2400,
        currency: 'USD',
      },
    })
  })

  it('falls back to num_travelers when adults/children are unset', () => {
    const r = itineraryBookingFacts({ ...priced, num_adults: null, num_children: null, num_travelers: 4 })
    expect(r.ok && r.value.num_travelers).toBe(4)
  })

  it('refuses without dates, naming the fix', () => {
    const r = itineraryBookingFacts({ ...priced, start_date: null })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/dates/)
  })

  it('refuses an unpriced itinerary — a zero is never frozen', () => {
    for (const selling_price of [null, 0, undefined]) {
      const r = itineraryBookingFacts({ ...priced, selling_price })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toMatch(/selling price/)
    }
  })

  it('refuses without a traveller count', () => {
    const r = itineraryBookingFacts({ ...priced, num_adults: 0, num_children: 0, num_travelers: 0 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/travellers/)
  })
})
