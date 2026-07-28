import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import Papa from 'papaparse'

// ============================================================================
// Every rates page used to show TWO Import/Export pairs:
//   "Export CSV"/"Import CSV" — the shared BulkRateImportExport component,
//        server-side, RFC-compliant parsing, dry-run validation with preview
//   "Export"/"Import"          — a per-page hand-rolled implementation
//
// The hand-rolled one was not merely redundant, it CORRUPTED rates. It split
// the file on \n before handling quotes, so any field containing a newline —
// which the app's own export can produce — shifted every subsequent column.
// The reproduction is below: a rate silently becomes empty.
// ============================================================================

/** The removed parser, preserved verbatim so the bug stays demonstrable. */
function handRolledParse(text: string) {
  const lines = text.split('\n').filter(l => l.trim())
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const out: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const values: string[] = []
    let current = ''
    let inQuotes = false
    for (const char of lines[i]) {
      if (char === '"') inQuotes = !inQuotes
      else if (char === ',' && !inQuotes) { values.push(current.trim()); current = '' }
      else current += char
    }
    values.push(current.trim())
    const rec: Record<string, string> = {}
    headers.forEach((h, idx) => {
      rec[h] = (values[idx] || '').replace(/^"|"$/g, '').replace(/""/g, '"')
    })
    out.push(rec)
  }
  return out
}

// A quoted line break — legal CSV, and something an operator note produces.
const CSV = 'service_code,notes,base_rate_eur\nFL-001,"Morning flight\nvia Cairo",150\nFL-002,Direct,200'

describe('why the per-page CSV import had to go', () => {
  it('the hand-rolled parser loses the rate', () => {
    const rows = handRolledParse(CSV)
    expect(rows).toHaveLength(3)                 // should be 2
    expect(rows[0].base_rate_eur).toBe('')       // €150 silently gone
    expect(rows[1].service_code).toBe('via Cairo,150') // invented row
  })

  it('Papa.parse — what the shared component uses — is correct', () => {
    const rows = Papa.parse<Record<string, string>>(CSV, {
      header: true, skipEmptyLines: true,
    }).data
    expect(rows).toHaveLength(2)
    expect(rows[0].base_rate_eur).toBe('150')
    expect(rows[0].notes).toBe('Morning flight\nvia Cairo')
  })
})

describe('one import/export path per rates page', () => {
  const pages = fs
    .readdirSync(path.join(process.cwd(), 'app/rates'), { withFileTypes: true })
    .filter(d => d.isDirectory())
    .flatMap(d => {
      const dir = path.join(process.cwd(), 'app/rates', d.name)
      return fs.readdirSync(dir).filter(f => f.endsWith('.tsx')).map(f => path.join(dir, f))
    })

  it('no page reintroduces a local CSV handler', () => {
    for (const p of pages) {
      const src = fs.readFileSync(p, 'utf8')
      expect(src, `${path.basename(p)} must not hand-roll CSV`).not.toContain('handleImportCSV')
      expect(src, `${path.basename(p)} must not hand-roll CSV`).not.toContain('handleExportCSV')
    }
  })

  it('pages offering bulk rates use the shared component', () => {
    const withBulk = pages.filter(p =>
      fs.readFileSync(p, 'utf8').includes('BulkRateImportExport'))
    // 13 rate tables are configured; each has exactly one page wiring it up.
    expect(withBulk.length).toBeGreaterThanOrEqual(13)
  })
})
