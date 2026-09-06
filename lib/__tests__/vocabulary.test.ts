import { describe, it, expect } from 'vitest'
import {
  VOCABULARY_KINDS,
  VOCABULARY_KIND_INFO,
  VOCABULARY_GROUPS,
  vocabularyColumnsFor,
  needsDestination,
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
  it('every kind has settings-screen info and sits in a known group', () => {
    for (const k of VOCABULARY_KINDS) {
      expect(VOCABULARY_KIND_INFO[k].title).toBeTruthy()
      expect(VOCABULARY_GROUPS).toContain(VOCABULARY_KIND_INFO[k].group)
    }
    // Every group has at least one kind, or the settings nav shows an empty heading.
    for (const g of VOCABULARY_GROUPS) expect(VOCABULARY_KINDS.some(k => VOCABULARY_KIND_INFO[k].group === g), g).toBe(true)
  })

  it('a column name that means different things per table resolves per table', () => {
    expect(vocabularyColumnsFor('transportation_rates').service_type).toBe('transport_service_type')
    expect(vocabularyColumnsFor('airport_staff_rates').service_type).toBe('airport_service_type')
    expect(vocabularyColumnsFor('hotel_staff_rates').service_type).toBe('hotel_service_type')
    expect(vocabularyColumnsFor('entrance_fees').category).toBe('attraction_category')
    // `duration` is a vocabulary word on activities but free text on transport.
    expect(vocabularyColumnsFor('activity_rates').duration).toBe('activity_duration')
    expect(vocabularyColumnsFor('transportation_rates').duration).toBeUndefined()
    // The generic columns ride along everywhere.
    expect(vocabularyColumnsFor('train_rates').class_type).toBe('train_class')
    expect(vocabularyColumnsFor('guide_rates').guide_language).toBe('guide_language')
    expect(vocabularyColumnsFor('sleeping_train_rates').season).toBe('rate_season')
  })

  it('a transport service type says whether it needs a destination', () => {
    const items = [{ key: 'day_tour', meta: {} }, { key: 'city_transfer', meta: { needs_destination: true } }]
    expect(needsDestination(items, 'city_transfer')).toBe(true)
    expect(needsDestination(items, 'day_tour')).toBe(false)
    expect(needsDestination(items, 'unknown')).toBe(false)
    expect(needsDestination(items, null)).toBe(false)
  })

  // The preset and the kind CHECK live in SQL. Each is read from the LAST
  // migration that defines it, so adding a kind (341 added train_class)
  // means a new migration, never an edit to an applied one.
  const migrationsDir = path.join(__dirname, '../../supabase/migrations')
  const lastMigrationContaining = (needle: RegExp): string => {
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
    for (let i = files.length - 1; i >= 0; i--) {
      const sql = fs.readFileSync(path.join(migrationsDir, files[i]), 'utf8')
      if (needle.test(sql)) return sql
    }
    throw new Error(`no migration matches ${needle}`)
  }

  it('the SQL preset seeds exactly these kinds and behaviours', () => {
    const sql = lastMigrationContaining(/CREATE OR REPLACE FUNCTION seed_tenant_vocabulary\(/)
    for (const k of VOCABULARY_KINDS) expect(sql).toContain(`p_kind = '${k}'`)
    for (const b of SUPPLIER_BEHAVIORS) expect(sql).toContain(`'supplier_type', '${b.key}'`)
  })

  it('the kind CHECK constraint in SQL and the TS list agree', () => {
    const sql = lastMigrationContaining(/tenant_vocabularies_kind_check|kind TEXT NOT NULL CHECK \(kind IN/)
    const check = sql.match(/kind IN \(([\s\S]*?)\)\)/)![1].match(/'([a-z_]+)'/g)!.map(s => s.replace(/'/g, ''))
    expect(check.sort()).toEqual([...VOCABULARY_KINDS].sort())
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

describe('the agency ladder vs the preset', () => {
  const four = ['budget', 'standard', 'deluxe', 'luxury']
  const stars = ['3_star', '4_star', '5_star']
  const one = ['only']
  it('maps positions both ways', async () => {
    const { presetTierFor, tierFromPreset, defaultTierKey } = await import('@/lib/vocabulary')
    expect(presetTierFor(four, 'deluxe')).toBe('deluxe')
    expect(presetTierFor(stars, '3_star')).toBe('budget')
    expect(presetTierFor(stars, '4_star')).toBe('standard')
    expect(presetTierFor(stars, '5_star')).toBe('luxury')
    expect(presetTierFor(stars, 'gone')).toBe('standard')
    expect(presetTierFor(one, 'only')).toBe('luxury')
    expect(tierFromPreset(stars, 'budget')).toBe('3_star')
    expect(tierFromPreset(stars, 'luxury')).toBe('5_star')
    expect(tierFromPreset(four, 'standard')).toBe('standard')
    expect(defaultTierKey(stars)).toBe('4_star')
    expect(defaultTierKey([])).toBe('standard')
  })
  it('normalises free text onto the agency ladder', async () => {
    const { normalizeTierKey, resolveVocabularyKey } = await import('@/lib/vocabulary')
    const items = [{ key: '3_star', label: '3★' }, { key: '4_star', label: '4 Star' }, { key: '5_star', label: '5 Star Deluxe' }]
    expect(resolveVocabularyKey(items, '4 star')).toBe('4_star')
    expect(resolveVocabularyKey(items, '5-Star-Deluxe')).toBe('5_star')
    expect(resolveVocabularyKey(items, '3★')).toBe('3_star')
    expect(resolveVocabularyKey(items, 'platinum')).toBeNull()
    expect(normalizeTierKey('luxury', items)).toBe('5_star')   // synonym → top of ladder
    expect(normalizeTierKey('economy', items)).toBe('3_star')
    expect(normalizeTierKey('vip', items)).toBe('5_star')
    expect(normalizeTierKey('', items)).toBe('4_star')          // default = "standard" position
    expect(normalizeTierKey('deluxe', four.map(k => ({ key: k, label: k })))).toBe('deluxe')
  })
  it('multipliers and vehicles follow position and pax', async () => {
    const { tierMultiplier, vehicleForPax } = await import('@/lib/vocabulary')
    expect(tierMultiplier(four, 'luxury')).toBe(1.5)
    expect(tierMultiplier(stars, '4_star')).toBe(1.0)
    expect(tierMultiplier(stars, 'gone')).toBe(1.0)
    const v = [{ key: 'coach', min_pax: 25, max_pax: 50 }, { key: 'car', min_pax: 1, max_pax: 3 }, { key: 'van', min_pax: 4, max_pax: 12 }]
    expect(vehicleForPax(v, 2)).toBe('car')
    expect(vehicleForPax(v, 15)).toBe('coach')  // nothing seats 15 exactly → smallest that covers
    expect(vehicleForPax(v, 80)).toBe('coach')  // too big for anything → the largest
    expect(vehicleForPax([], 2)).toBeNull()
  })
  it('re-files CSV values as keys and names the ones it cannot', async () => {
    const { resolveRecordKeys } = await import('@/lib/vocabulary')
    const vocab = {
      tier: [{ key: '4_star', label: '4 Star' }],
      board_basis: [{ key: 'bb', label: 'Bed & Breakfast' }],
    }
    const r = resolveRecordKeys({ tier: '4 star', board_basis: 'BB', city: 'Luxor' }, vocab)
    expect(r.record).toEqual({ tier: '4_star', board_basis: 'bb', city: 'Luxor' })
    expect(r.errors).toEqual([])
    const bad = resolveRecordKeys({ tier: 'Platinum' }, vocab)
    expect(bad.record.tier).toBe('Platinum')
    expect(bad.errors[0]).toMatch(/tier: "Platinum" is not in your tier list/)
    // A kind with no vocabulary is left as typed (migration not applied, or the kind is unmanaged)
    expect(resolveRecordKeys({ meal_type: 'Lunch' }, vocab).errors).toEqual([])
    // A train-rate CSV says "Second Class AC" (or the old stored label); the row gets the key.
    const trains = { train_class: [{ key: 'first_class', label: 'First Class' }, { key: 'second_class_ac', label: 'Second Class AC' }] }
    expect(resolveRecordKeys({ class_type: 'Second Class AC' }, trains).record.class_type).toBe('second_class_ac')
    expect(resolveRecordKeys({ class_type: 'first_class' }, trains).record.class_type).toBe('first_class')
    expect(resolveRecordKeys({ class_type: 'Platinum' }, trains).errors).toHaveLength(1)
  })
})
