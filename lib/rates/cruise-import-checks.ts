// ============================================
// Cruise sheet: things worth saying BEFORE the import writes
// ============================================
// Operator, 2026-11-25: an annual sheet gave every departure date its own
// cruise code ("DAR-ASCA-20270212-JS"), so 8 sailings landed as 56 records,
// and the blank Cabin Type column left four cabins all "standard". Both
// import cleanly — they are valid files — so the preview warns, never refuses.

/** A date inside a code: 20270212 or 2027-02-12, with the separator before it. */
const DATE_IN_CODE = /[-_ ]?(?<!\d)20\d{2}-?(0[1-9]|1[0-2])-?(0[1-9]|[12]\d|3[01])(?!\d)/

const cell = (r: Record<string, string>, k: string) => (r[k] ?? '').trim()
const sailingOf = (r: Record<string, string>) =>
  ['ship_name', 'route_name', 'duration_nights'].map(k => cell(r, k).toLowerCase()).join('|')
const named = (r: Record<string, string>) =>
  [cell(r, 'ship_name'), cell(r, 'route_name')].filter(Boolean).join(', ')

/** One row per cruise record the file would write (periods already grouped). */
export function cruiseImportWarnings(rows: Array<Record<string, string>>): string[] {
  const warnings: string[] = []

  // 1. Codes that differ only by a date are one cruise written many times.
  const undated = new Map<string, string[]>()
  for (const r of rows) {
    const code = cell(r, 'cruise_code')
    if (!DATE_IN_CODE.test(code)) continue
    const key = `${code.replace(DATE_IN_CODE, '')}|${sailingOf(r)}|${cell(r, 'cabin_type').toLowerCase()}`
    undated.set(key, [...(undated.get(key) ?? []), code])
  }
  for (const [key, codes] of undated) {
    if (codes.length < 2) continue
    warnings.push(
      `${codes.length} separate cruises differ only by the date in their code (${codes[0]}, ${codes[1]}…). ` +
      `For one cruise with ${codes.length} periods, give those rows the same Cruise Code, e.g. "${key.split('|')[0]}".`
    )
  }

  // 2. No cabin type, and more than one record for the same sailing.
  const blank = new Map<string, Array<Record<string, string>>>()
  for (const r of rows) {
    if (cell(r, 'cabin_type')) continue
    blank.set(sailingOf(r), [...(blank.get(sailingOf(r)) ?? []), r])
  }
  for (const group of blank.values()) {
    if (group.length < 2) continue
    warnings.push(
      `${named(group[0])}: ${group.length} cruises have no Cabin Type. New ones are saved as the default cabin, ` +
      'so they cannot be told apart. Fill the Cabin Type column.'
    )
  }
  return warnings
}
