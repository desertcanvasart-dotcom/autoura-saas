import { describe, it, expect } from 'vitest'
import { brandColorRgb, tint, identityFromTenant, identityFooterLine } from '@/lib/company-identity'

// The rule under test: a missing or malformed brand color is a VISUAL NO-OP —
// the document's existing palette — never black, never a crash. Branding must
// not be able to break an invoice.
describe('brandColorRgb', () => {
  const OLIVE: [number, number, number] = [100, 124, 71]

  it('parses the tenant hex', () => {
    expect(brandColorRgb({ primaryColor: '#647C47' }, OLIVE)).toEqual([100, 124, 71])
    expect(brandColorRgb({ primaryColor: '#FF0000' }, OLIVE)).toEqual([255, 0, 0])
    expect(brandColorRgb({ primaryColor: '1E88E5' }, OLIVE)).toEqual([30, 136, 229]) // bare hex tolerated
  })

  it('falls back to the document palette on anything unusable', () => {
    for (const bad of [undefined, null, '', '#fff', '#12345', 'olive', '#GGGGGG', ' #647C47 x']) {
      expect(brandColorRgb({ primaryColor: bad as string }, OLIVE), String(bad)).toEqual(OLIVE)
    }
    expect(brandColorRgb(null, OLIVE)).toEqual(OLIVE)
  })
})

describe('tint', () => {
  it('mixes toward white and clamps the factor', () => {
    expect(tint([0, 0, 0], 1)).toEqual([255, 255, 255])
    expect(tint([100, 124, 71], 0)).toEqual([100, 124, 71])
    expect(tint([100, 124, 71], 2)).toEqual([255, 255, 255])
  })
})

describe('identityFromTenant carries the brand color', () => {
  it('passes primary_color through and omits it when blank', () => {
    expect(identityFromTenant({ company_name: 'Sawa', primary_color: '#112233' }).primaryColor).toBe('#112233')
    expect(identityFromTenant({ company_name: 'Sawa', primary_color: '  ' }).primaryColor).toBeUndefined()
  })

  it('footer line still omits what is missing', () => {
    expect(identityFooterLine(identityFromTenant({ company_name: 'Sawa' }))).toBe('Sawa')
  })
})
