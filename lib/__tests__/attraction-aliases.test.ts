import { describe, it, expect } from 'vitest'
import { buildAliasIndex, resolveAttractionAlias } from '@/lib/pricing/attraction-aliases'

// ============================================
// Alias resolution (A-item 13) — data, not code
// ============================================
// Day wording resolves to canonical entrance-fee names through the
// attraction_aliases table. Exact case-insensitive matching only; combo
// canonicals split on ' + '; tenant rows beat global rows; unknown names
// pass through untouched so the engine's historical fallbacks still apply.

describe('buildAliasIndex', () => {
  it('is case-insensitive and lets a tenant row beat a global one', () => {
    const index = buildAliasIndex([
      { alias: 'Citadel', canonical: 'Citadel of Saladin', tenant_id: null },
      { alias: 'citadel', canonical: 'Salah El Din Citadel (our contract)', tenant_id: 't1' },
      { alias: 'gem', canonical: 'Grand Egyptian Museum', tenant_id: null },
    ])
    expect(index.get('citadel')).toBe('Salah El Din Citadel (our contract)')
    expect(index.get('gem')).toBe('Grand Egyptian Museum')
  })

  it('ignores blank aliases and canonicals', () => {
    const index = buildAliasIndex([
      { alias: '  ', canonical: 'X' },
      { alias: 'x', canonical: '' },
    ])
    expect(index.size).toBe(0)
  })
})

describe('resolveAttractionAlias', () => {
  const index = buildAliasIndex([
    { alias: 'giza plateau', canonical: 'Pyramids of Giza + Sphinx Area' },
    { alias: 'the citadel', canonical: 'Citadel of Saladin' },
  ])

  it('resolves a known alias, whatever the case or padding', () => {
    expect(resolveAttractionAlias(' The Citadel ', index)).toEqual(['Citadel of Saladin'])
  })

  it('a combo canonical becomes several fee names — one ticket, several fees', () => {
    expect(resolveAttractionAlias('Giza Plateau', index)).toEqual(['Pyramids of Giza', 'Sphinx Area'])
  })

  it('an unknown name passes through unchanged (the fallbacks still apply)', () => {
    expect(resolveAttractionAlias('Karnak Temple', index)).toEqual(['Karnak Temple'])
  })
})
