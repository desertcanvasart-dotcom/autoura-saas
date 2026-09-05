import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { getCatalogScope, catalogOrExpr, CATALOG_TABLES } from '@/lib/catalog-scope'

// ============================================
// The global catalog is RETIRED (migration 331)
// ============================================
// Shared NULL-tenant rate rows were pure confusion — rates nobody in the
// company entered, wearing nobody's contract. Every rate query is a plain
// tenant filter now, and these tests keep it that way.

describe('catalogOrExpr — tenant rows only, forever', () => {
  it('emits a single-clause tenant filter', () => {
    expect(catalogOrExpr({ tenantId: 't-1' })).toBe('tenant_id.eq.t-1')
  })

  it('never mentions NULL-tenant rows again', () => {
    expect(catalogOrExpr({ tenantId: 't-1' })).not.toMatch(/is\.null/)
  })
})

describe('getCatalogScope', () => {
  it('resolves without touching the database', async () => {
    // A client that explodes on ANY use: proves nothing is read.
    const bomb = new Proxy({}, { get() { throw new Error('getCatalogScope must not read the database') } })
    expect(await getCatalogScope(bomb, 't-9')).toEqual({ tenantId: 't-9' })
  })
})

describe('the retirement holds at the source level', () => {
  const ROOT = path.resolve(__dirname, '../..')

  it('no production source outside the scope module builds a tenant_id.is.null rate filter', () => {
    // The one legitimate `is.null` mention lives in this test. A new one in
    // app/ or lib/ would be the catalog sneaking back.
    const hits = execSync(
      `grep -rln "tenant_id.is.null" app lib --include="*.ts" --include="*.tsx" || true`,
      { cwd: ROOT, encoding: 'utf8' }
    )
      .split('\n')
      .filter(Boolean)
      .filter(f => !f.includes('__tests__'))
      // attraction_aliases global rows are TEXT VOCABULARY (alias →
      // canonical name), kept deliberately — not rates.
      .filter(f => !f.endsWith('lib/pricing/attraction-aliases.ts'))
    expect(hits, `tenant_id.is.null filters found (the catalog sneaking back):\n${hits.join('\n')}`).toEqual([])
  })

  it('migration 331 deletes the global rows from all seven catalog tables', () => {
    const sql = readFileSync(
      path.join(ROOT, 'supabase', 'migrations', '331_retire_global_catalog.sql'),
      'utf8'
    )
    for (const t of CATALOG_TABLES) {
      expect(sql, `migration 331 must handle ${t}`).toContain(`'${t}'`)
    }
    expect(sql).toMatch(/DELETE FROM %I WHERE tenant_id IS NULL|tenant_id IS NULL/)
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS get_use_global_catalog/)
    expect(sql).toMatch(/DROP COLUMN IF EXISTS use_global_catalog/)
  })
})
