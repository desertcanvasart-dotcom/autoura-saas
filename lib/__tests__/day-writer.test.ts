import { describe, it, expect } from 'vitest'
import {
  acceptWritten, dayFacts, isPlaceholderTitle, itineraryRules, matchTrip, sameThing, styleBlock, textForTier,
  writerPrompt, writerSchema, type LibraryEntry, type WritingRuleRow,
} from '@/lib/ai/day-writer'
import type { GridDay } from '@/app/pricing-grid/types'

const item = (name: string, rateId = name) => ({ rateId, name, rateEur: 1, rateNonEur: 1 })
const day = (dayNumber: number, city: string, slots: Record<string, string[]>, description = ''): GridDay => ({
  id: `d${dayNumber}`, dayNumber, title: `Day ${dayNumber}`, city, description, isExpanded: false,
  slots: Object.entries(slots).map(([slotId, names]) => ({ slotId, selectedItems: names.map(n => item(n)), customAmount: 0 })),
} as GridDay)
const entry = (id: string, name: string, category: string, variations: LibraryEntry['variations'], extra: Partial<LibraryEntry> = {}): LibraryEntry =>
  ({ id, name, category, location: null, short_description: null, variations, ...extra })
const v = (tier: string, description: string, extra: Record<string, unknown> = {}) =>
  ({ tier, title: null, description, highlights: null, ...extra })

const library: LibraryEntry[] = [
  entry('k', 'Karnak Temple Complex', 'sites-attractions', [v('standard', 'The great temple of Amun.'), v('luxury', 'A private walk through Karnak.')]),
  entry('h', 'Steigenberger Nile Palace', 'hotels-accommodations', [v('standard', 'On the Corniche.')]),
  entry('c', 'MS Nile Goddess', 'cruises', [v('luxury', 'A boutique ship.', {
    day_by_day: [{ day: 1, title: 'Embark', description: 'Board in Luxor.' }, { day: 2, title: 'Edfu', description: 'Sail to Edfu.' }],
  })]),
  entry('s', 'Luxor sightseeing day', 'day-structures', [v('standard', 'Mornings on the East Bank.')], { location: 'Luxor' }),
]

describe('what a day sells', () => {
  it('reads the picks from the slots, without the single supplement', () => {
    const f = dayFacts(day(1, 'Luxor', { entrance_fees: ['Karnak Temple'], accommodation: ['Steigenberger Nile Palace (Standard)'], meals: ['Lunch'] }))
    expect(f.sites).toEqual(['Karnak Temple'])
    expect(f.hotel).toBe('Steigenberger Nile Palace (Standard)')
    const withSupp = day(1, 'Luxor', {})
    withSupp.slots = [{ slotId: 'accommodation', selectedItems: [item('Hotel A', 'h1'), item('Single Supplement', 'h1_supp')], customAmount: 0 }]
    expect(dayFacts(withSupp).hotel).toBe('Hotel A')
  })
})

describe('matching a pick to the library', () => {
  it('matches the same thing named differently, and not different things', () => {
    expect(sameThing('Karnak Temple', 'Karnak Temple Complex')).toBe(true)
    expect(sameThing('Steigenberger Nile Palace (Standard) - Luxor', 'Steigenberger Nile Palace')).toBe(true)
    expect(sameThing('Luxor Temple', 'Karnak Temple Complex')).toBe(false)
    expect(sameThing('Temple', 'Karnak Temple Complex')).toBe(false)
  })

  it('takes the trip’s tier, else another tier flagged', () => {
    expect(textForTier(library[0], 'luxury')).toMatchObject({ tier: 'luxury', otherTier: false, text: 'A private walk through Karnak.' })
    expect(textForTier(library[1], 'luxury')).toMatchObject({ tier: 'standard', otherTier: true })
  })

  it('lists what is matched and what the library lacks; a cruise reads its own sailing days', () => {
    const [d1, d2, d3] = matchTrip([
      day(1, 'Luxor', { entrance_fees: ['Karnak Temple', 'Valley of the Kings'], accommodation: ['Steigenberger Nile Palace'] }),
      day(2, 'Luxor', { cruise: ['MS Nile Goddess - Luxury'] }),
      day(3, 'Edfu', { cruise: ['MS Nile Goddess - Luxury'] }),
    ], library, 'luxury')
    expect(d1.used.map(u => u.id)).toEqual(['k', 'h', 's'])
    expect(d1.missing).toEqual([{ kind: 'site', name: 'Valley of the Kings' }])
    expect(d2.cruiseDay).toEqual({ title: 'Embark', description: 'Board in Luxor.' })
    expect(d3.cruiseDay).toEqual({ title: 'Edfu', description: 'Sail to Edfu.' })
  })
})

describe('the house style', () => {
  const rule = (name: string, extra: Partial<WritingRuleRow>): WritingRuleRow =>
    ({ name, description: name, rule_type: 'prefer', priority: 0, applies_to: ['all'], applies_to_tiers: null, examples: null, ...extra })
  it('uses the rules for itineraries at this tier, strongest first', () => {
    const rules = itineraryRules([
      rule('email only', { applies_to: ['email'] }),
      rule('luxury only', { applies_to_tiers: ['luxury'] }),
      rule('low', { priority: 1 }),
      rule('high', { priority: 9, applies_to: ['itinerary'] }),
    ], 'standard')
    expect(rules.map(r => r.name)).toEqual(['high', 'low'])
  })
  it('groups must / prefer / avoid, with the phrases', () => {
    const block = styleBlock([
      rule('No emojis', { rule_type: 'avoid' }),
      rule('Say "you"', { rule_type: 'enforce', examples_json: { good: ['You will see'], bad: ['Guests will see'] } }),
    ], ['Welcome to Egypt'])
    expect(block).toContain('MUST follow:\n- Say "you": Say "you" Write like: "You will see". Not like: "Guests will see".')
    expect(block).toContain('AVOID:\n- No emojis')
    expect(block).toContain('- Welcome to Egypt')
  })
})

describe('the request and the reply', () => {
  it('the prompt carries each day’s facts and only its library text', () => {
    const matches = matchTrip([day(1, 'Luxor', { entrance_fees: ['Karnak Temple'] })], library, 'standard')
    const prompt = writerPrompt({ tourName: 'Nile Classic', tier: 'standard', pax: 2, matches })
    expect(prompt).toContain('The great temple of Amun.')
    expect(prompt).not.toContain('On the Corniche.')
    expect(writerSchema([1, 3]).properties.days.items.properties.day.enum).toEqual([1, 3])
  })

  it('keeps only the days asked for, and drops any sentence with a price', () => {
    const out = acceptWritten({ days: [
      { day: 1, title: 'Karnak', description: `You walk through Karnak. The visit costs ${String.fromCharCode(0x20ac)}20 per person. Then lunch.` },
      { day: 9, title: 'x', description: 'Not asked for.' },
      { day: 1, title: 'dup', description: 'Second copy.' },
    ] }, [1, 2])
    expect(out).toEqual([{ dayNumber: 1, title: 'Karnak', description: 'You walk through Karnak. Then lunch.' }])
    expect(acceptWritten({ days: [{ day: 1, title: 't', description: 'Entry is 450 EGP. You see the tombs.' }] }, [1])[0].description).toBe('You see the tombs.')
    expect(acceptWritten(null, [1])).toEqual([])
  })

  it('a placeholder title is not the operator’s choice', () => {
    expect(isPlaceholderTitle('Day 3', 3, 'Luxor')).toBe(true)
    expect(isPlaceholderTitle('Luxor', 3, 'Luxor')).toBe(true)
    expect(isPlaceholderTitle('Temples of the East Bank', 3, 'Luxor')).toBe(false)
  })
})
