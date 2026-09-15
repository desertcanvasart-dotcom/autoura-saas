import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// ============================================================================
// "duplicate key value violates unique constraint tour_templates_template_code_key"
// — importing a tour into a second workspace. template_code was declared
// UNIQUE with no tenant in it, so one agency using a code took it away from
// every other agency on the platform.
// ============================================================================

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/360_tour_codes_unique_per_tenant.sql'),
  'utf8'
)

describe('migration 360 scopes tour codes to their agency', () => {
  it('covers variations as well as templates', () => {
    // variation_code carries the identical declaration; leaving it is leaving
    // a trap that springs the moment template codes can collide.
    expect(sql).toContain("ARRAY['tour_templates', 'tour_variations']")
    expect(sql).toContain('template_code')
    expect(sql).toContain('variation_code')
  })

  it('finds the old constraint by its columns, not by a guessed name', () => {
    // The name in the error is a convention; the migration has to work against
    // whatever the database actually has.
    expect(sql).toContain('conkey = ARRAY[(')
    expect(sql).toContain('pg_attribute')
  })

  it('adds the tenant-scoped replacement', () => {
    expect(sql).toContain('UNIQUE (tenant_id, %I)')
  })

  it('asserts the global constraint is gone AND the scoped one exists', () => {
    // Dropping without adding would let one agency duplicate a code within
    // itself, which the upsert-by-code import relies on being impossible.
    expect(sql).toContain('is still globally unique')
    expect(sql).toContain('is not unique')
  })

  it('compares column sets order-insensitively', () => {
    // conkey carries declaration order; (code, tenant_id) is the same
    // guarantee as (tenant_id, code) and must not read as missing.
    expect(sql).toContain('array_agg(x ORDER BY x)')
  })
})

describe('the app already agreed with the new constraint', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

  it('every template_code lookup is scoped by tenant', () => {
    // If one were not, widening the constraint would let it read another
    // agency's tour.
    const src = read('app/api/tours/bulk/import/route.ts')
    const lookups = src.split('\n').filter(l => /\.eq\(['"]template_code['"]|\.in\(['"]template_code['"]/.test(l))
    expect(lookups.length).toBeGreaterThan(0)
    for (const l of lookups) expect(l, l.trim()).toContain('tenant_id')
  })
})
