// The contract PDF ignored everything set on the contract page: it printed a
// fixed "10% deposit", its own inclusion and exclusion lists, and no
// cancellation terms. Every contract named Egypt (payment on arrival, visas,
// an Egyptologist, Egyptian law), whoever the operator; those now come from
// Settings → Organization. A trip with no price crashed the preview and the
// PDF, or printed "NaN".
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  cancellationLines, contractPrice, contractSettingsFromTenant, defaultContractTerms, governingLawNote,
  paymentTermsText, sanitizeContractEdits, standardTerms,
} from '@/lib/contract-terms'
import { generateContractPDF } from '@/lib/contract-pdf-generator'

const egypt = { operatingCountry: 'Egypt', governingLaw: 'Egyptian law', depositPercent: 25 }

async function contractText(extra: Record<string, unknown> = {}) {
  const bytes = await generateContractPDF({
    company: { name: 'Nile Journeys' }, contractNumber: 'C-1', contractDate: '2026-10-02', clientName: 'Jamie',
    numTravelers: 2, tourName: 'Nile', startDate: '2026-11-01', endDate: '2026-11-08', destinations: 'Cairo',
    totalCost: 2000, currency: 'USD', ...extra,
  } as never)
  const raw = Buffer.from(bytes).toString('latin1')
  return [...raw.matchAll(/\((.*?)\) Tj/g)].map(m => m[1]).join(' ')
}

describe('contract terms with no country set', () => {
  const blank = contractSettingsFromTenant({})
  const all = JSON.stringify([defaultContractTerms(blank), standardTerms('X', blank), governingLawNote(blank)])

  it('name no country and no Egyptologist', () => {
    expect(all).not.toMatch(/Egypt/i)
  })

  it('ask the deposit a booking asks', () => {
    expect(defaultContractTerms(blank).depositPercentage).toBe(30)
    expect(paymentTermsText(30, blank)).toContain('before the tour starts')
  })
})

describe('contract terms from Settings → Organization', () => {
  const settings = contractSettingsFromTenant({ operating_country: 'Egypt', contract_governing_law: 'Egyptian law', deposit_percent: 25 })

  it('use the operator’s country, law and deposit', () => {
    expect(defaultContractTerms(settings).paymentTerms).toBe(
      'A 25% deposit is required at the time of booking to secure the reservation. The remaining balance is to be paid upon arrival in Egypt.')
    const terms = standardTerms('Nile Journeys', settings)
    expect(terms.find(t => t.title === 'Travel documents')!.text[0]).toContain('for travel to Egypt.')
    expect(terms.find(t => t.title === 'Dispute resolution')!.text[0]).toContain('arbitration under Egyptian law.')
    expect(governingLawNote(settings)).toContain('governed by Egyptian law')
  })

  it('ignore a deposit outside 0–100', () => {
    expect(defaultContractTerms(contractSettingsFromTenant({ deposit_percent: 140 })).depositPercentage).toBe(30)
  })
})

describe('the contract PDF', () => {
  it('prints what was set on the page, not its own defaults', async () => {
    const text = await contractText({
      settings: egypt,
      terms: {
        paymentTerms: 'A 30% deposit now, the rest in 60 days.',
        inclusions: ['Hot-air balloon'],
        exclusions: ['Domestic flights'],
        cancellation45Days: 'Free cancellation until 60 days.',
        forceMajeure: 'Credit for future travel.',
      },
    })
    expect(text).toContain('A 30% deposit now, the rest in 60 days.')
    expect(text).not.toContain('10% deposit')
    expect(text).toContain('Hot-air balloon')
    expect(text).not.toContain('Entrance fees to all sites listed')
    expect(text).toContain('Domestic flights')
    expect(text).toContain('Free cancellation until 60 days.')
    expect(text).toContain('Credit for future travel.')
    expect(text).toContain('arbitration under Egyptian law.')
  })

  it('names no country when none is set', async () => {
    expect(await contractText()).not.toMatch(/Egypt/i)
  })

  it('prints "To be confirmed" for a trip with no price', async () => {
    const text = await contractText({ totalCost: null })
    expect(text).toContain('To be confirmed')
    expect(text).not.toContain('NaN')
    expect(contractPrice(Number.NaN, 'USD')).toBe('To be confirmed')
    expect(contractPrice(1500, 'USD')).toBe('$1,500.00')
  })
})

describe('edits sent with the WhatsApp contract', () => {
  it('keep only contract text, bounded, and a sane deposit and price', () => {
    const edits = sanitizeContractEdits({
      paymentTerms: 'x'.repeat(5000), inclusions: ['A', '', 7, 'B'], depositPercentage: 400, totalCost: -5,
      clientPhone: '+1999', serviceProvider: 'Someone else',
    })
    expect(edits.paymentTerms).toHaveLength(2000)
    expect(edits.inclusions).toEqual(['A', 'B'])
    expect(edits).not.toHaveProperty('depositPercentage')
    expect(edits).not.toHaveProperty('totalCost')
    expect(edits).not.toHaveProperty('clientPhone')
    expect(edits).not.toHaveProperty('serviceProvider')
    expect(sanitizeContractEdits({ totalCost: null })).toEqual({ totalCost: null })
  })

  it('the cancellation lines skip blanks', () => {
    const t = { ...defaultContractTerms({}), cancellation44to30Days: '  ' }
    expect(cancellationLines(t)).toHaveLength(5)
  })
})

describe('no Egypt left in the contract sources', () => {
  it.each([
    'app/documents/contract/[id]/page.tsx',
    'lib/contract-pdf-generator.ts',
    'app/api/whatsapp/send-contract/route.ts',
  ])('%s', (file) => {
    const src = readFileSync(join(process.cwd(), file), 'utf8')
      .split('\n').filter(l => !/^(\/\/|\/\*|\*)/.test(l.trim())).join('\n') // code, not comments
    expect(src).not.toMatch(/Egypt/)
  })
})
