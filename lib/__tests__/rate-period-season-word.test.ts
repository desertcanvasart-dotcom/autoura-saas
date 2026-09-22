// A rate period carries the supplier's season WORD (sibling #452): a key of
// the agency's own rate_season vocabulary, beside the free-text name. A label
// only — pricing reads the period's dates, never the word.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { sanitizeSeasons, seasonKey, ratePeriodLines, resolveTravelDateRates } from '@/lib/rates/rate-seasons'
import { parsePeriodsCsv, detectPeriodsCsv } from '@/lib/rates/periods-csv'

const period = (over: Record<string, unknown> = {}) => ({ name: 'Winter', from: '2026-11-01', to: '2027-02-28', rates: { ppd_eur: 90 }, ...over })

describe('the stored period', () => {
  it('keeps a season key, tidied; none when blank or junk', () => {
    expect(sanitizeSeasons([period({ season: 'christmas' })], 'accommodation')![0].season).toBe('christmas')
    expect(sanitizeSeasons([period({ season: ' High Season ' })], 'accommodation')![0].season).toBe('high_season')
    expect(sanitizeSeasons([period()], 'accommodation')![0]).not.toHaveProperty('season')
    expect(sanitizeSeasons([period({ season: '' })], 'accommodation')![0]).not.toHaveProperty('season')
    expect(seasonKey(42)).toBe('42'); expect(seasonKey('!!')).toBeUndefined()
  })
  it('is a label: the period prices by its dates whatever the word says', () => {
    const row = { seasons: [period({ season: 'peak_season' })] }
    expect(resolveTravelDateRates(row, 'accommodation', '2026-12-10')).toMatchObject({ kind: 'period', rates: { ppd_eur: 90 } })
    expect(resolveTravelDateRates(row, 'accommodation', '2027-07-10').kind).toBe('gap')
  })
  it('the list line carries it', () => {
    const [line] = ratePeriodLines({ seasons: [period({ season: 'christmas' })] }, 'accommodation', '2026-12-10')
    expect(line).toMatchObject({ name: 'Winter', season: 'christmas', current: true })
    expect(ratePeriodLines({ seasons: [period()] }, 'accommodation')[0]).not.toHaveProperty('season')
  })
})

describe('the periods sheet', () => {
  const HEADER = 'Service Code,Property Name,Period Name,Season,From,To,PPD (EU passport)'
  it('has a Season column, read as typed (the import route resolves the word to the key)', () => {
    expect(detectPeriodsCsv(HEADER.split(','))).toBe(true)
    const rows = [{ 'Service Code': 'H1', 'Property Name': 'Nile Palace', 'Period Name': 'Xmas', Season: 'Christmas', From: '2026-12-20', To: '2027-01-05', 'PPD (EU passport)': '120' },
                  { 'Service Code': 'H1', 'Property Name': 'Nile Palace', 'Period Name': 'Rest', Season: '', From: '2027-01-06', To: '2027-04-30', 'PPD (EU passport)': '90' }]
    const { groups, errors } = parsePeriodsCsv(rows)
    expect(errors).toEqual([])
    expect(groups[0].periods.map(p => p.season)).toEqual(['Christmas', undefined])
  })
})

describe('the import route and the editor', () => {
  it('the route resolves the word to the agency’s key and refuses one not in the list', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/rates/bulk/import/route.ts'), 'utf8')
    expect(route).toContain("loadVocabulary(supabase, 'rate_season')")
    expect(route).toContain('is not in your rate seasons list')
    expect(route).toMatch(/season: resolveVocabularyKey\(seasonVocab, p\.season\)/)
  })
  it('the period editor offers the season from the vocabulary; the list shows it', () => {
    expect(readFileSync(join(process.cwd(), 'app/components/RatePeriodsEditor.tsx'), 'utf8')).toMatch(/<VocabSelect\s+kind="rate_season"/)
    expect(readFileSync(join(process.cwd(), 'components/rates/RatePeriodLines.tsx'), 'utf8')).toMatch(/<VocabLabel kind="rate_season" value=\{line\.season\} \/>/)
  })
})
