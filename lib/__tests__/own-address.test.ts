import { describe, it, expect } from 'vitest'
import { isOwnAddress } from '@/lib/email/own-address'

describe('is this address the agency\'s own?', () => {
  const own = {
    mailboxes: ['info@travel2egypt.com'],
    configured: ['reservations@partner-office.com'],
    people: ['rabab.saber85@gmail.com', 'Adham <adham@travel2egypt.com>'],
  }
  it('a team member\'s own email, on a public provider, is the office\'s', () => {
    expect(isOwnAddress(own, 'rabab.saber85@gmail.com')).toBe(true)
    expect(isOwnAddress(own, 'Rabab Saber <RABAB.SABER85@gmail.com>')).toBe(true)
  })
  it('the connected mailbox, its domain, and the configured office addresses', () => {
    expect(isOwnAddress(own, 'info@travel2egypt.com')).toBe(true)
    expect(isOwnAddress(own, 'hello@travel2egypt.com')).toBe(true)
    expect(isOwnAddress(own, 'reservations@partner-office.com')).toBe(true)
  })
  it('a client on gmail.com is a client', () => {
    expect(isOwnAddress(own, 'tersa.smith@gmail.com')).toBe(false)
    expect(isOwnAddress(own, '')).toBe(false)
  })
})
