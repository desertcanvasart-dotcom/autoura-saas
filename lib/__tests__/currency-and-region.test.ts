import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SUPPORTED_CURRENCIES } from '@/lib/currency'
import { TIMEZONES } from '@/lib/timezones'
import { regionTravelPhrase, isEgypt } from '@/lib/tenant-region'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a company works in its own currency', () => {
  it('Settings → Organization can set it, for every supported currency', () => {
    const src = read('app/settings/tenant/page.tsx')
    expect(src).toContain('id="agency-currency"')
    expect(src).toContain('default_currency: agencyCurrency')
  })
  it('onboarding offers every supported currency', () => {
    expect(read('app/onboarding/steps/BusinessStep.tsx')).toContain('SUPPORTED_CURRENCIES.map(c =>')
  })
  it('new quotes, the Quote Builder default, departures and the dashboard start from it', () => {
    expect(read('app/itineraries/new/page.tsx')).toContain('tenant?.default_currency')
    expect(read('app/itineraries/new/page.tsx')).toContain('SUPPORTED_CURRENCIES.map(c =>')
    expect(read('app/api/user-preferences/route.ts')).toContain('default_currency: companyCurrency')
    expect(read('app/departures/page.tsx')).toContain('currency: companyCurrency')
    expect(read('app/dashboard/page.tsx')).toContain("tenant?.default_currency || 'EUR'")
  })
  it('payment and tour pages print the currency’s own symbol', () => {
    // The euro-literal ratchet (scripts/euro-literal-baseline.json) holds these
    // files at zero hard-coded euro signs.
    for (const f of ['app/payments/new/page.tsx', 'app/payments/record/page.tsx', 'app/tours/[code]/page.tsx']) {
      expect(read(f), f).toContain('getCurrencySymbol(')
    }
  })
  it('every supported currency is offered', () => expect(SUPPORTED_CURRENCIES.length).toBeGreaterThanOrEqual(12))
})

describe('AI prompts name the company’s country, not Egypt for everyone', () => {
  it('the phrase follows the country', () => {
    expect(regionTravelPhrase('Morocco')).toBe('Morocco travel')
    expect(regionTravelPhrase(null)).toBe('travel')
    expect(isEgypt('Egypt')).toBe(true)
    expect(isEgypt('Jordan')).toBe(false)
  })
  it('the Quote Builder parser and lead detector do not hardcode Egypt', () => {
    const parse = read('app/api/pricing-grid/parse/route.ts')
    expect(parse).not.toContain('You are an Egypt travel')
    expect(parse).toContain('isEgypt(country) ? EGYPT_GLOSSARY')
    expect(read('lib/email/email-leads.ts')).not.toContain('tour operator in Egypt')
  })
})

it('the timezone list covers the supported markets', () => {
  const zones = TIMEZONES.map(t => t.value)
  for (const z of ['Africa/Casablanca', 'Asia/Amman', 'Africa/Nairobi', 'Africa/Johannesburg', 'Asia/Riyadh', 'Africa/Tunis', 'Africa/Dar_es_Salaam']) {
    expect(zones).toContain(z)
  }
})
