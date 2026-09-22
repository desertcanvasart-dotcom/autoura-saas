// Spot / Throughout are the agency's words, and a guide rate says which mode
// it is for (sibling #464, migration 380). A Throughout quote is priced only
// from Throughout rates; with none it is a gap saying so — never the Spot rate
// worn as a guess. Cruise meals read "included on board".
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})
import { getGuideRate, clearVocabularyMemo } from '@/lib/auto-pricing-service'
import { VOCABULARY_KINDS, VOCABULARY_KIND_INFO, VOCABULARY_COLUMNS } from '@/lib/vocabulary'
import { mealStatusLabel, summarizeMeals } from '@/lib/tours/day-meals'

describe('the vocabulary', () => {
  it('has the kind, and guide_rates.guide_mode is filed under it', () => {
    expect(VOCABULARY_KINDS).toContain('guide_mode')
    expect(VOCABULARY_KIND_INFO.guide_mode.example).toBe('Spot guide / Throughout guide')
    expect(VOCABULARY_COLUMNS.guide_mode).toBe('guide_mode')
  })
  it('migration 380 seeds Spot / Throughout for every tenant, adds the column defaulting to spot, and keeps the seeder locked', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/380_guide_modes.sql'), 'utf8')
    expect(sql).toMatch(/p_kind = 'guide_mode'/)
    expect(sql).toMatch(/'guide_mode', 'spot',\s+'Spot guide'/)
    expect(sql).toMatch(/'guide_mode', 'throughout', 'Throughout guide'/)
    expect(sql).toMatch(/PERFORM seed_tenant_vocabulary\(r\.id, 'guide_mode'\)/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS guide_mode VARCHAR\(50\) NOT NULL DEFAULT 'spot'/)
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.seed_tenant_vocabulary\(uuid, text\) FROM PUBLIC, anon, authenticated/)
  })
})

describe('the engine prices a quote only from rates of its mode', () => {
  beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key') })
  beforeEach(() => { clearVocabularyMemo(); setMockTables({}) })
  const SCOPE = { tenantId: 'test-tenant' }
  const row = (over: Record<string, unknown>) => ({ id: 'g', guide_language: 'english', guide_type: 'egyptologist', tour_duration: 'full_day', city: null, base_rate_eur: 60, is_active: true, ...over })

  it('a spot quote from the spot row; a throughout quote from the throughout row — at its own price', async () => {
    setMockTables({ guide_rates: [row({ id: 's', base_rate_eur: 60 }), row({ id: 't', guide_mode: 'throughout', base_rate_eur: 85 })] })
    expect((await getGuideRate(SCOPE, 'English', 'standard' as never, { mode: 'spot' }))?.dailyRate).toBe(60)
    expect((await getGuideRate(SCOPE, 'English', 'standard' as never, { mode: 'throughout' }))?.dailyRate).toBe(85)
  })
  it('a row with no mode is a SPOT rate (the column’s default); a throughout quote with only spot rows is a MISS', async () => {
    setMockTables({ guide_rates: [row({ id: 's' })] })
    expect((await getGuideRate(SCOPE, 'English', 'standard' as never))?.dailyRate).toBe(60)
    expect(await getGuideRate(SCOPE, 'English', 'standard' as never, { mode: 'throughout' })).toBeNull()
  })
  it('and a spot quote never reads a throughout rate', async () => {
    setMockTables({ guide_rates: [row({ id: 't', guide_mode: 'throughout' })] })
    expect(await getGuideRate(SCOPE, 'English', 'standard' as never, { mode: 'spot' })).toBeNull()
  })
  it('the day loop asks for the quote’s mode, and the gap says to add a Throughout rate', () => {
    const engine = readFileSync(join(process.cwd(), 'lib/auto-pricing-service.ts'), 'utf8')
    expect(engine).toContain("const quoteGuideMode = throughoutGuide ? 'throughout' : 'spot'")
    expect(engine).toContain('Add one with Guide Mode = Throughout in Rates → Guides — Spot rates are not used for a throughout guide.')
  })
})

describe('where the agency sees it', () => {
  it('the rate form, list, API and CSV carry the mode; the calculator’s buttons use the agency’s words', () => {
    expect(readFileSync(join(process.cwd(), 'app/rates/guides/guide-rates-content.tsx'), 'utf8')).toMatch(/<VocabSelect kind="guide_mode" value=\{formData\.guide_mode\}/)
    expect(readFileSync(join(process.cwd(), 'app/api/rates/guides/route.ts'), 'utf8')).toContain("guide_mode: body.guide_mode || 'spot'")
    expect(readFileSync(join(process.cwd(), 'app/api/rates/guides/[id]/route.ts'), 'utf8')).toContain("updateData.guide_mode = body.guide_mode || 'spot'")
    expect(readFileSync(join(process.cwd(), 'lib/bulk-rate-service.ts'), 'utf8')).toContain("col('guide_mode', 'Guide Mode', 'text', false)")
    const calc = readFileSync(join(process.cwd(), 'app/b2b/calculator/[id]/page.tsx'), 'utf8')
    expect(calc).toContain("useVocabulary('guide_mode')")
    expect(calc).toContain("{guideModeLabel('throughout') || 'Throughout'} (+1)")
  })
})

describe('meals on a night aboard read "included on board"', () => {
  it('in the label and the summary; a hotel night still says hotel', () => {
    expect(mealStatusLabel('included', 'cruise')).toBe('included on board')
    expect(mealStatusLabel('included', 'hotel')).toBe('hotel')
    expect(mealStatusLabel('included')).toBe('hotel')
    expect(summarizeMeals([{ day: 1, accommodation_type: 'cruise', meals: { breakfast: 'included', lunch: 'included', dinner: 'none' } }])[0]).toMatch(/Breakfast \(included on board\)/)
  })
})
