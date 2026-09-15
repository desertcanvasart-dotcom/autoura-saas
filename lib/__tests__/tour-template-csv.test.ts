// Flat tour-template CSV (English-only install): serialize the portable
// columns and parse them back. A Name (JA) column from a bilingual export is
// accepted and ignored; required-field and duplicate-code rows are refused.
import { describe, it, expect } from 'vitest'
import Papa from 'papaparse'
import { serializeTemplatesCsv, parseTemplatesCsv, sampleTemplateCsv, resolveTemplateVocabulary, TEMPLATE_CSV_COLUMNS } from '@/lib/tours/template-csv'

const papa = (csv: string) => {
  const p = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() })
  return { data: p.data, errors: p.errors.map(e => ({ message: e.message })) }
}

describe('serializeTemplatesCsv (no name_ja here)', () => {
  it('emits the portable columns and has no Name (JA) column', () => {
    const csv = serializeTemplatesCsv([
      { template_code: 'CAI-DAY-828', template_name: 'Memphis Day Trip', tour_type: 'day_tour', duration_days: 1, cities_covered: ['Cairo', 'Giza'], is_active: true, is_featured: false },
    ])
    const header = csv.trim().split('\n')[0]
    expect(header).toBe(TEMPLATE_CSV_COLUMNS.map(c => c.label).join(','))
    expect(header).not.toContain('Name (JA)')
  })
})

describe('parseTemplatesCsv', () => {
  it('round-trips a serialized sheet', () => {
    const csv = serializeTemplatesCsv([
      { template_code: 'NMS601-LND', template_name: 'Cairo & Luxor', tour_type: 'land_tour', duration_days: 6, duration_nights: 5, cities_covered: ['Cairo', 'Luxor'], is_active: true, is_featured: false },
    ])
    const { records, refused } = parseTemplatesCsv(csv, papa)
    expect(refused).toEqual([])
    expect(records[0]).toMatchObject({ template_code: 'NMS601-LND', tour_type: 'land_tour', duration_days: 6, cities_covered: ['Cairo', 'Luxor'] })
  })

  it('accepts but drops a Name (JA) column from a bilingual export', () => {
    const { records } = parseTemplatesCsv('Code,Name,Name (JA),Type,Duration Days\nX-1,Foo,フー,day_tour,1\n', papa)
    expect(records[0].template_code).toBe('X-1')
    expect(records[0]).not.toHaveProperty('name_ja')
  })

  it('skips the sample sheet’s EXAMPLE- guide row (uploading it unedited is a no-op)', () => {
    const { records, refused } = parseTemplatesCsv(sampleTemplateCsv(), papa)
    expect(records).toEqual([])
    expect(refused).toEqual([])
  })

  it('refuses required-field and duplicate-code rows', () => {
    const { records, refused } = parseTemplatesCsv(
      ['Code,Name,Type,Duration Days', 'X-3,Foo,,1', 'DUP,A,day_tour,1', 'DUP,B,day_tour,2'].join('\n'),
      papa,
    )
    expect(records).toHaveLength(1)
    expect(refused.map(r => r.reason)).toEqual([
      '"X-3": missing Type',
      '"DUP" appears more than once in this file',
    ])
  })
})

// ============================================================================
// The four tour fields became tenant vocabulary (358). Three of them now ride
// the sheet: the theme used to be a UUID into tour_categories and was left out
// entirely, which is how a field quietly stops round-tripping — the same way
// the supplier sheet was dropping its link columns (#399–#402).
// ============================================================================

describe('the vocabulary fields survive the round trip', () => {
  const row = {
    template_code: 'CAI-DAY-900',
    template_name: 'Old Cairo Walk',
    tour_type: 'day_tour',
    duration_days: 1,
    duration_nights: 0,
    cities_covered: ['Cairo'],
    tour_theme: 'cultural',
    physical_level: 'easy',
    best_for: ['families', 'first_time_visitors'],
    is_active: true,
    is_featured: false,
  }

  it('carries a column for each of them', () => {
    const header = serializeTemplatesCsv([row]).trim().split('\n')[0]
    for (const label of ['Theme', 'Physical Level', 'Best For']) {
      expect(header).toContain(label)
    }
  })

  it('returns every value unchanged', () => {
    const { records, refused } = parseTemplatesCsv(serializeTemplatesCsv([row]), papa)
    expect(refused).toEqual([])
    expect(records[0].tour_theme).toBe('cultural')
    expect(records[0].physical_level).toBe('easy')
    expect(records[0].best_for).toEqual(['families', 'first_time_visitors'])
  })

  it('carries KEYS, not the agency\'s labels', () => {
    // A key survives a rename; a label does not. The sheet must not start
    // holding "Families" again just because that is what the form displays.
    const csv = serializeTemplatesCsv([row])
    expect(csv).toContain('families; first_time_visitors')
    expect(csv).not.toContain('Families')
  })

  it('accepts a sheet a human retyped with spaces and pipes', () => {
    const csv = [
      'Code,Name,Type,Duration Days,Theme,Physical Level,Best For',
      'CAI-DAY-901,Islamic Cairo,day_tour,1,cultural,easy,families|seniors',
    ].join('\n')
    const { records, refused } = parseTemplatesCsv(csv, papa)
    expect(refused).toEqual([])
    expect(records[0].best_for).toEqual(['families', 'seniors'])
    expect(records[0].tour_theme).toBe('cultural')
  })

  it('leaves them out when a tour has none, rather than inventing a value', () => {
    const { records } = parseTemplatesCsv(
      serializeTemplatesCsv([{ ...row, tour_theme: null, physical_level: null, best_for: [] }]),
      papa
    )
    expect(records[0].tour_theme).toBeUndefined()
    expect(records[0].physical_level).toBeUndefined()
    expect(records[0].best_for).toBeUndefined()
  })

  it('the sample sheet shows all three filled in', () => {
    // The sample is the instruction manual: a blank column teaches nobody.
    const { records } = parseTemplatesCsv(
      sampleTemplateCsv().replace(/EXAMPLE-/g, 'REAL-'), papa
    )
    expect(records[0].tour_theme).toBeTruthy()
    expect(records[0].physical_level).toBeTruthy()
    expect(records[0].best_for?.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// The reported failure: download the sample, fill it in, upload, and get
// "No valid template rows found" with nothing refused and no clue why. The
// sample's own Code is EXAMPLE-REPLACE-THIS-CODE, which the parser skips on purpose so
// uploading it unedited creates nothing — but the skip was invisible.
// ============================================================================

describe('the sample sheet does not fail silently', () => {
  it('counts the example rows it skips', () => {
    const r = parseTemplatesCsv(sampleTemplateCsv(), papa)
    expect(r.records).toHaveLength(0)
    expect(r.refused).toHaveLength(0)
    // The number that lets the caller say WHY nothing imported.
    expect(r.exampleRows).toBe(1)
  })

  it('still skips a filled-in row whose Code was left alone — and counts it', () => {
    const csv = sampleTemplateCsv()
      .replace('Giza Pyramids & Egyptian Museum', 'My Real Tour')
      .replace('Cairo; Giza', 'Luxor')
    const r = parseTemplatesCsv(csv, papa)
    expect(r.records).toHaveLength(0)
    expect(r.exampleRows).toBe(1)
  })

  it('imports the moment the Code is replaced', () => {
    const r = parseTemplatesCsv(sampleTemplateCsv().replace('EXAMPLE-REPLACE-THIS-CODE', 'CAI-001'), papa)
    expect(r.records).toHaveLength(1)
    expect(r.exampleRows).toBe(0)
  })

  it('counts example rows without discarding the real ones beside them', () => {
    // Built with the serializer, not hand-typed: a literal row goes stale the
    // moment a column is added, and then fails as a field-count parse error
    // that looks nothing like the thing under test.
    const extraRow = serializeTemplatesCsv([
      { template_code: 'CAI-002', template_name: 'Second Tour', tour_type: 'day_tour', duration_days: 1 },
    ]).split('\n').slice(1).join('\n')
    const csv = sampleTemplateCsv().trimEnd() + '\n' + extraRow
    const r = parseTemplatesCsv(csv, papa)
    expect(r.records.map(x => x.template_code)).toEqual(['CAI-002'])
    expect(r.exampleRows).toBe(1)
  })
})

describe('a human may type the words they see on the form', () => {
  const choices = {
    tour_type: [
      { key: 'day_tour', label: 'Day Tour' },
      { key: 'multi_day', label: 'Multi-Day Tour' },
    ],
    tour_theme: [{ key: 'cultural', label: 'Cultural' }],
    tour_physical_level: [{ key: 'easy', label: 'Easy' }],
    tour_best_for: [
      { key: 'families', label: 'Families' },
      { key: 'first_time_visitors', label: 'First-time Visitors' },
    ],
  }

  // typed = the five vocabulary-bearing cells, in header order:
  // Type, Duration Days, Theme, Physical Level, Best For
  const parse = (typed: string) => {
    const csv = [
      'Code,Name,Type,Duration Days,Theme,Physical Level,Best For',
      `CAI-010,Real Tour,${typed}`,
    ].join('\n')
    const p = parseTemplatesCsv(csv, papa)
    // Surface a structural refusal rather than letting it look like a
    // vocabulary result of zero rows.
    expect(p.refused, 'row was refused before resolution').toEqual([])
    return resolveTemplateVocabulary(p.records, choices)
  }

  it('converts labels to the keys the row stores', () => {
    // Typing "Day Tour" used to be stored verbatim — a value no dropdown can
    // show, and one isSingleDayTourType() reads as multi-day, so the tour is
    // silently measured in days instead of hours.
    const { records, refused } = parse('Day Tour,1,Cultural,Easy,Families; First-time Visitors')
    expect(refused).toEqual([])
    // The one that changes behaviour, not just display: a stored "Day Tour"
    // reads as multi-day, so the tour is measured in days instead of hours.
    expect(records[0].tour_type).toBe('day_tour')
    expect(records[0].tour_theme).toBe('cultural')
    expect(records[0].physical_level).toBe('easy')
    expect(records[0].best_for).toEqual(['families', 'first_time_visitors'])
  })

  it('accepts keys unchanged, so an export re-imports', () => {
    const { records, refused } = parse('day_tour,1,cultural,easy,families')
    expect(refused).toEqual([])
    expect(records[0].tour_theme).toBe('cultural')
  })

  it('is forgiving about case and spacing', () => {
    const { records } = parse('DAY_TOUR,1,CULTURAL,  easy  ,families')
    expect(records[0].tour_type).toBe('day_tour')
    expect(records[0].tour_theme).toBe('cultural')
    expect(records[0].physical_level).toBe('easy')
  })

  it('refuses a value that is in neither, and names the options', () => {
    // Storing it would create a row the form cannot display and nobody can
    // find — the refuse-to-guess rule.
    const { records, refused } = parse('Day Tour,1,Mythology,Easy,Families')
    expect(records).toHaveLength(0)
    expect(refused[0].reason).toContain('Mythology')
    expect(refused[0].reason).toContain('Cultural')
    expect(refused[0].reason).toContain('Settings')
  })

  it('refuses one bad tag out of several rather than dropping it quietly', () => {
    const { records, refused } = parse('Day Tour,1,Cultural,Easy,Families; Astronauts')
    expect(records).toHaveLength(0)
    expect(refused[0].reason).toContain('Astronauts')
  })

  it('leaves values alone when the vocabulary could not be loaded', () => {
    // An empty list is a fetch failure, not bad input; refusing every row then
    // would turn a blip into "your whole sheet is invalid".
    const { records, refused } = resolveTemplateVocabulary(
      parseTemplatesCsv('Code,Name,Type,Duration Days,Theme\nCAI-011,T,day_tour,1,cultural', papa).records,
      {}
    )
    expect(refused).toEqual([])
    expect(records[0].tour_theme).toBe('cultural')
  })
})

// ============================================================================
// Second report: "No rows could be imported. missing Code". The rows were
// fine — the HEADER was not recognised, so nothing could find a code in them,
// and every row was then blamed for a missing cell. A header problem is about
// the file and has to be said once, about the file.
// ============================================================================

describe('an unusable header row is reported as such', () => {
  it('names the required columns it could not find, and what it found instead', () => {
    const r = parseTemplatesCsv('Reference,Title,Kind,Length\nCAI-1,My Tour,day_tour,1\n', papa)
    expect(r.records).toHaveLength(0)
    // Not a pile of per-row refusals blaming the cells.
    expect(r.refused).toEqual([])
    expect(r.headerError).toContain('Code')
    expect(r.headerError).toContain('Reference')
    expect(r.headerError).toContain('Sample CSV')
  })

  it('catches a sheet whose header row was deleted', () => {
    const r = parseTemplatesCsv('CAI-1,Tour One,day_tour,1\nCAI-2,Tour Two,day_tour,1\n', papa)
    expect(r.headerError).toBeTruthy()
  })

  it('names a single missing column in the singular', () => {
    const r = parseTemplatesCsv('Code,Name,Duration Days\nCAI-3,Tour,1\n', papa)
    expect(r.headerError).toContain('a required column: Type')
  })

  it('says nothing when the header is good', () => {
    const r = parseTemplatesCsv(sampleTemplateCsv().replace('EXAMPLE-REPLACE-THIS-CODE', 'CAI-4'), papa)
    expect(r.headerError).toBeUndefined()
    expect(r.records).toHaveLength(1)
  })
})

describe('headers a person would reasonably type are accepted', () => {
  it('takes Tour Code / Tour Name / Days', () => {
    const r = parseTemplatesCsv('Tour Code,Tour Name,Type,Days\nCAI-9,My Tour,day_tour,1\n', papa)
    expect(r.headerError).toBeUndefined()
    expect(r.records[0].template_code).toBe('CAI-9')
    expect(r.records[0].duration_days).toBe(1)
  })

  it('does not need the columns in the sample order', () => {
    const r = parseTemplatesCsv('Name,Type,Duration Days,Code\nMy Tour,day_tour,1,CAI-10\n', papa)
    expect(r.records[0].template_code).toBe('CAI-10')
  })
})

describe('a genuinely empty Code cell names its row', () => {
  it('points at the row, since there is no code to point at', () => {
    const r = parseTemplatesCsv(
      'Code,Name,Type,Duration Days\n,Tour One,day_tour,1\nCAI-2,Tour Two,day_tour,1\n', papa)
    expect(r.records.map(x => x.template_code)).toEqual(['CAI-2'])
    expect(r.refused[0].reason).toContain('row 2')
    expect(r.refused[0].reason).toContain('Code column')
  })
})

// ============================================================================
// A real sheet arrived carrying Highlights, Main Attractions, Inclusions,
// Exclusions, Meals Included, Image URL and Pickup Required — seven columns
// that all exist on tour_templates, that the sheet did not carry, and that the
// importer discarded without a word. The tour would have imported with none of
// its substance and nothing would have said so.
// ============================================================================

describe('the content columns ride the sheet', () => {
  const row = {
    template_code: 'CAI-020',
    template_name: 'Cairo & Luxor',
    tour_type: 'package',
    duration_days: 4,
    duration_nights: 3,
    highlights: ['Old Cairo', 'Giza Plateau'],
    main_attractions: ['Karnak Temple', 'Valley of the Kings'],
    inclusions: ['Guide', 'Transport'],
    exclusions: ['International flights', 'Tickets'],
    meals_included: ['Breakfast'],
    image_url: 'https://example.com/a.jpg',
    pickup_required: true,
  }

  it('has a column for each of them', () => {
    const header = serializeTemplatesCsv([row]).trim().split('\n')[0]
    for (const label of ['Highlights', 'Main Attractions', 'Inclusions', 'Exclusions',
                         'Meals Included', 'Image URL', 'Pickup Required']) {
      expect(header, label).toContain(label)
    }
  })

  it('returns every value unchanged', () => {
    const { records, refused } = parseTemplatesCsv(serializeTemplatesCsv([row]), papa)
    expect(refused).toEqual([])
    const r = records[0]
    expect(r.highlights).toEqual(['Old Cairo', 'Giza Plateau'])
    expect(r.main_attractions).toEqual(['Karnak Temple', 'Valley of the Kings'])
    expect(r.inclusions).toEqual(['Guide', 'Transport'])
    expect(r.exclusions).toEqual(['International flights', 'Tickets'])
    // Meals Included is EXPORTED (it describes the tour) but never IMPORTED:
    // it is derived from the days, and a typed value could contradict them.
    expect(r).not.toHaveProperty('meals_included')
    expect(r.image_url).toBe('https://example.com/a.jpg')
    expect(r.pickup_required).toBe(true)
  })

  it('the sample fills them in, so the format is self-teaching', () => {
    const { records } = parseTemplatesCsv(
      sampleTemplateCsv().replace(/EXAMPLE-REPLACE-THIS-CODE/, 'REAL-1'), papa)
    expect(records[0].inclusions?.length).toBeGreaterThan(0)
    expect(records[0].highlights?.length).toBeGreaterThan(0)
    expect(records[0].pickup_required).toBe(true)
  })
})

describe('a column this importer does not read is named, not swallowed', () => {
  it('lists the unknown columns', () => {
    const r = parseTemplatesCsv(
      'Code,Name,Type,Duration Days,Sales Notes,Internal Ref\nCAI-1,T,day_tour,1,x,y\n', papa)
    expect(r.records).toHaveLength(1)
    expect(r.ignoredHeaders).toEqual(['Sales Notes', 'Internal Ref'])
  })

  it('does not nag about a column ignored on purpose', () => {
    // Name (JA) comes from the bilingual install's export and is dropped by
    // design; listing it would be noise, not information.
    const r = parseTemplatesCsv(
      'Code,Name,Name (JA),Type,Duration Days\nCAI-2,T,テスト,day_tour,1\n', papa)
    expect(r.ignoredHeaders).toEqual([])
  })

  it('says nothing when every column was read', () => {
    const r = parseTemplatesCsv(
      sampleTemplateCsv().replace('EXAMPLE-REPLACE-THIS-CODE', 'CAI-3'), papa)
    expect(r.ignoredHeaders).toEqual([])
  })
})
