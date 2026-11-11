import { describe, it, expect } from 'vitest'
import { officeRule } from '@/lib/email/office-addresses'
import { relayedSender, effectiveSender } from '@/lib/email/relayed-sender'

// A company website's itinerary form: From concierge@ (office domain), To
// info@ (office), Reply-To the traveller. Before this rule the thread was read
// as the office writing to itself and dropped.

const office = officeRule(['hello@agency.example'], [])

const form = {
  from: 'Agency Concierge <concierge@agency.example>',
  to: 'info@agency.example',
  replyTo: 'Jane Traveller <Jane.Traveller@mail.test>',
}

describe('relayedSender', () => {
  it('a website form to the office names the traveller from Reply-To', () => {
    expect(relayedSender(office, form)).toBe('jane.traveller@mail.test')
    expect(effectiveSender(office, form)).toEqual({ direction: 'inbound', email: 'jane.traveller@mail.test', relayed: true })
  })

  it('also when the form writes to the connected mailbox, with office Cc', () => {
    expect(relayedSender(office, { ...form, to: 'hello@agency.example', cc: 'sales@agency.example' })).toBe('jane.traveller@mail.test')
  })

  it('staff writing to a client is unchanged — outbound, not relayed', () => {
    const h = { from: 'hello@agency.example', to: 'client@mail.test', replyTo: 'hello@agency.example' }
    expect(relayedSender(office, h)).toBeNull()
    expect(effectiveSender(office, h).direction).toBe('outbound')
  })

  it('an office message with an outside Reply-To but a client in Cc is not relayed', () => {
    expect(relayedSender(office, { ...form, cc: 'client@mail.test' })).toBeNull()
  })

  it('a colleague forwarding by hand (no outside Reply-To) stays the office', () => {
    const h = { from: 'info@agency.example', to: 'hello@agency.example' }
    expect(relayedSender(office, h)).toBeNull()
    expect(effectiveSender(office, h).direction).toBe('outbound')
  })

  it('a Reply-To that is itself the office is not a traveller', () => {
    expect(relayedSender(office, { ...form, replyTo: 'bookings@agency.example' })).toBeNull()
  })

  it('a customer writing directly is inbound from their own address', () => {
    expect(effectiveSender(office, { from: 'Ann <ann@mail.test>', to: 'hello@agency.example', replyTo: 'other@mail.test' }))
      .toEqual({ direction: 'inbound', email: 'ann@mail.test', relayed: false })
  })
})
