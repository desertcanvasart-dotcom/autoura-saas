// The quote emails linked "View Full Quote Details" to /quotes/b2c|b2b/<id> —
// the staff page, so every client and partner who clicked landed on /login.
// With no page they can open, there is no button; the quote is the PDF.
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { render } from '@react-email/render'
import B2CQuoteEmail from '@/components/emails/B2CQuoteEmail'
import B2BQuoteEmail from '@/components/emails/B2BQuoteEmail'

describe('quote emails', () => {
  it('a client quote has no link to the staff quote page', async () => {
    const html = await render(createElement(B2CQuoteEmail, {
      clientName: 'Ada', quoteNumber: 'Q-1', tripName: 'Nile', startDate: '2026-11-01', duration: 5,
      numTravelers: 2, pricePerPerson: 1000, totalPrice: 2000, currency: 'EUR',
    }))
    expect(html).not.toContain('/quotes/')
    expect(html).not.toContain('View Full Quote Details')
  })
  it('a partner rate sheet has none either', async () => {
    const html = await render(createElement(B2BQuoteEmail, {
      partnerName: 'Partner', quoteNumber: 'Q-2', tripName: 'Nile', startDate: null, duration: 5, tier: 'standard',
      tourLeaderIncluded: false, pricingTable: { '2': { pp: 1000, total: 2000 } }, currency: 'EUR',
    }))
    expect(html).not.toContain('/quotes/')
  })
})
