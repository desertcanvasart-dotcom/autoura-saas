import { describe, it, expect } from 'vitest'
import { csvCell } from '@/lib/finance-export'

describe('csvCell — spreadsheet formula-injection guard', () => {
  it('prefixes formula-triggering leading chars with a single quote', () => {
    expect(csvCell('=1+1')).toBe(`"'=1+1"`)
    expect(csvCell('+44 20 1234')).toBe(`"'+44 20 1234"`)
    expect(csvCell('-5')).toBe(`"'-5"`)
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`)
    expect(csvCell('\tinjected')).toBe(`"'\tinjected"`)
  })

  it('leaves ordinary values unprefixed', () => {
    expect(csvCell('Cairo Tour')).toBe('"Cairo Tour"')
    expect(csvCell('1200')).toBe('"1200"')
    expect(csvCell('')).toBe('""')
  })

  it('still escapes embedded double-quotes', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    // Both guarded AND quote-escaped
    expect(csvCell('=inj "x"')).toBe(`"'=inj ""x"""`)
  })
})
