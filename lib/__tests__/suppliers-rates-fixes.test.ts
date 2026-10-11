// The Suppliers & Rates group checked against its docs: what the check found broken.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { uniqueServiceCode, codePart } from '@/lib/rates/unique-code'
import { formatTiersCell, parseTiersCell } from '@/lib/rates/activity-tiers'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(join(process.cwd(), dir))) {
    const rel = `${dir}/${name}`
    if (statSync(join(process.cwd(), rel)).isDirectory()) {
      if (name !== '__tests__') out.push(...routeFiles(rel))
    } else if (name === 'route.ts') out.push(rel)
  }
  return out
}

describe('who may change suppliers and rates', () => {
  // Exports are reads (POST only to carry a filter body).
  const files = ['app/api/suppliers', 'app/api/rates', 'app/api/resources/transportation']
    .flatMap(routeFiles)
    .filter(f => !/\/export\/route\.ts$/.test(f))

  it('finds the routes', () => {
    expect(files.length).toBeGreaterThan(30)
  })

  it.each(files)('%s: every write checks the manage role (RLS checks only the tenant)', file => {
    const src = read(file)
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const at = src.indexOf(`export async function ${m}(`)
      if (at === -1) continue
      const body = src.slice(at).split(/\nexport /)[0]
      expect(/roleDenied\(\w+\.role, 'manage'\)|gateRole\('manage'\)/.test(body), `${m} in ${file}`).toBe(true)
    }
  })
})

describe('rates CSV', () => {
  it('a generated code steps past one already taken (Cairo and Luxor tips shared one)', () => {
    expect(uniqueServiceCode('TIP-GUIDE-DAY', ['TIP-GUIDE-DAY', 'tip-guide-day-2'])).toBe('TIP-GUIDE-DAY-3')
    expect(uniqueServiceCode('AIR-CAI-MEET', [])).toBe('AIR-CAI-MEET')
    expect(codePart('Sharm El Sheikh')).toBe('SHARM-EL-SHEIKH')
  })

  it('activity bands round-trip through one cell', () => {
    const cell = formatTiersCell([{ min_pax: 5, max_pax: 8, rate_eur: 40 }, { min_pax: 1, max_pax: 4, rate_eur: 25 }])
    expect(cell).toBe('1-4:25; 5-8:40')
    expect(parseTiersCell(cell)).toMatchObject({ tiers: [{ min_pax: 1, max_pax: 4, rate_eur: 25 }, { min_pax: 5, max_pax: 8, rate_eur: 40 }] })
    expect(parseTiersCell('1-4:25; 3-8:40')).toHaveProperty('error')
  })

  it('the export is the tenant\'s own rows, not the shared catalogue', () => {
    expect(read('app/api/rates/bulk/export/route.ts')).toMatch(/\.select\('\*'\)\s*\n\s*\.eq\('tenant_id', tenant_id\)/)
  })

  it('the preview never offers to import a file the import will refuse', () => {
    const src = read('app/components/BulkRateImportExport.tsx')
    expect(src).toContain('importState.preview.validRows > 0 && importState.preview.invalidRows === 0')
    expect(src).toContain('Nothing is imported while any row has an error')
  })
})
