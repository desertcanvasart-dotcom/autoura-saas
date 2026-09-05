import { describe, it, expect } from 'vitest'
import {
  VOCABULARY_KINDS,
  VOCABULARY_KIND_INFO,
  SUPPLIER_BEHAVIORS,
  slugifyKey,
  uniqueKey,
  nextRank,
  activeInOrder,
  labelFor,
  validateVocabularyItem,
  wouldBreakMinimum,
  groupByKind,
  type VocabularyItem,
} from '@/lib/vocabulary'
import fs from 'node:fs'
import path from 'node:path'

const item = (over: Partial<VocabularyItem>): VocabularyItem => ({
  id: 'x', tenant_id: 't', kind: 'tier', key: 'k', label: 'K', description: null, behavior: null,
  rank: 0, meta: {}, is_active: true, created_at: '', updated_at: '', ...over,
})

describe('the kinds', () => {
  it('every kind has settings-screen info', () => {
    for (const k of VOCABULARY_KINDS) expect(VOCABULARY_KIND_INFO[k].title).toBeTruthy()
  })

  it('the SQL preset (migration 334) seeds exactly these kinds and behaviours', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/334_tenant_vocabularies.sql'), 'utf8')
    for (const k of VOCABULARY_KINDS) expect(sql).toContain(`p_kind = '${k}'`)
    // The CHECK list in SQL and the TS list must agree.
    const check = sql.match(/kind IN \(([\s\S]*?)\)\)/)![1].match(/'([a-z_]+)'/g)!.map(s => s.replace(/'/g, ''))
    expect(check.sort()).toEqual([...VOCABULARY_KINDS].sort())
    for (const b of SUPPLIER_BEHAVIORS) expect(sql).toContain(`'supplier_type', '${b.key}'`)
  })
})

describe('keys', () => {
  it('slugifies the agency word into a stable key', () => {
    expect(slugifyKey('5★ Deluxe')).toBe('5_deluxe')
    expect(slugifyKey('Bed & Breakfast')).toBe('bed_breakfast')
    expect(slugifyKey('  Fleet Partner  ')).toBe('fleet_partner')
    expect(slugifyKey('★★★')).toBe('')
  })

  it('never collides with an existing key', () => {
    expect(uniqueKey('van', ['sedan'])).toBe('van')
    expect(uniqueKey('van', ['van'])).toBe('van_2')
    expect(uniqueKey('van', ['van', 'van_2'])).toBe('van_3')
    expect(uniqueKey('', [])).toBe('item')
  })

  it('ranks append at the end', () => {
    expect(nextRank([])).toBe(1)
    expect(nextRank([{ rank: 3 }, { rank: 7 }])).toBe(8)
  })
})

describe('reading a vocabulary', () => {
  const items = [
    item({ id: 'a', key: 'luxury', label: 'Luxury', rank: 4 }),
    item({ id: 'b', key: 'budget', label: 'Budget', rank: 1 }),
    item({ id: 'c', key: 'deluxe', label: 'Deluxe', rank: 3, is_active: false }),
  ]
  it('offers active entries in rank order', () => {
    expect(activeInOrder(items).map(i => i.key)).toEqual(['budget', 'luxury'])
  })
  it('reads a stored key as the agency word, and an unknown key as itself', () => {
    expect(labelFor(items, 'budget')).toBe('Budget')
    expect(labelFor(items, 'deluxe')).toBe('Deluxe') // hidden, still readable
    expect(labelFor(items, 'gone')).toBe('gone')
    expect(labelFor(items, null)).toBe('')
  })
  it('groups a flat fetch by kind', () => {
    const g = groupByKind([...items, item({ id: 'd', kind: 'meal_type', key: 'lunch', label: 'Lunch' })])
    expect(g.tier.map(i => i.key)).toEqual(['budget', 'deluxe', 'luxury'])
    expect(g.meal_type.map(i => i.key)).toEqual(['lunch'])
    expect(g.vehicle_type).toEqual([])
  })
})

describe('validation', () => {
  it('accepts a plain entry and a supplier type with a behaviour', () => {
    expect(validateVocabularyItem({ kind: 'tier', key: 'five_star', label: '5 Star' })).toEqual({ ok: true })
    expect(validateVocabularyItem({ kind: 'supplier_type', key: 'fleet_partner', label: 'Fleet partner', behavior: 'transport_company' })).toEqual({ ok: true })
    expect(validateVocabularyItem({ kind: 'vehicle_type', key: 'coach', label: 'Coach', meta: { min_pax: 25, max_pax: 50 } })).toEqual({ ok: true })
  })
  it('refuses what the database would refuse, with a readable reason', () => {
    expect(validateVocabularyItem({ kind: 'colour', key: 'red', label: 'Red' }).ok).toBe(false)
    expect(validateVocabularyItem({ kind: 'tier', key: 'five_star', label: '   ' }).ok).toBe(false)
    expect(validateVocabularyItem({ kind: 'tier', key: 'Five Star', label: '5 Star' }).ok).toBe(false)
    expect(validateVocabularyItem({ kind: 'supplier_type', key: 'x', label: 'X' }).ok).toBe(false)
    expect(validateVocabularyItem({ kind: 'supplier_type', key: 'x', label: 'X', behavior: 'spaceship' }).ok).toBe(false)
    expect(validateVocabularyItem({ kind: 'tier', key: 'x', label: 'X', behavior: 'hotel' }).ok).toBe(false)
    expect(validateVocabularyItem({ kind: 'vehicle_type', key: 'coach', label: 'Coach', meta: { min_pax: 5, max_pax: 2 } }).ok).toBe(false)
    expect(validateVocabularyItem({ kind: 'vehicle_type', key: 'coach', label: 'Coach' }).ok).toBe(false)
  })
  it('protects the minimum: a tenant cannot end up with one tier', () => {
    const tiers = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c', is_active: false })]
    expect(wouldBreakMinimum('tier', tiers, 'a')).toBe(true)
    expect(wouldBreakMinimum('tier', [...tiers, item({ id: 'd' })], 'a')).toBe(false)
    expect(wouldBreakMinimum('meal_type', [item({ id: 'a' })], 'a')).toBe(true)
  })
})
