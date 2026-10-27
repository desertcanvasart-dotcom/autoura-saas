import { describe, it, expect } from 'vitest'
import {
  resolveBrand, contrastRatio, readableOn, brandCssVariables, ARCHETYPE_DEFAULTS, ARCHETYPES, FONT_PAIRS,
  MIN_TEXT_CONTRAST, MIN_UI_CONTRAST,
} from '@/lib/publish/brand'

// ============================================================================
// The brand layer (docs/publish/PLAN.md §7): a company's palette, typeface
// pair and tone on top of an archetype. A stored choice is used only when it
// is valid AND readable; anything else falls back to the archetype default,
// with the reason kept for the admin — never an error on a live site.
// ============================================================================

describe('contrast', () => {
  it('measures WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })
  it('picks readable text for a coloured button', () => {
    expect(readableOn('#0b6e4f')).toBe('#ffffff')
    expect(readableOn('#facc15')).toBe('#111111')
  })
})

describe('archetype defaults', () => {
  for (const a of ARCHETYPES) {
    it(`${a}: readable, and a real font pair`, () => {
      const d = ARCHETYPE_DEFAULTS[a]
      expect(contrastRatio(d.palette.ink, d.palette.surface)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST)
      expect(contrastRatio(d.palette.primary, d.palette.surface)).toBeGreaterThanOrEqual(MIN_UI_CONTRAST)
      expect(FONT_PAIRS[d.fontPair]).toBeDefined()
      expect(resolveBrand(a, {}).problems).toEqual([])
    })
  }
})

describe('resolveBrand', () => {
  it('a valid, readable choice is used as stored', () => {
    const b = resolveBrand('transparent_value', {
      palette: { primary: '#1d4ed8', accent: '#facc15', ink: '#0f172a', surface: '#ffffff' }, fontPair: 'friendly', tone: 'playful',
    })
    expect(b).toMatchObject({ fontPair: 'friendly', tone: 'playful', palette: { primary: '#1d4ed8' }, onPrimary: '#ffffff', onAccent: '#111111', problems: [] })
  })
  it('nothing stored: the archetype as designed', () => {
    expect(resolveBrand('private_journeys', null)).toMatchObject({ ...ARCHETYPE_DEFAULTS.private_journeys, problems: [] })
  })
  it('a malformed colour falls back, saying which', () => {
    const b = resolveBrand('private_journeys', { palette: { primary: 'red', accent: '#b08d57', ink: '#111111', surface: '#ffffff' } })
    expect(b.palette).toEqual(ARCHETYPE_DEFAULTS.private_journeys.palette)
    expect(b.problems[0]).toMatch(/palette: primary must be a colour as #RRGGBB/)
  })
  it('unreadable body text falls back — grey on white is refused', () => {
    const b = resolveBrand('transparent_value', { palette: { primary: '#0b6e4f', accent: '#f2a541', ink: '#bbbbbb', surface: '#ffffff' } })
    expect(b.palette).toEqual(ARCHETYPE_DEFAULTS.transparent_value.palette)
    expect(b.problems[0]).toMatch(/hard to read — contrast 1\.\d:1, at least 4\.5:1 needed/)
  })
  it('links that vanish into the background fall back', () => {
    const b = resolveBrand('transparent_value', { palette: { primary: '#fff6d5', accent: '#f2a541', ink: '#111111', surface: '#ffffff' } })
    expect(b.problems[0]).toMatch(/barely stand out/)
  })
  it('an unknown font pair or tone falls back field by field, keeping the rest', () => {
    const b = resolveBrand('private_journeys', { fontPair: 'comic-sans', tone: 'shouty', palette: { primary: '#7a5c3e', accent: '#b08d57', ink: '#111111', surface: '#ffffff' } })
    expect(b.fontPair).toBe('classic')
    expect(b.tone).toBe('expert')
    expect(b.palette.ink).toBe('#111111')
    expect(b.problems).toHaveLength(2)
  })
  it('junk never throws', () => {
    for (const junk of [undefined, null, 'x', 42, [], { palette: null }, { palette: [1, 2] }]) {
      expect(() => resolveBrand('transparent_value', junk)).not.toThrow()
    }
  })
  it('only validated hex reaches the CSS variables', () => {
    const vars = brandCssVariables(resolveBrand('private_journeys', { palette: { primary: 'red;}body{display:none', accent: '#000000', ink: '#000000', surface: '#ffffff' } }))
    for (const v of Object.values(vars)) expect(v).toMatch(/^#[0-9a-f]{6}$/i)
    expect(Object.keys(vars).sort()).toEqual(['--brand-accent', '--brand-ink', '--brand-on-accent', '--brand-on-primary', '--brand-primary', '--brand-surface'])
  })
})
