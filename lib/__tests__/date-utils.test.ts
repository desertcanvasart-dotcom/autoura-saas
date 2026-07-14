import { describe, it, expect } from 'vitest'
import { parseDateOnly, formatDateOnly, daysBetween } from '@/lib/date-utils'

describe('parseDateOnly', () => {
  it('parses a bare YYYY-MM-DD as local midnight (no UTC shift)', () => {
    const d = parseDateOnly('2026-06-15')!
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(5) // June
    expect(d.getDate()).toBe(15) // must NOT slip to the 14th
    expect(d.getHours()).toBe(0)
  })

  it('returns null for empty / invalid input', () => {
    expect(parseDateOnly('')).toBeNull()
    expect(parseDateOnly(null)).toBeNull()
    expect(parseDateOnly(undefined)).toBeNull()
    expect(parseDateOnly('not-a-date')).toBeNull()
  })

  it('passes full timestamps through unchanged', () => {
    const iso = '2026-06-15T09:30:00.000Z'
    expect(parseDateOnly(iso)!.getTime()).toBe(new Date(iso).getTime())
  })
})

describe('formatDateOnly', () => {
  it('renders the literal calendar day regardless of runtime timezone', () => {
    // The day number in the output must be 15, never 14.
    expect(formatDateOnly('2026-06-15', 'en-GB')).toContain('15')
  })

  it('falls back to the original string when unparseable', () => {
    expect(formatDateOnly('garbage')).toBe('garbage')
  })
})

describe('daysBetween', () => {
  it('counts whole calendar nights TZ-safely', () => {
    expect(daysBetween('2026-06-15', '2026-06-18')).toBe(3)
  })

  it('returns 0 on bad input', () => {
    expect(daysBetween('2026-06-15', '')).toBe(0)
  })
})
