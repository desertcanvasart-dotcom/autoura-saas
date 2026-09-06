import { describe, it, expect } from 'vitest'
import { paletteAt, tierPosition, pluralize, variationDefaultsAt, TIER_PALETTE } from '@/lib/vocabulary-ui'

describe('tier colours follow position, not words', () => {
  const ladder = [
    { key: 'budget', rank: 1 }, { key: 'standard', rank: 2 }, { key: 'deluxe', rank: 3 }, { key: 'luxury', rank: 4 },
  ]
  it('the Egypt preset keeps its old colours', () => {
    expect(paletteAt(tierPosition(ladder, 'budget')).badge).toContain('gray')
    expect(paletteAt(tierPosition(ladder, 'standard')).badge).toContain('blue')
    expect(paletteAt(tierPosition(ladder, 'deluxe')).badge).toContain('purple')
    expect(paletteAt(tierPosition(ladder, 'luxury')).badge).toContain('amber')
  })
  it('a 3★/4★/5★ agency gets the same rising scale', () => {
    const stars = [{ key: '3_star', rank: 1 }, { key: '4_star', rank: 2 }, { key: '5_star', rank: 3 }]
    expect(paletteAt(tierPosition(stars, '5_star')).badge).toContain('purple')
  })
  it('unknown keys read as gray; long ladders cycle', () => {
    expect(paletteAt(tierPosition(ladder, 'gone'))).toBe(TIER_PALETTE[0])
    expect(paletteAt(TIER_PALETTE.length + 1)).toBe(TIER_PALETTE[1])
  })
  it('position ignores hidden flags — hiding a middle tier does not recolour the rest', () => {
    const unsorted = [{ key: 'luxury', rank: 4 }, { key: 'budget', rank: 1 }]
    expect(tierPosition(unsorted, 'luxury')).toBe(1)
  })
})

describe('pluralize', () => {
  it('handles the words agencies actually use', () => {
    expect(pluralize('Hotel')).toBe('Hotels')
    expect(pluralize('Fleet partner')).toBe('Fleet partners')
    expect(pluralize('Bus')).toBe('Buses')
    expect(pluralize('Company')).toBe('Companies')
    expect(pluralize('Airlines')).toBe('Airlines')
    expect(pluralize('')).toBe('')
  })
})

describe('variation defaults by ladder position', () => {
  it('four tiers reproduce the old per-tier defaults', () => {
    expect(variationDefaultsAt(0, 4)).toMatchObject({ group_type: 'shared', max_pax: 15, accommodation_standard: '3_star' })
    expect(variationDefaultsAt(3, 4)).toMatchObject({ group_type: 'private', max_pax: 6, accommodation_standard: '5_star', icon: '👑' })
  })
  it('three tiers: the middle is "comfortable"; one tier is the top', () => {
    expect(variationDefaultsAt(1, 3)).toMatchObject({ accommodation_standard: '4_star_plus' })
    expect(variationDefaultsAt(0, 1)).toMatchObject({ accommodation_standard: '5_star' })
    expect(variationDefaultsAt(5, 6)).toMatchObject({ accommodation_standard: '5_star' })
  })
})
