import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { secretMatches, bearerMatches } from '@/lib/support/probe-auth'
import { withoutKeys, IDENTITY_KEYS } from '@/lib/without-keys'
import { RATE_LIMITS } from '@/lib/rate-limit'

// Second launch review (2026-10-16): the fixes that close what it found.
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('texts from a template cannot be sent without limit', () => {
  const src = read('app/api/templates/send/route.ts')
  it('staff only', () => expect(src).toContain("roleDenied(authResult.role, 'staff')"))
  it('SMS and WhatsApp are capped per person and per company, in the database', () => {
    expect(src).toContain("checkSharedRateLimit(authResult.user!.id, 'messaging')")
    expect(src).toContain("checkSharedRateLimit(tenant_id, 'messagingCompany')")
    expect(RATE_LIMITS.messaging.limit).toBeLessThanOrEqual(30)
  })
  it('template email carries the caller session past the middleware', () => {
    expect(src).toMatch(/cookie,\n\s+\},/)
  })
})

describe('Gmail connect is bound to the signed-in user', () => {
  const src = read('app/api/auth/google/callback/route.ts')
  it('the browser finishing the flow must be the user the state was minted for', () => {
    expect(src).toContain('sessionUser.id !== userId')
    expect(src.indexOf('sessionUser.id !== userId')).toBeLessThan(src.indexOf('getTokensFromCode('))
  })
  it('the error parameter is encoded', () => expect(src).toContain('encodeURIComponent(error)'))
})

describe('service-role write routes check the role', () => {
  const routes: Array<[string, number]> = [
    ['app/api/cruises/route.ts', 1], ['app/api/cruises/[id]/route.ts', 2], ['app/api/guides/route.ts', 1],
    ['app/api/resources/attractions/route.ts', 1], ['app/api/whatsapp/send-contract/route.ts', 1],
    ['app/api/whatsapp/send-supplier-document/route.ts', 1], ['app/api/whatsapp/notify-guide/route.ts', 1],
    ['app/api/whatsapp/notify-resource/route.ts', 1], ['app/api/notifications/route.ts', 1],
    ['app/api/quotes/b2c/[id]/route.ts', 2], ['app/api/email/links/route.ts', 2],
    ['app/api/bookings/[id]/payments/route.ts', 1], ['app/api/bookings/[id]/send-confirmation/route.ts', 1],
    ['app/api/pricing-grid/save/route.ts', 1],
  ]
  for (const [r, n] of routes) {
    it(r, () => expect((read(r).match(/gateRole\('staff'\)/g) ?? []).length).toBeGreaterThanOrEqual(n))
  }
})

describe('bodies cannot set identity fields', () => {
  it('withoutKeys drops id and tenant_id', () => {
    expect(withoutKeys({ id: 'x', tenant_id: 'other', ship_name: 'A' }, IDENTITY_KEYS)).toEqual({ ship_name: 'A' })
  })
  it('the cruise routes use it', () => {
    expect(read('app/api/cruises/[id]/route.ts')).toContain('withoutKeys(await request.json(), IDENTITY_KEYS)')
    expect(read('app/api/cruises/route.ts')).toContain('withoutKeys(await request.json(), IDENTITY_KEYS)')
  })
  it('an attraction may only name the company’s own supplier', () => {
    const src = read('app/api/resources/attractions/route.ts')
    expect(src).toMatch(/from\('suppliers'\)[\s\S]{0,120}\.eq\('tenant_id', authResult\.tenant_id\)/)
  })
})

describe('smaller holes', () => {
  it('notification links stay inside the app', () => {
    expect(read('app/api/notifications/route.ts')).toContain('link: safeReturnPath(link) ?? undefined')
  })
  it('a supplier document must be a real PDF under 10 MB', () => {
    expect(read('app/api/whatsapp/send-supplier-document/route.ts')).toContain("!== '%PDF-'")
  })
  it('secrets compare in constant time', () => {
    expect(secretMatches('abc', 'abc')).toBe(true)
    expect(secretMatches('abd', 'abc')).toBe(false)
    expect(secretMatches('abc', undefined)).toBe(false)
    expect(secretMatches(null, 'abc')).toBe(false)
    expect(bearerMatches('Bearer s', 's')).toBe(true)
    for (const f of ['refresh-exchange-rates', 'process-agent-memory', 'mail-alerts', 'gmail-sync', 'send-reminders', 'scheduled-send', 'purge-traveller-documents', 'purge-closed-companies', 'task-reminders']) {
      const src = read(`app/api/cron/${f}/route.ts`)
      expect(src, f).toMatch(/bearerMatches\(|secretMatches\(/)
      expect(src, f).not.toMatch(/!== `Bearer \$\{/)
    }
  })
})
