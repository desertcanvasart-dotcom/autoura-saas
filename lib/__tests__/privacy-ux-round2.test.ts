import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { maskPhone } from '@/lib/log-mask'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('maskPhone', () => {
  it('keeps only the last four digits', () => {
    expect(maskPhone('whatsapp:+20 100 123 4567')).toBe('…4567')
  })
  it('hides short or empty values', () => {
    expect(maskPhone('123')).toBe('…')
    expect(maskPhone(null)).toBe('')
  })
  it('is used by the WhatsApp webhook and status callback logs', () => {
    expect(read('app/api/whatsapp/webhook/route.ts')).toContain('maskPhone(')
    expect(read('app/api/whatsapp/status-callback/route.ts')).toContain('maskPhone(')
  })
})

describe('cookie consent can be withdrawn', () => {
  it('clears the same key the banner stores', () => {
    const link = read('components/CookieSettingsLink.tsx')
    expect(link).toContain("'autoura-analytics-consent'")
    expect(link).toContain('removeItem')
  })
  it.each([
    'app/page.tsx',
    'components/blog/BlogChrome.tsx',
    'app/(public)/about/page.tsx',
    'app/(public)/contact/page.tsx',
    'app/(public)/integrations/page.tsx',
    'app/(public)/pricing/page.tsx',
    'app/(public)/terms/page.tsx',
  ])('%s footer offers Cookie settings', (file) => {
    expect(read(file)).toContain('<CookieSettingsLink')
  })
})

describe('invitees accept the terms', () => {
  it('the accept page asks and the API records it server-side', () => {
    expect(read('app/invite/accept/page.tsx')).toContain('accepted_terms')
    const route = read('app/api/invitations/accept/route.ts')
    expect(route).toContain('accepted_terms')
    expect(route).toContain('terms_accepted_at')
  })
})

describe('entering the app is a full navigation', () => {
  it('AuthContext and onboarding load the app fresh, not via the client router', () => {
    expect(read('app/contexts/AuthContext.tsx')).toContain('window.location.assign')
    expect(read('app/onboarding/onboarding-content.tsx')).toContain("window.location.assign('/dashboard')")
  })
})

describe('a list that fails to load says so', () => {
  it.each([
    'app/clients/page.tsx',
    'app/itineraries/page.tsx',
    'app/payments/_views/PaymentsView.tsx',
    'app/suppliers/suppliers-content.tsx',
  ])('%s shows LoadError instead of the empty state', (file) => {
    const src = read(file)
    expect(src).toContain('<LoadError')
    expect(src).toContain('setLoadError(true)')
  })
})
