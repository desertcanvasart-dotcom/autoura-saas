import { describe, it, expect } from 'vitest'
import { buildAliasIndex, resolveAttractionAlias } from '@/lib/pricing/attraction-aliases'

// ============================================
// Alias resolution (A-item 13) — data, not code
// ============================================
// Day wording resolves to the name on the agency's OWN entrance-fee sheet
// through the attraction_aliases table. Exact case-insensitive matching only;
// combo canonicals split on ' + '; unknown names pass through untouched.
//
// AN ALIAS BELONGS TO ONE AGENCY (migration 370). There used to be global rows
// every agency read. Checked on production 2026-09-20: nine of the 27 pointed
// at names on nobody's sheet — Sawa Tours wrote "Valley Of Kings", exactly as
// their sheet has it, and the alias rewrote it into a miss.

describe('buildAliasIndex', () => {
  it('is case-insensitive', () => {
    const index = buildAliasIndex([{ alias: 'Citadel', canonical: 'Salah Eldin Citadel', tenant_id: 't1' }])
    expect(index.get('citadel')).toBe('Salah Eldin Citadel')
  })

  it('a row with no agency is not an alias — even if one is handed in', () => {
    const index = buildAliasIndex([
      { alias: 'valley of kings', canonical: 'Valley of the Kings', tenant_id: null },
      { alias: 'gem', canonical: 'Grand Egyptian Museum' },
    ])
    expect(index.size).toBe(0)
  })

  it('so right wording is no longer rewritten into a miss', () => {
    // The production case: the global row is there, the agency has none of
    // its own, and its tour says exactly what its sheet says.
    const index = buildAliasIndex([{ alias: 'valley of kings', canonical: 'Valley of the Kings', tenant_id: null }])
    expect(resolveAttractionAlias('Valley Of Kings', index)).toEqual(['Valley Of Kings'])
  })

  it('ignores blank aliases and canonicals', () => {
    const index = buildAliasIndex([
      { alias: '  ', canonical: 'X', tenant_id: 't1' },
      { alias: 'x', canonical: '', tenant_id: 't1' },
    ])
    expect(index.size).toBe(0)
  })
})

describe('resolveAttractionAlias', () => {
  const index = buildAliasIndex([
    { alias: 'giza plateau', canonical: 'Pyramids of Giza + Sphinx Area', tenant_id: 't1' },
    { alias: 'the citadel', canonical: 'Citadel of Saladin', tenant_id: 't1' },
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

describe('the loader asks for one agency\'s rows, and nobody else\'s', () => {
  it('filters by tenant_id — no "or global"', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(process.cwd(), 'lib/pricing/attraction-aliases.ts'), 'utf8')
    const code = src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).toMatch(/\.eq\('tenant_id', tenantId\)/)
    expect(code).not.toMatch(/tenant_id\.is\.null/)
  })
})
