import { describe, it, expect } from 'vitest'
import { officeRule, isOfficeAddress, normaliseOfficeEntry, bareAddress } from '@/lib/email/office-addresses'

// ============================================
// Which addresses are the office's own
// ============================================
// Sync called a message ours only when its From was the connected mailbox
// EXACTLY, so a reply a colleague sent from hello@ on the same domain read as
// the CUSTOMER writing. Since the reply-status work that has a visible cost:
// the conversation sits in "Waiting on us" for an answer that already went.

const rule = (mailboxes: string[], configured: string[] = []) => officeRule(mailboxes, configured)

describe('bareAddress', () => {
  it('reads the address out of a display name', () => {
    expect(bareAddress('Sara at Agency <SARA@Agency.com>')).toBe('sara@agency.com')
    expect(bareAddress('  Ops@Agency.COM ')).toBe('ops@agency.com')
  })
})

describe('the connected mailbox', () => {
  const r = rule(['info@agency.com'])

  it('is ours, however it is written', () => {
    expect(isOfficeAddress(r, 'info@agency.com')).toBe(true)
    expect(isOfficeAddress(r, 'Agency Info <INFO@Agency.com>')).toBe(true)
  })

  it('brings its whole domain with it — the colleague who replied from hello@', () => {
    expect(isOfficeAddress(r, 'hello@agency.com')).toBe(true)
    expect(isOfficeAddress(r, 'sara@agency.com')).toBe(true)
  })

  it('does not make a customer ours', () => {
    expect(isOfficeAddress(r, 'traveller@example.com')).toBe(false)
  })
})

describe('a connected mailbox on a public provider', () => {
  const r = rule(['egypttours@gmail.com'])

  it('is ours', () => {
    expect(isOfficeAddress(r, 'egypttours@gmail.com')).toBe(true)
  })

  it('does NOT make the rest of gmail.com ours — that would swallow every customer', () => {
    expect(isOfficeAddress(r, 'ada.traveller@gmail.com')).toBe(false)
    expect(r.domains).toEqual([])
  })
})

describe('addresses added in Settings', () => {
  it('takes a full address', () => {
    const r = rule(['info@agency.com'], ['reservations@partner-office.com'])
    expect(isOfficeAddress(r, 'reservations@partner-office.com')).toBe(true)
    expect(isOfficeAddress(r, 'someone-else@partner-office.com')).toBe(false)
  })

  it('takes a whole domain, with or without the @', () => {
    const r = rule(['info@agency.com'], ['old-agency.com', '@second-agency.com'])
    expect(isOfficeAddress(r, 'anyone@old-agency.com')).toBe(true)
    expect(isOfficeAddress(r, 'anyone@second-agency.com')).toBe(true)
  })

  it('ignores nonsense rather than matching everything', () => {
    for (const junk of ['', '   ', 'not an address', '@', 'agency', 'http://agency.com/path']) {
      expect(normaliseOfficeEntry(junk), junk).toBeNull()
    }
    const r = rule(['info@agency.com'], ['not an address'])
    expect(isOfficeAddress(r, 'traveller@example.com')).toBe(false)
  })
})

describe('anything that is not an address', () => {
  const r = rule(['info@agency.com'])
  it('is never ours', () => {
    for (const v of [null, undefined, '', 'no-at-sign', 'Name Only']) {
      expect(isOfficeAddress(r, v), String(v)).toBe(false)
    }
  })
})
