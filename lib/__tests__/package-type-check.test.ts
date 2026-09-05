import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PACKAGE_TYPE_CONFIGS } from '@/lib/package-types'

// ============================================
// package_type: the TS vocabularies must fit the DB CHECK
// ============================================
// Migration 000 CHECKed itineraries.package_type against five values while
// the app's vocabulary grew to seven across TWO unions (lib/package-types.ts
// for the grid, lib/ai/parsing-utils.ts for the AI path). The grid's DEFAULT
// ('full-package') was not in the CHECK, so every pricing-grid save raised
// 23514 and surfaced as a 500. Migration 322 widened the CHECK to the union;
// this test keeps all three lists from drifting apart again: a slug added to
// either union without widening the CHECK fails here, not in production.

const ROOT = path.join(__dirname, '..', '..')

function checkListFromMigration(): string[] {
  const sql = readFileSync(
    path.join(ROOT, 'supabase', 'migrations', '322_bookings_calculator_quotes_package_types.sql'),
    'utf8'
  )
  const m = sql.match(/package_type IN \(([\s\S]*?)\)/)
  if (!m) throw new Error('322: could not find the package_type IN (...) list')
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
}

function aiUnionFromSource(): string[] {
  const src = readFileSync(path.join(ROOT, 'lib', 'ai', 'parsing-utils.ts'), 'utf8')
  const m = src.match(/export type PackageType =([\s\S]*?)\n\n/)
  if (!m) throw new Error('parsing-utils: could not find the PackageType union')
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
}

describe('package_type vocabulary vs DB CHECK', () => {
  const allowed = new Set(checkListFromMigration())

  it('the migration CHECK actually lists values', () => {
    expect(allowed.size).toBeGreaterThanOrEqual(5)
  })

  it('every grid package type (lib/package-types.ts) is accepted by the CHECK', () => {
    for (const cfg of PACKAGE_TYPE_CONFIGS) {
      expect(allowed, `'${cfg.slug}' is missing from migration 322's CHECK`).toContain(cfg.slug)
    }
  })

  it('every AI package type (lib/ai/parsing-utils.ts) is accepted by the CHECK', () => {
    const union = aiUnionFromSource()
    expect(union.length).toBeGreaterThanOrEqual(5)
    for (const slug of union) {
      expect(allowed, `'${slug}' is missing from migration 322's CHECK`).toContain(slug)
    }
  })

  it("the pricing grid's default package type is accepted by the CHECK", () => {
    const src = readFileSync(path.join(ROOT, 'app', 'api', 'pricing-grid', 'save', 'route.ts'), 'utf8')
    const m = src.match(/package_type:[^\n]*\|\|\s*'([^']+)'/)
    if (!m) throw new Error('pricing-grid save: could not find the package_type default')
    expect(allowed, `grid default '${m[1]}' is missing from migration 322's CHECK`).toContain(m[1])
  })
})
