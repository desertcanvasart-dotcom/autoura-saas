import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server'
import { canTryCode, checkLoginCode, hashLoginCode, CODE_MAX_ATTEMPTS, CODE_MAX_SENDS } from '@/lib/supplier-accounts'
import { codeForClaim, codeRecipientsForAgency } from '@/lib/supplier-claims'
import { RATE_LIMITS } from '@/lib/rate-limit'

// Audit SN-1 / SN-2 / SN-3 / SN-6: supplier sign-in hardening.

const taken: string[] = []
let allow: (key: string) => boolean = () => true
vi.mock('@/lib/rate-limit-shared', () => ({
  checkSharedRateLimit: vi.fn(async (identifier: string, type: string) => {
    taken.push(`${type}:${identifier}`)
    return { success: allow(`${type}:${identifier}`), limit: 1, remaining: 0, resetTime: Date.now() + 60_000 }
  }),
}))

const read = (p: string) => readFileSync(p, 'utf8')
const req = (ip = '203.0.113.7') => new NextRequest('https://app.test/api/supplier-auth/code', { method: 'POST', headers: { 'x-forwarded-for': ip } })

describe('sign-in is rate limited per address and per phone, before the phone is looked up (SN-2, SN-3)', () => {
  beforeEach(() => { taken.length = 0; allow = () => true })

  it('counts the address and the phone, separately for code and verify', async () => {
    const { supplierSignInLimited } = await import('@/lib/supplier-rate-limits')
    expect(await supplierSignInLimited(req(), '201112405969', 'code')).toBeNull()
    expect(await supplierSignInLimited(req(), '201112405969', 'verify')).toBeNull()
    expect(taken).toEqual([
      'supplierSignInIp:supplier-sign-in:203.0.113.7',
      'supplierCodePhone:supplier-code:201112405969',
      'supplierSignInIp:supplier-sign-in:203.0.113.7',
      'supplierVerifyPhone:supplier-verify:201112405969',
    ])
  })

  it('a limited phone gets one fixed 429 — the same body for any phone, known or not', async () => {
    const { supplierSignInLimited } = await import('@/lib/supplier-rate-limits')
    allow = key => !key.startsWith('supplierCodePhone')
    const a = await supplierSignInLimited(req(), '201112405969', 'code')
    const b = await supplierSignInLimited(req(), '447700900123', 'code')
    expect(a?.status).toBe(429)
    expect(b?.status).toBe(429)
    expect(await a!.json()).toEqual(await b!.json())
  })

  it('the per-phone code limit is no looser than the per-account send cap, so that wall comes first', () => {
    expect(RATE_LIMITS.supplierCodePhone.limit).toBeLessThanOrEqual(CODE_MAX_SENDS)
  })

  it('both routes check the limit before any supplier lookup, and the code route has no 429 of its own', () => {
    const code = read('app/api/supplier-auth/code/route.ts')
    expect(code.indexOf("supplierSignInLimited(request, parsed.phone, 'code')")).toBeGreaterThan(0)
    expect(code.indexOf("supplierSignInLimited(request, parsed.phone, 'code')")).toBeLessThan(code.indexOf('recordsForPhone(db'))
    expect(code).not.toContain('status: 429')
    const verify = read('app/api/supplier-auth/verify/route.ts')
    expect(verify.indexOf("supplierSignInLimited(request, parsed.phone, 'verify')")).toBeGreaterThan(0)
    expect(verify.indexOf("supplierSignInLimited(request, parsed.phone, 'verify')")).toBeLessThan(verify.indexOf("from('supplier_accounts')"))
  })

  it('the public reply link and the supplier page endpoints are limited per address', () => {
    for (const f of ['app/api/reply/[token]/route.ts', 'app/api/supplier-page/[token]/lines/[lineId]/route.ts']) {
      expect(read(f), f).toContain('supplierLinkLimited(request)')
    }
    expect(read('app/api/supplier-page/[token]/days-off/route.ts').match(/supplierLinkLimited\(request\)/g)?.length).toBe(2)
  })
})

describe('the 5-try cap holds when guesses race (SN-2)', () => {
  const now = new Date('2026-10-31T10:00:00Z')
  const row = (attempts: number) => ({ code_hash: hashLoginCode('123456', 'acc'), expires_at: '2026-10-31T10:05:00Z', attempts, used_at: null })

  it('canTryCode checks everything but the code itself', () => {
    expect(canTryCode(row(0), '999999', now)).toEqual({ ok: true })
    expect(canTryCode(row(CODE_MAX_ATTEMPTS), '123456', now).ok).toBe(false)
    expect(canTryCode(null, '123456', now).ok).toBe(false)
    expect(canTryCode(row(0), '12', now).ok).toBe(false)
    expect(checkLoginCode(row(0), '123 456', 'acc', now)).toEqual({ ok: true })
    expect(checkLoginCode(row(0), '999999', 'acc', now)).toMatchObject({ ok: false, spend: true })
  })

  it('verify takes the try with a compare-and-set on the count BEFORE comparing the code', () => {
    const verify = read('app/api/supplier-auth/verify/route.ts')
    const cas = verify.indexOf(".eq('attempts', live!.attempts)")
    expect(cas).toBeGreaterThan(0)
    expect(cas).toBeLessThan(verify.indexOf('checkLoginCode(live'))
    expect(verify).not.toContain('attempts: row.attempts + 1')
    // A lost race is turned away without the code being compared.
    expect(verify.slice(cas, verify.indexOf('checkLoginCode(live'))).toContain('taken.length === 0')
  })
})

describe('the approval card says where the code went, this agency\'s addresses only (SN-1)', () => {
  it('shows the addresses on your own record and only a count of the rest', () => {
    expect(codeRecipientsForAgency('ops@nile.com, Thief@agency-b.com', { email: 'OPS@nile.com', contact_email: null }))
      .toEqual({ yours: ['ops@nile.com'], others: 1 })
    expect(codeRecipientsForAgency('thief@agency-b.com', { email: 'ops@nile.com' })).toEqual({ yours: [], others: 1 })
    expect(codeRecipientsForAgency('ops@nile.com', { contact_email: 'ops@nile.com' })).toEqual({ yours: ['ops@nile.com'], others: 0 })
    expect(codeRecipientsForAgency(null, { email: 'ops@nile.com' })).toBeNull()
  })

  it('picks the code that made the claim, not a later sign-in', () => {
    const codes = [
      { account_id: 'a', used_at: '2026-10-31T12:00:00Z', sent_to: 'later@x.com' },
      { account_id: 'a', used_at: '2026-10-30T09:00:00Z', sent_to: 'first@x.com' },
      { account_id: 'b', used_at: '2026-10-30T09:00:00Z', sent_to: 'other@x.com' },
    ]
    expect(codeForClaim(codes, { account_id: 'a', requested_at: '2026-10-30T09:00:01Z' })?.sent_to).toBe('first@x.com')
    expect(codeForClaim(codes, { account_id: 'c', requested_at: '2026-10-30T09:00:01Z' })).toBeNull()
  })

  it('the claims API never sends the raw list of addresses to the browser', () => {
    const route = read('app/api/supplier-claims/route.ts')
    expect(route).toContain('code_sent_to: codeRecipientsForAgency(')
    expect(route).not.toMatch(/sent_to:\s*\w+\.sent_to/)
    expect(read('components/SupplierSignInRequests.tsx')).toContain('Only approve if you recognise this email')
  })
})

describe('only managers and up get the supplier page URL back (SN-6)', () => {
  it('GET hands back the URL only past the same writer check as POST / DELETE', () => {
    const route = read('app/api/suppliers/[id]/portal-link/route.ts')
    const get = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'))
    expect(get).toContain("const mayHoldLink = !roleDenied(auth.role, 'manage')")
    expect(get).toContain('url: mayHoldLink ? pageUrl(request, link.token as string) : null')
  })
})
