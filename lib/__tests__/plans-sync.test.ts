import { describe, it, expect } from 'vitest'
import { PRICING_TIERS } from '@/lib/pricing-config'
import {
  buildPlanRows,
  renderPlansArtifact,
  toDbLimit,
  UNLIMITED_SENTINELS,
  PLAN_CURRENCY,
  type PlanRow,
} from '@/lib/plans-sync'

// ============================================================================
// THE DRIFT GATE.
//
// `lib/pricing-config.ts` is canonical; `subscription_plans` is derived. The
// snapshot below is the committed artifact that scripts/sync-plans.mjs applies
// on every deploy — plain Node cannot import TypeScript, so the artifact is
// the handoff.
//
// Editing a tier without regenerating FAILS THIS TEST, which fails the build.
// That is deliberate: the previous arrangement let pricing-config.ts and the
// database disagree for months while enforcement quietly used the database.
//
// To regenerate after an intentional change:
//     npx vitest run lib/__tests__/plans-sync.test.ts -u
// ============================================================================

describe('plan artifact — drift gate', () => {
  it('matches the committed artifact applied on deploy', async () => {
    await expect(renderPlansArtifact()).toMatchFileSnapshot(
      '../../supabase/generated/plans.json'
    )
  })
})

describe('buildPlanRows', () => {
  const rows = buildPlanRows()

  it('emits exactly one row per configured tier', () => {
    expect(rows).toHaveLength(Object.keys(PRICING_TIERS).length)
    const slugs = rows.map(r => r.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('produces no slug that is absent from the config', () => {
    const configured = new Set(Object.values(PRICING_TIERS).map(t => t.slug))
    for (const row of rows) expect(configured.has(row.slug)).toBe(true)
  })

  it('is deterministic — same input, byte-identical output', () => {
    expect(renderPlansArtifact()).toBe(renderPlansArtifact())
  })

  it('orders by slug so the artifact does not churn on key reordering', () => {
    const slugs = rows.map(r => r.slug)
    expect(slugs).toEqual([...slugs].sort())
  })

  it('states the currency explicitly — the column defaults to EUR, prices are USD', () => {
    for (const row of rows) expect(row.currency).toBe(PLAN_CURRENCY)
  })

  it('never gates pricing runs — the pricing engine calls no LLM', () => {
    for (const row of rows) expect(row.max_pricing_runs_per_month).toBeNull()
  })

  it('marks every generated plan active', () => {
    for (const row of rows) expect(row.is_active).toBe(true)
  })
})

describe('toDbLimit — sentinel to NULL bridge', () => {
  it('passes a real cap through unchanged', () => {
    expect(toDbLimit(3)).toBe(3)
    expect(toDbLimit(120)).toBe(120)
  })

  it('maps the exact unlimited sentinels to NULL', () => {
    for (const sentinel of UNLIMITED_SENTINELS) {
      expect(toDbLimit(sentinel)).toBeNull()
    }
  })

  it('REGRESSION: a large but REAL cap survives — 1500 is not unlimited', () => {
    // Business genuinely allows 1500 quotes/month. A ">= 999" threshold turned
    // that into NULL, i.e. a paid limit that would never enforce. Matching the
    // sentinels exactly is the fix.
    expect(toDbLimit(1500)).toBe(1500)
    expect(toDbLimit(1000)).toBe(1000)
    expect(toDbLimit(2000)).toBe(2000)
  })

  it('treats absent or non-finite as unlimited rather than zero', () => {
    expect(toDbLimit(null)).toBeNull()
    expect(toDbLimit(undefined)).toBeNull()
    expect(toDbLimit(NaN)).toBeNull()
    expect(toDbLimit(Infinity)).toBeNull()
  })

  it('does not treat 0 as unlimited — zero is a real (blocking) cap', () => {
    expect(toDbLimit(0)).toBe(0)
  })
})

describe('drift detection actually detects drift', () => {
  it('a changed limit changes the artifact', () => {
    const before = renderPlansArtifact()
    const mutated = JSON.parse(JSON.stringify(PRICING_TIERS)) as typeof PRICING_TIERS
    mutated.starter.maxUsers = 99
    const after = renderPlansArtifact(buildPlanRows(mutated))
    expect(after).not.toBe(before)
  })

  it('a changed price changes the artifact', () => {
    const before = renderPlansArtifact()
    const mutated = JSON.parse(JSON.stringify(PRICING_TIERS)) as typeof PRICING_TIERS
    mutated.starter.monthlyPrice = 1
    expect(renderPlansArtifact(buildPlanRows(mutated))).not.toBe(before)
  })

  it('an added tier changes the artifact', () => {
    const before = buildPlanRows().length
    const mutated = JSON.parse(JSON.stringify(PRICING_TIERS)) as Record<string, unknown>
    mutated.extra = { ...(mutated.starter as object), slug: 'extra', name: 'Extra' }
    expect(buildPlanRows(mutated as typeof PRICING_TIERS).length).toBe(before + 1)
  })
})

describe('artifact shape is safe to upsert', () => {
  const rows: PlanRow[] = buildPlanRows()

  it('carries the upsert key on every row', () => {
    // subscription_plans.slug is UNIQUE — the onConflict target.
    for (const row of rows) {
      expect(typeof row.slug).toBe('string')
      expect(row.slug.length).toBeGreaterThan(0)
    }
  })

  it('has no undefined values, which upsert would silently drop', () => {
    for (const row of rows) {
      for (const [key, value] of Object.entries(row)) {
        expect(value, `${row.slug}.${key}`).not.toBeUndefined()
      }
    }
  })
})
