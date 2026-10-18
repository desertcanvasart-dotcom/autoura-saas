import { describe, it, expect } from 'vitest'
import { rankSuggestions, currentToken, applySuggestion, MAX_SUGGESTIONS } from '@/lib/email/address-suggestions'
import { schedulePresets, toDateTimeLocal } from '@/lib/email/scheduled-send'

describe('address suggestions', () => {
  const c = [
    { email: 'Ann.Smith@client.com', name: 'Ann Smith', source: 'client' as const },
    { email: 'ann.smith@client.com', name: null, source: 'emailed' as const, lastAt: '2026-10-01' },
    { email: 'joanna@hotel.com', name: 'Joanna Lee', source: 'emailed' as const, lastAt: '2026-10-10' },
    { email: 'bob@agency.com', name: 'Annabel Bob', source: 'team' as const },
    { email: 'not-an-address', name: 'Ann', source: 'client' as const },
  ]

  it('starts-with before contains; emailed before client before team; one per address', () => {
    expect(rankSuggestions(c, 'ann').map(s => s.email)).toEqual(['ann.smith@client.com', 'bob@agency.com', 'joanna@hotel.com'])
  })
  it('keeps a name from any source for the address', () => {
    expect(rankSuggestions(c, 'ann')[0].name).toBe('Ann Smith')
  })
  it('leaves out addresses already on the message', () => {
    expect(rankSuggestions(c, 'ann', ['ANN.SMITH@client.com']).map(s => s.email)).not.toContain('ann.smith@client.com')
  })
  it('nothing for an empty query, and at most a handful', () => {
    expect(rankSuggestions(c, '  ')).toEqual([])
    const many = Array.from({ length: 30 }, (_, i) => ({ email: `a${i}@x.com`, name: null, source: 'client' as const }))
    expect(rankSuggestions(many, 'a')).toHaveLength(MAX_SUGGESTIONS)
  })
  it('works on the address being typed', () => {
    expect(currentToken('a@x.com, jo')).toEqual({ before: 'a@x.com,', token: 'jo' })
    expect(applySuggestion('a@x.com, jo', 'joanna@hotel.com')).toBe('a@x.com, joanna@hotel.com, ')
    expect(applySuggestion('jo', 'joanna@hotel.com')).toBe('joanna@hotel.com, ')
  })
})

describe('schedule presets', () => {
  it('tomorrow morning / afternoon and next Monday, at local hours', () => {
    const wed = new Date(2026, 9, 14, 15, 30) // Wednesday 14 Oct, 15:30 local
    const p = schedulePresets(wed)
    expect(p.map(x => x.label)).toEqual(['Tomorrow morning', 'Tomorrow afternoon', 'Monday morning'])
    expect(toDateTimeLocal(p[0].at)).toBe('2026-10-15T08:00')
    expect(toDateTimeLocal(p[1].at)).toBe('2026-10-15T13:00')
    expect(toDateTimeLocal(p[2].at)).toBe('2026-10-19T08:00')
  })
  it('on a Sunday, Monday morning is shown once', () => {
    const sun = new Date(2026, 9, 18, 10, 0)
    expect(schedulePresets(sun).map(x => x.label)).toEqual(['Tomorrow morning', 'Tomorrow afternoon'])
  })
  it('on a Monday, "Monday morning" is next week', () => {
    const mon = new Date(2026, 9, 19, 10, 0)
    expect(toDateTimeLocal(schedulePresets(mon)[2].at)).toBe('2026-10-26T08:00')
  })
})
