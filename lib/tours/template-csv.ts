// Flat CSV for tour templates — the portable, non-nested metadata only.
// (Ported from travel-ops-pro; this install is English-only, so no name_ja.)
//
// A template also has an itinerary (day-by-day JSON), hotels, variations and
// version rows, plus install-local UUID links (destinations). None of those fit
// a flat sheet or survive a move between installs, so this carries ONLY the
// flat, portable columns: the code (the stable key), name, type, duration, the
// free-text city list, descriptions, the two flags, and the four vocabulary
// fields. Import upserts by template_code and never touches a template's
// itinerary/hotels.
//
// The vocabulary fields travel as KEYS, not labels — 'day_tour', not whatever
// this agency renamed it to. A key is the stable thing: it survives a rename,
// and it is what the row actually stores. The theme used to be a UUID pointing
// at tour_categories and was therefore left out of the sheet entirely, which
// is how a field can quietly stop round-tripping (see the supplier CSV work,
// #399–#402); as a key it travels like the rest.

export interface TemplateCsvColumn {
  name: string
  label: string
  required?: boolean
  kind?: 'text' | 'int' | 'bool' | 'list'
  /** Written on export, never read back as a value to store. */
  readOnly?: boolean
}

export const TEMPLATE_CSV_COLUMNS: TemplateCsvColumn[] = [
  { name: 'template_code', label: 'Code', required: true },
  { name: 'template_name', label: 'Name', required: true },
  { name: 'tour_type', label: 'Type', required: true },
  { name: 'duration_days', label: 'Duration Days', required: true, kind: 'int' },
  { name: 'duration_nights', label: 'Duration Nights', kind: 'int' },
  // A day tour's hours: filled on 12 of the 26 live templates and dropped by
  // every export before this, so an export → delete → re-import lost them.
  { name: 'duration_hours', label: 'Duration Hours', kind: 'int' },
  { name: 'accommodation_nights', label: 'Accommodation Nights', kind: 'int' },
  { name: 'cities_covered', label: 'Cities', kind: 'list' },
  { name: 'destinations_covered', label: 'Destinations', kind: 'list' },
  { name: 'tour_theme', label: 'Theme' },
  { name: 'physical_level', label: 'Physical Level' },
  { name: 'age_suitability', label: 'Age Suitability' },
  { name: 'best_for', label: 'Best For', kind: 'list' },
  { name: 'highlights', label: 'Highlights', kind: 'list' },
  { name: 'main_attractions', label: 'Main Attractions', kind: 'list' },
  { name: 'inclusions', label: 'Inclusions', kind: 'list' },
  { name: 'exclusions', label: 'Exclusions', kind: 'list' },
  // Derived from the days, by day (lib/tours/day-meals.ts). Exported so the
  // sheet describes the tour; ignored on import so it can never contradict them.
  { name: 'meals_included', label: 'Meals Included', kind: 'list', readOnly: true },
  { name: 'short_description', label: 'Short Description' },
  { name: 'long_description', label: 'Long Description' },
  { name: 'image_url', label: 'Image URL' },
  { name: 'gallery_urls', label: 'Gallery URLs', kind: 'list' },
  { name: 'pricing_mode', label: 'Pricing Mode' },
  { name: 'uses_day_builder', label: 'Uses Day Builder', kind: 'bool' },
  { name: 'default_transportation_service', label: 'Default Transport Service' },
  { name: 'transportation_city', label: 'Transport City' },
  { name: 'pickup_required', label: 'Pickup Required', kind: 'bool' },
  { name: 'is_featured', label: 'Featured', kind: 'bool' },
  { name: 'is_active', label: 'Active', kind: 'bool' },
]

const csvCell = (v: unknown): string => {
  const s = Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

/** Serialize template rows (DB shape) to CSV using the portable columns. */
export function serializeTemplatesCsv(rows: Array<Record<string, unknown>>): string {
  const header = TEMPLATE_CSV_COLUMNS.map(c => c.label).join(',')
  const body = rows.map(r =>
    TEMPLATE_CSV_COLUMNS.map(c => {
      if (c.kind === 'bool') return csvCell(r[c.name] ? 'true' : 'false')
      return csvCell(r[c.name])
    }).join(',')
  )
  return [header, ...body].join('\n') + '\n'
}

/**
 * The sheet to start a bulk upload from: header row + one filled-in example.
 * Add a row per tour and Import. Only flat metadata; the day-by-day itinerary
 * is added per tour in the editor.
 *
 * Any row whose Code starts with EXAMPLE- is skipped on import, so uploading
 * the sample unedited is a safe no-op. That safety is also the commonest way
 * an import "does nothing": people fill the example row in and leave its Code
 * alone. Hence EXAMPLE-REPLACE-THIS-CODE rather than a plausible-looking
 * EXAMPLE-DAY-001 — the cell now says what to do with it, and the import
 * names this as the reason when every row is still an example.
 */
export function sampleTemplateCsv(): string {
  return serializeTemplatesCsv([{
    template_code: 'EXAMPLE-REPLACE-THIS-CODE',
    template_name: 'Giza Pyramids & Egyptian Museum',
    tour_type: 'day_tour',
    duration_days: 1,
    duration_nights: 0,
    cities_covered: ['Cairo', 'Giza'],
    tour_theme: 'cultural',
    physical_level: 'moderate',
    best_for: ['families', 'first_time_visitors'],
    highlights: ['Great Pyramid of Khufu', 'The Sphinx at sunset', 'Tutankhamun galleries'],
    main_attractions: ['Giza Plateau', 'Egyptian Museum'],
    inclusions: ['Licensed Egyptologist guide', 'Air-conditioned transport', 'Lunch'],
    exclusions: ['Entrance tickets', 'Gratuities'],
    meals_included: ['Day 1: Lunch'],
    short_description: 'A classic full-day tour of Cairo’s headline sights.',
    long_description: 'Pyramids of Giza, the Sphinx, and the Egyptian Museum, with lunch.',
    image_url: 'https://example.com/giza.jpg',
    pickup_required: true,
    is_featured: false,
    is_active: true,
  }])
}

export interface TemplateCsvRecord {
  template_code: string
  template_name: string
  tour_type: string
  duration_days: number
  duration_nights?: number
  cities_covered?: string[]
  tour_theme?: string
  physical_level?: string
  best_for?: string[]
  highlights?: string[]
  main_attractions?: string[]
  inclusions?: string[]
  exclusions?: string[]
  meals_included?: string[]
  short_description?: string
  long_description?: string
  image_url?: string
  pickup_required?: boolean
  is_featured?: boolean
  is_active?: boolean
}

// ---------------------------------------------------------------------------
// Vocabulary columns
// ---------------------------------------------------------------------------
// Four columns hold tenant-vocabulary values, and the row stores a KEY. A
// person filling this sheet in reads the labels off the Tour Manager form and
// types THOSE — "Day Tour", not "day_tour". Storing that verbatim produces a
// value no dropdown can show and that isSingleDayTourType() reads as
// multi-day: a tour silently measured in the wrong unit.
//
// So a label is accepted and converted, and anything that resolves to nothing
// is REFUSED with the valid options named, rather than written and forgotten.

export interface VocabChoice { key: string; label: string }

export const TEMPLATE_VOCAB_COLUMNS = [
  { field: 'tour_type', kind: 'tour_type', label: 'Type', multi: false, required: true },
  { field: 'tour_theme', kind: 'tour_theme', label: 'Theme', multi: false, required: false },
  { field: 'physical_level', kind: 'tour_physical_level', label: 'Physical Level', multi: false, required: false },
  { field: 'best_for', kind: 'tour_best_for', label: 'Best For', multi: true, required: false },
] as const

/**
 * A raw cell to a vocabulary key: the key itself, the agency's label, or
 * anything that slugifies to a key ("Day Tour", "day tour", "DAY_TOUR").
 * null when it matches nothing — the caller refuses the row.
 */
export function resolveVocabKey(choices: VocabChoice[], raw: string): string | null {
  const v = String(raw ?? '').trim()
  if (!v) return null
  const lower = v.toLowerCase()
  const exact = choices.find(c => c.key === v)
  if (exact) return exact.key
  const byKey = choices.find(c => c.key.toLowerCase() === lower)
  if (byKey) return byKey.key
  const byLabel = choices.find(c => c.label.trim().toLowerCase() === lower)
  if (byLabel) return byLabel.key
  const slugged = slug(v)
  const bySlug = choices.find(c => c.key === slugged)
  return bySlug ? bySlug.key : null
}

/**
 * Resolve every vocabulary column on every record, in place. A row carrying a
 * value that is not in this tenant's vocabulary is refused and named — that
 * value would otherwise be invisible in the app the moment it was written.
 */
export function resolveTemplateVocabulary(
  records: TemplateCsvRecord[],
  choicesByKind: Record<string, VocabChoice[]>,
): { records: TemplateCsvRecord[]; refused: Array<{ row: number; reason: string }> } {
  const kept: TemplateCsvRecord[] = []
  const refused: Array<{ row: number; reason: string }> = []

  for (const rec of records) {
    const r = rec as unknown as Record<string, unknown>
    let bad: string | null = null

    for (const col of TEMPLATE_VOCAB_COLUMNS) {
      const choices = choicesByKind[col.kind] ?? []
      const raw = r[col.field]
      if (raw == null || raw === '' || (Array.isArray(raw) && raw.length === 0)) continue

      // With no vocabulary loaded at all, leave the value alone rather than
      // refuse everything — an empty list is a fetch problem, not bad input.
      if (choices.length === 0) continue

      const options = choices.map(c => c.label).join(', ')
      if (col.multi) {
        const out: string[] = []
        for (const one of raw as string[]) {
          const key = resolveVocabKey(choices, one)
          if (!key) { bad = `${col.label} "${one}" is not one of your options (${options})`; break }
          out.push(key)
        }
        if (bad) break
        r[col.field] = out
      } else {
        const key = resolveVocabKey(choices, String(raw))
        if (!key) { bad = `${col.label} "${raw}" is not one of your options (${options})`; break }
        r[col.field] = key
      }
    }

    if (bad) {
      refused.push({
        row: 0,
        reason: `"${rec.template_code}": ${bad}. Add it in Settings → Your vocabulary, or correct the spelling.`,
      })
    } else {
      kept.push(rec)
    }
  }

  return { records: kept, refused }
}

export interface TemplateCsvParseResult {
  records: TemplateCsvRecord[]
  refused: Array<{ row: number; reason: string }>
  /** Rows skipped because they still carry the sample's EXAMPLE- code. Counted
   *  rather than silently dropped: a sheet that is ALL example rows is the
   *  commonest failed import, and "no valid rows" does not explain it. */
  exampleRows: number
  parseError?: string
  /** Columns in the sheet that this importer does not carry. Reported rather
   *  than dropped in silence: a person who put Inclusions in their file and
   *  got a tour with none would have no way to tell that the column was simply
   *  not read. Deliberately-ignored columns (Name (JA)) are not listed. */
  ignoredHeaders: string[]
  /** The header row is unusable — a required column is not in it at all.
   *  Distinct from parseError (the CSV is well-formed) and from a row-level
   *  refusal (the rows may be perfect; nothing can find them). */
  headerError?: string
}

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

const HEADER_MAP: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const c of TEMPLATE_CSV_COLUMNS) {
    m[slug(c.label)] = c.name
    m[c.name] = c.name
  }
  m['code'] = 'template_code'
  m['name'] = 'template_name'
  // Sensible things a person types instead of the sample's header.
  m['tour_code'] = 'template_code'
  m['tour_name'] = 'template_name'
  m['days'] = 'duration_days'
  m['nights'] = 'duration_nights'
  // Accept a Name (JA) column from a bilingual export, but drop it (English-only here).
  m['name_ja'] = '_ignore'
  return m
})()

const truthy = (v: string) => ['true', '1', 'yes', 'y', 'active', 'featured'].includes(v.trim().toLowerCase())

/**
 * Parse a template CSV. Header-tolerant. Refuses a row missing a required
 * field (reason named) and a duplicate code within the file.
 */
export function parseTemplatesCsv(
  csvData: string,
  parse: (csv: string) => { data: Array<Record<string, string>>; errors: Array<{ message: string }> },
): TemplateCsvParseResult {
  const parsed = parse(csvData)
  if (parsed.errors.length > 0) return { records: [], refused: [], exampleRows: 0, ignoredHeaders: [], parseError: parsed.errors[0].message }

  // Check the HEADER before the rows. A header the map does not recognise
  // ("Tour Code" instead of "Code", or a sheet saved with its header row
  // deleted) leaves every row without a template_code, and each one is then
  // refused for "missing Code" — which points at the cells, when the cells are
  // fine and the header is the problem. Say that once, about the file.
  const headers = Object.keys(parsed.data[0] ?? {})
  if (headers.length > 0) {
    const mapped = new Set(headers.map(h => HEADER_MAP[slug(h)]).filter(Boolean))
    const missing = TEMPLATE_CSV_COLUMNS
      .filter(c => c.required && !mapped.has(c.name))
      .map(c => c.label)
    if (missing.length > 0) {
      return {
        records: [],
        refused: [],
        exampleRows: 0,
        ignoredHeaders: [],
        headerError:
          `The header row is missing ${missing.length === 1 ? 'a required column' : 'required columns'}: ` +
          `${missing.join(', ')}. It has: ${headers.join(', ')}. ` +
          `Download a fresh Sample CSV to see the header this expects.`,
      }
    }
  }

  // Anything the map has no entry for at all. '_ignore' entries are left out:
  // those are ignored on purpose and saying so would be noise.
  const ignoredHeaders = headers.filter(h => !HEADER_MAP[slug(h)])

  const records: TemplateCsvRecord[] = []
  const refused: Array<{ row: number; reason: string }> = []
  const seen = new Set<string>()
  let exampleRows = 0

  parsed.data.forEach((raw, i) => {
    const rowNum = i + 2
    const rec: Record<string, unknown> = {}
    for (const [header, value] of Object.entries(raw)) {
      const field = HEADER_MAP[slug(header)]
      if (!field || field === '_ignore') continue
      const v = (value ?? '').trim()
      if (v === '') continue
      const col = TEMPLATE_CSV_COLUMNS.find(c => c.name === field)!
      if (col.readOnly) continue
      if (col.kind === 'int') rec[field] = Number(v)
      else if (col.kind === 'bool') rec[field] = truthy(v)
      else if (col.kind === 'list') rec[field] = v.split(/[;|]/).map(s => s.trim()).filter(Boolean)
      else rec[field] = v
    }

    const code = String(rec.template_code ?? '').trim()
    // Name the ROW: there is no code to identify this row by, and "missing
    // Code" on its own tells you nothing about where to look.
    if (!code) {
      refused.push({ row: rowNum, reason: `row ${rowNum} has no Code — every tour needs its own code in the Code column` })
      return
    }
    // The sample sheet's guide row — skip it so uploading the sample unedited
    // can't create a tour called EXAMPLE-…. COUNTED, not silently dropped:
    // filling the sample in and leaving its Code alone is the commonest failed
    // import, and it used to end in "no valid rows" with nothing refused and
    // no hint that the Code column was the problem.
    if (/^example[-_]/i.test(code)) { exampleRows++; return }
    if (!String(rec.template_name ?? '').trim()) { refused.push({ row: rowNum, reason: `"${code}": missing Name` }); return }
    if (!String(rec.tour_type ?? '').trim()) { refused.push({ row: rowNum, reason: `"${code}": missing Type` }); return }
    if (rec.duration_days == null || !Number.isFinite(rec.duration_days as number) || (rec.duration_days as number) < 1) {
      refused.push({ row: rowNum, reason: `"${code}": Duration Days must be a whole number ≥ 1` }); return
    }
    const key = code.toLowerCase()
    if (seen.has(key)) { refused.push({ row: rowNum, reason: `"${code}" appears more than once in this file` }); return }
    seen.add(key)

    records.push(rec as unknown as TemplateCsvRecord)
  })

  return { records, refused, exampleRows, ignoredHeaders }
}
