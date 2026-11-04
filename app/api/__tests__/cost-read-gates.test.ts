import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

// ============================================================================
// Supplier costs are read by managers and admins only (2026-11-04)
// ============================================================================
// The rate pages were hidden from members and viewers, but their APIs only
// gated writes: any signed-in member or viewer could GET every rate sheet —
// supplier costs, the whole CSV export — straight from the API, because RLS
// scopes by company, not by role. Every GET under app/api/rates now carries a
// role gate. Two answer members too: entrance fees (they price the site
// vouchers members write) and the pricing grid's rate lists (members build
// quotes there). Viewers read neither.

const ROOT = path.join(__dirname, '..', '..', '..')

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : routeFiles(p)
    return name === 'route.ts' ? [p] : []
  })
}

function getHandler(src: string): string | null {
  const start = src.indexOf('export async function GET')
  if (start < 0) return null
  const next = src.indexOf('\nexport async function ', start + 1)
  return src.slice(start, next < 0 ? undefined : next)
}

// The level each GET must ask for; anything not listed must be 'manage'.
const STAFF_LEVEL = new Set([
  'app/api/rates/attractions/route.ts',
  'app/api/rates/attractions/[id]/route.ts',
  'app/api/pricing-grid/rates/route.ts',
])

const OTHER_COST_READS = [
  'app/api/pricing-grid/rates/route.ts',
  'app/api/b2b/transport-packages/route.ts',
  'app/api/extras-catalogue/route.ts',
]

const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join('/')

describe('every rate-sheet GET is role-gated', () => {
  const files = [...routeFiles(path.join(ROOT, 'app/api/rates')).map(rel), ...OTHER_COST_READS]
  const withGet = files
    .map(f => ({ f, get: getHandler(readFileSync(path.join(ROOT, f), 'utf8')) }))
    .filter((x): x is { f: string; get: string } => x.get !== null)

  it('finds the rate routes', () => {
    expect(withGet.length).toBeGreaterThan(25)
  })

  for (const { f, get } of withGet) {
    const level = STAFF_LEVEL.has(f) ? 'staff' : 'manage'
    it(`${f} GET asks for '${level}'`, () => {
      expect(get).toMatch(new RegExp(`roleDenied\\(\\w+\\.role, '${level}'\\)`))
      // The gate runs before any read.
      expect(get.indexOf('roleDenied')).toBeLessThan(get.search(/\.from\(/) === -1 ? Infinity : get.search(/\.from\(/))
    })
  }
})

describe('member pages do not read the manager-only rate sheets', () => {
  it('message templates pick supplier recipients from the supplier list', () => {
    const page = readFileSync(path.join(ROOT, 'app/settings/message-templates/page.tsx'), 'utf8')
    expect(page).not.toMatch(/'\/api\/rates\/(cruises|transportation|guides)'/)
    expect(page).toContain('/api/suppliers?type=transport_company')
  })
})
