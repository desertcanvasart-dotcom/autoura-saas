import { describe, it, expect } from 'vitest'
import {
  resolveSender,
  isValidSendingDomain,
  previewSenderAddress,
  bareAddress,
} from '@/lib/tenant-email-domain'

// ============================================================================
// Which domain mail leaves from. The rule that matters: a tenant address is
// used ONLY while status is exactly 'verified'.
//
// Getting it wrong does not misdeliver — Resend rejects a send from an
// unverified domain — it turns a working invoice reminder into a hard failure.
// That is the same silent-breakage class as the Gmail transport this replaced,
// so the decision lives in one pure function and is pinned here.
// ============================================================================

const PLATFORM = 'AUTOURA <quotes@getautoura.net>'

const verified = {
  company_name: 'Sawa Tours',
  email_domain: 'sawatours.org',
  email_from_local: 'invoices',
  email_domain_status: 'verified',
}

describe('a verified tenant sends as itself', () => {
  it('uses the operator’s own domain and name', () => {
    const r = resolveSender(verified, PLATFORM)
    expect(r.from).toBe('Sawa Tours <invoices@sawatours.org>')
    expect(r.usingTenantDomain).toBe(true)
    expect(r.fallbackReason).toBeUndefined()
  })

  it('honours the chosen local part', () => {
    expect(resolveSender({ ...verified, email_from_local: 'bookings' }, PLATFORM).from)
      .toBe('Sawa Tours <bookings@sawatours.org>')
  })

  it('lower-cases the domain and defaults a missing local part', () => {
    const r = resolveSender({ ...verified, email_domain: 'SawaTours.ORG', email_from_local: null }, PLATFORM)
    expect(r.from).toBe('Sawa Tours <invoices@sawatours.org>')
  })

  it('quotes a display name that would otherwise break the header', () => {
    const r = resolveSender({ ...verified, company_name: 'Sawa, Tours <Egypt>' }, PLATFORM)
    expect(r.from).toBe('"Sawa, Tours Egypt" <invoices@sawatours.org>')
  })

  it('strips CRLF from the company name — that is header injection', () => {
    // company_name is operator-editable, so it is untrusted input in a header.
    const r = resolveSender(
      { ...verified, company_name: 'Sawa\r\nBcc: victim@example.com' },
      PLATFORM
    )
    // The newline is what made this injection; once stripped, the remaining
    // text is inert inside a quoted display name.
    expect(r.from).not.toContain('\r')
    expect(r.from).not.toContain('\n')
    expect(r.from.split('\n')).toHaveLength(1)
    expect(r.from).toBe('"Sawa Bcc: victim@example.com" <invoices@sawatours.org>')
  })

  it('falls back to the bare address when the name strips to nothing', () => {
    const r = resolveSender({ ...verified, company_name: '<<>>' }, PLATFORM)
    expect(r.from).toBe('invoices@sawatours.org')
  })
})

describe('anything short of verified falls back to the platform', () => {
  it('falls back on every non-verified status', () => {
    for (const status of ['pending', 'failed', 'not_configured', '', null, undefined, 'VERIFIED']) {
      const r = resolveSender({ ...verified, email_domain_status: status as string }, PLATFORM)
      expect(r.usingTenantDomain, String(status)).toBe(false)
      expect(r.from, String(status)).toBe('Sawa Tours <quotes@getautoura.net>')
      expect(r.fallbackReason, String(status)).toBe('not_verified')
    }
  })

  it('is case-sensitive on purpose — "Verified" is not verified', () => {
    // Status comes from a CHECK-constrained column; anything else is a bug
    // upstream and must not be trusted into a send.
    expect(resolveSender({ ...verified, email_domain_status: 'Verified' }, PLATFORM).usingTenantDomain).toBe(false)
  })

  it('falls back when no domain is set, keeping the operator’s name', () => {
    const r = resolveSender({ company_name: 'Sillage Egypte' }, PLATFORM)
    expect(r.from).toBe('Sillage Egypte <quotes@getautoura.net>')
    expect(r.fallbackReason).toBe('no_domain')
  })

  it('falls back on a verified-but-malformed domain rather than sending garbage', () => {
    const r = resolveSender({ ...verified, email_domain: 'https://sawatours.org/mail' }, PLATFORM)
    expect(r.usingTenantDomain).toBe(false)
    expect(r.fallbackReason).toBe('invalid')
  })

  it('uses the platform sender verbatim when there is no company name', () => {
    expect(resolveSender({}, PLATFORM).from).toBe(PLATFORM)
    expect(resolveSender(null, PLATFORM).from).toBe(PLATFORM)
  })
})

describe('isValidSendingDomain', () => {
  it('accepts real domains', () => {
    for (const d of ['sawatours.org', 'mail.sawatours.org', 'a-b.co.uk', 'x1.io']) {
      expect(isValidSendingDomain(d), d).toBe(true)
    }
  })

  it('rejects what operators actually paste by mistake', () => {
    for (const d of [
      'https://sawatours.org',
      'invoices@sawatours.org',
      'sawatours.org/mail',
      'sawatours.org:25',
      'sawa tours.org',
      'localhost',
      '',
      null,
      undefined,
    ]) {
      expect(isValidSendingDomain(d as string), String(d)).toBe(false)
    }
  })
})

describe('previewSenderAddress', () => {
  it('shows what they will send as before verification completes', () => {
    expect(previewSenderAddress({ email_domain: 'sawatours.org', email_from_local: 'hello' }))
      .toBe('hello@sawatours.org')
  })

  it('rejects an invalid local part rather than building a broken address', () => {
    expect(previewSenderAddress({ email_domain: 'sawatours.org', email_from_local: 'not a local' }))
      .toBe('invoices@sawatours.org')
  })

  it('returns null when there is no usable domain', () => {
    expect(previewSenderAddress({ email_domain: null })).toBeNull()
    expect(previewSenderAddress({ email_domain: 'nope' })).toBeNull()
  })
})

describe('bareAddress', () => {
  it('strips a display name', () => {
    expect(bareAddress('AUTOURA <quotes@getautoura.net>')).toBe('quotes@getautoura.net')
    expect(bareAddress('quotes@getautoura.net')).toBe('quotes@getautoura.net')
  })
})
