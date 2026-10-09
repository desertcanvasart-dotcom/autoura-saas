import { describe, it, expect } from 'vitest'
import { partnerSingleSupplement } from '@/lib/quotes/partner-rate-sheet'
import { quoteSentUpdate } from '@/lib/quotes/quote-sent-update'
import { calculatorPricingTable, pickEditable } from '@/lib/quotes/calculator-pricing-table'

describe('partnerSingleSupplement', () => {
  it('adds the quote margin to a supplement stored at cost', () => {
    expect(partnerSingleSupplement({ single_supplement: 200, margin_percent: 25, currency: 'USD' })).toBe(250)
  })
  it('rounds to the currency (no yen decimals)', () => {
    expect(partnerSingleSupplement({ single_supplement: 1001, margin_percent: 15, currency: 'JPY' })).toBe(1151)
  })
  it('keeps a hand-entered supplement when no margin is recorded', () => {
    expect(partnerSingleSupplement({ single_supplement: 180, margin_percent: null, currency: 'EUR' })).toBe(180)
  })
  it('is 0 when there is none', () => {
    expect(partnerSingleSupplement({ single_supplement: 0, margin_percent: 20 })).toBe(0)
    expect(partnerSingleSupplement({ single_supplement: null, margin_percent: 20 })).toBe(0)
  })
})

describe('quoteSentUpdate', () => {
  const now = new Date('2026-10-09T10:00:00Z')
  it('writes no sent_at / sent_via on b2b_quotes (it has neither column)', () => {
    expect(quoteSentUpdate('b2b', 'draft', 'email', now)).toEqual({ status: 'sent' })
  })
  it('records the send on b2c quotes', () => {
    expect(quoteSentUpdate('b2c', 'draft', 'whatsapp', now)).toEqual({
      status: 'sent', sent_at: '2026-10-09T10:00:00.000Z', sent_via: 'whatsapp',
    })
  })
  it('never demotes an accepted quote', () => {
    expect(quoteSentUpdate('b2b', 'accepted', 'email', now)).toBeNull()
    expect(quoteSentUpdate('b2c', 'accepted', 'email', now)).toEqual({ sent_at: '2026-10-09T10:00:00.000Z', sent_via: 'email' })
  })
})

describe('calculatorPricingTable', () => {
  it('always has the quote own group size at its selling price', () => {
    expect(calculatorPricingTable({ pax: 4, sellingPrice: 4000, pricePerPerson: 1000 })).toEqual({ '4': { pp: 1000, total: 4000 } })
  })
  it('adds valid rate-sheet rows and drops junk', () => {
    const table = calculatorPricingTable(
      { pax: 4, sellingPrice: 4000, pricePerPerson: 1000 },
      [{ pax: 2, pp: 1300, total: 2600 }, { pax: 'x', pp: 1, total: 1 }, { pax: 6, pp: -1, total: 10 }, { pax: 4, pp: 999, total: 3996 }]
    )
    expect(table).toEqual({ '2': { pp: 1300, total: 2600 }, '4': { pp: 1000, total: 4000 } })
  })
  it('refuses a quote with no price', () => {
    expect(calculatorPricingTable({ pax: 0, sellingPrice: 100, pricePerPerson: 50 })).toBeNull()
    expect(calculatorPricingTable({ pax: 2, sellingPrice: 0, pricePerPerson: 0 })).toBeNull()
  })
})

describe('pickEditable', () => {
  it('keeps editable fields only', () => {
    expect(pickEditable({ id: 'q', tenant_id: 't', selling_price: 1, quote_number: 'X', partner_id: 'p', notes: 'n' }))
      .toEqual({ partner_id: 'p', notes: 'n' })
  })
})
