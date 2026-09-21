// The cruise sheet dropped the cabin.
//
// The Add Cruise form has always asked for a cabin type, the list filters by
// it and the cruise code is built from it — but the CSV sheet never carried
// it. An export lost it, and a cruise imported as new took the column's
// default. Checked on production, 2026-09-20: all 132 cruises are 'standard'
// or blank, in every agency.
//
// (The sibling app has the same gap with a NOT NULL column, where it is not a
// quiet loss but a failed import — which is how this one was found.)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { RATE_TABLE_CONFIGS, getExportHeaders, getTemplateHeaders, validateImportData } from '@/lib/bulk-rate-service'
import { vocabularyColumnsFor, resolveRecordKeys } from '@/lib/vocabulary'

const config = RATE_TABLE_CONFIGS.nile_cruises
const row = (over: Record<string, string> = {}): Record<string, string> => ({
  cruise_code: 'NC-100', ship_name: 'MS Farah', ship_category: 'luxury',
  route_name: 'Luxor–Aswan', embark_city: 'Luxor', disembark_city: 'Aswan',
  duration_nights: '4', ...over,
})

describe('the cruise sheet carries the cabin', () => {
  it('on the export and on the sample, so a round trip keeps it', () => {
    expect(getExportHeaders(config)).toContain('cabin_type')
    expect(getTemplateHeaders(config)).toContain('cabin_type')
  })

  it('takes a cruise that names its cabin', () => {
    expect(validateImportData([row({ cabin_type: 'deluxe' })], config).errors).toEqual([])
  })

  it('is optional — a file written before the column existed still imports', () => {
    expect(config.columns.find(c => c.name === 'cabin_type')?.required).toBe(false)
    expect(validateImportData([row()], config).errors).toEqual([])
  })
})

describe('what "cabin type" means depends on the table', () => {
  const vocab = {
    cruise_cabin: [{ key: 'standard', label: 'Standard' }, { key: 'deluxe', label: 'Deluxe' }, { key: 'suite', label: 'Suite' }],
    sleeper_cabin: [{ key: 'single_cabin', label: 'Single cabin' }, { key: 'double_cabin', label: 'Double cabin' }],
  }

  it('a cruise cabin on cruises, still a sleeper cabin on sleeping trains', () => {
    expect(vocabularyColumnsFor('nile_cruises').cabin_type).toBe('cruise_cabin')
    expect(vocabularyColumnsFor('sleeping_train_rates').cabin_type).toBe('sleeper_cabin')
  })

  it('so "Deluxe" is the agency\'s cruise cabin, stored as its key', () => {
    const { record, errors } = resolveRecordKeys(row({ cabin_type: 'Deluxe' }), vocab, vocabularyColumnsFor('nile_cruises'))
    expect(errors).toEqual([])
    expect(record.cabin_type).toBe('deluxe')
  })

  it('and would have been REFUSED under the app-wide meaning — the reason for the per-table entry', () => {
    const { errors } = resolveRecordKeys(row({ cabin_type: 'Deluxe' }), vocab, vocabularyColumnsFor('sleeping_train_rates'))
    expect(errors[0]).toMatch(/sleeper cabin/)
  })

  it('a word the agency does not use is named, not stored', () => {
    const { errors } = resolveRecordKeys(row({ cabin_type: 'Presidential' }), vocab, vocabularyColumnsFor('nile_cruises'))
    expect(errors[0]).toMatch(/"Presidential" is not in your cruise cabin list/)
  })

  it('a blank is left alone — the import skips a blank cell, so an existing cruise keeps its cabin', () => {
    const { record, errors } = resolveRecordKeys(row({ cabin_type: '' }), vocab, vocabularyColumnsFor('nile_cruises'))
    expect(errors).toEqual([])
    expect(record.cabin_type).toBe('')
  })
})

describe('an older file cannot wipe a cabin', () => {
  // The safety of adding the column rests on this line of the import route: a
  // blank or absent cell is never written, so it can neither null a cabin nor
  // reset it to the default on an existing cruise.
  it('the import writes only the cells that hold something', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/rates/bulk/import/route.ts'), 'utf8')
    expect(route).toMatch(/if \(raw === '' \|\| raw === 'null'\) continue/)
  })
})
