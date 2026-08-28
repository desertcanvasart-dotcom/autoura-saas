import { describe, it, expect } from 'vitest'
import { computeAddTravellerReprice } from '../reprice-add-traveller'

// C1c: extending the AGREED per-person rate when travellers are added. The
// negotiated base is sacred — no engine rerun, no guessing; no priced base
// means manual, never zero.

describe('computeAddTravellerReprice', () => {
  it('extends the per-person rate and raises the balance by exactly the delta', () => {
    const r = computeAddTravellerReprice({
      oldTotal: 3000,       // 4 pax at 750
      oldPax: 4,
      addedPax: 2,
      depositPercent: 30,
      oldBalanceDue: 1000,  // 2000 already paid
    })
    expect(r).toEqual({
      method: 'per_person',
      perPerson: 750,
      oldTotal: 3000,
      newTotal: 4500,
      delta: 1500,
      newDepositAmount: 1350,
      newBalanceDue: 2500, // payments preserved: 1000 + 1500
    })
  })

  it('a null balance is treated as settled: the new balance is exactly the delta', () => {
    // Ported semantics: balance_due null → Number(null) = 0 → the customer
    // owes only what the addition costs. An untracked balance must not
    // resurrect the whole trip price as "due".
    const r = computeAddTravellerReprice({
      oldTotal: 1000, oldPax: 2, addedPax: 1, depositPercent: 0, oldBalanceDue: null,
    })
    expect(r.method).toBe('per_person')
    if (r.method === 'per_person') expect(r.newBalanceDue).toBe(500)
  })

  it('no priced base → manual, never a made-up number', () => {
    expect(computeAddTravellerReprice({ oldTotal: null, oldPax: 4, addedPax: 2, depositPercent: 30, oldBalanceDue: 0 }))
      .toEqual({ method: 'manual', reason: 'no per-person price to extend from' })
    expect(computeAddTravellerReprice({ oldTotal: 0, oldPax: 4, addedPax: 2, depositPercent: 30, oldBalanceDue: 0 }).method)
      .toBe('manual')
    expect(computeAddTravellerReprice({ oldTotal: 3000, oldPax: 0, addedPax: 2, depositPercent: 30, oldBalanceDue: 0 }).method)
      .toBe('manual')
  })

  it('zero added travellers is manual too', () => {
    expect(computeAddTravellerReprice({ oldTotal: 3000, oldPax: 4, addedPax: 0, depositPercent: 30, oldBalanceDue: 0 }).method)
      .toBe('manual')
  })

  it('rounds money to cents', () => {
    const r = computeAddTravellerReprice({
      oldTotal: 1000, oldPax: 3, addedPax: 1, depositPercent: 25, oldBalanceDue: 0,
    })
    if (r.method === 'per_person') {
      expect(r.newTotal).toBe(1333.33)
      expect(r.newDepositAmount).toBe(333.33)
    } else {
      throw new Error('expected per_person')
    }
  })
})
