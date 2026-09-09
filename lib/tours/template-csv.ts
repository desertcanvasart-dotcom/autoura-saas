// Flat CSV for tour templates — the portable, non-nested metadata only.
// (Ported from travel-ops-pro; this install is English-only, so no name_ja.)
//
// A template also has an itinerary (day-by-day JSON), hotels, variations and
// version rows, plus install-local UUID links (category, destinations). None
// of those fit a flat sheet or survive a move between installs, so this carries
// ONLY the flat, portable columns: the code (the stable key), name, type,
// duration, the free-text city list, descriptions and the two flags. Import
// upserts by template_code and never touches a template's itinerary/hotels.

export interface TemplateCsvColumn {
  name: string
  label: string
  required?: boolean
  kind?: 'text' | 'int' | 'bool' | 'list'
}

export const TEMPLATE_CSV_COLUMNS: TemplateCsvColumn[] = [
  { name: 'template_code', label: 'Code', required: true },
  { name: 'template_name', label: 'Name', required: true },
  { name: 'tour_type', label: 'Type', required: true },
  { name: 'duration_days', label: 'Duration Days', required: true, kind: 'int' },
  { name: 'duration_nights', label: 'Duration Nights', kind: 'int' },
  { name: 'cities_covered', label: 'Cities', kind: 'list' },
  { name: 'short_description', label: 'Short Description' },
  { name: 'long_description', label: 'Long Description' },
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
 * is added per tour in the editor. The example's EXAMPLE- code is skipped on
 * import, so uploading the sample unedited is a safe no-op.
 */
export function sampleTemplateCsv(): string {
  return serializeTemplatesCsv([{
    template_code: 'EXAMPLE-DAY-001',
    template_name: 'Giza Pyramids & Egyptian Museum',
    tour_type: 'day_tour',
    duration_days: 1,
    duration_nights: 0,
    cities_covered: ['Cairo', 'Giza'],
    short_description: 'A classic full-day tour of Cairo’s headline sights.',
    long_description: 'Pyramids of Giza, the Sphinx, and the Egyptian Museum, with lunch.',
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
  short_description?: string
  long_description?: string
  is_featured?: boolean
  is_active?: boolean
}

export interface TemplateCsvParseResult {
  records: TemplateCsvRecord[]
  refused: Array<{ row: number; reason: string }>
  parseError?: string
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
  if (parsed.errors.length > 0) return { records: [], refused: [], parseError: parsed.errors[0].message }

  const records: TemplateCsvRecord[] = []
  const refused: Array<{ row: number; reason: string }> = []
  const seen = new Set<string>()

  parsed.data.forEach((raw, i) => {
    const rowNum = i + 2
    const rec: Record<string, unknown> = {}
    for (const [header, value] of Object.entries(raw)) {
      const field = HEADER_MAP[slug(header)]
      if (!field || field === '_ignore') continue
      const v = (value ?? '').trim()
      if (v === '') continue
      const col = TEMPLATE_CSV_COLUMNS.find(c => c.name === field)!
      if (col.kind === 'int') rec[field] = Number(v)
      else if (col.kind === 'bool') rec[field] = truthy(v)
      else if (col.kind === 'list') rec[field] = v.split(/[;|]/).map(s => s.trim()).filter(Boolean)
      else rec[field] = v
    }

    const code = String(rec.template_code ?? '').trim()
    if (!code) { refused.push({ row: rowNum, reason: 'missing Code' }); return }
    // The sample sheet's guide row — skip it so uploading the sample unedited
    // can't create a tour called EXAMPLE-…
    if (/^example[-_]/i.test(code)) return
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

  return { records, refused }
}
