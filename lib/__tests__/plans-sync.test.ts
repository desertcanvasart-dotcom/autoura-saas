import { describe, it, expect } from 'vitest'
import { PRICING_TIERS } from '@/lib/pricing-config'
import {
  buildPlanRows,
  renderPlansArtifact,
  toDbLimit,
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

  it('passes an explicit null through as unlimited', () => {
    // Unlimited is now null in pricing-config, matching the column directly —
    // no sentinel bridging, so no way for a real cap to be mistaken for one.
    expect(toDbLimit(null)).toBeNull()
  })

  it('REGRESSION: a large but REAL cap survives — 1500 is not unlimited', () => {
    // A ">= 999 means unlimited" rule once turned a real 1500/month cap into
    // NULL, i.e. a paid limit that would never enforce. Explicit nulls removed
    // the whole class of bug; this pins it shut.
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
    mutated.solo.limits.users = 99
    const after = renderPlansArtifact(buildPlanRows(mutated))
    expect(after).not.toBe(before)
  })

  it('a changed price changes the artifact', () => {
    const before = renderPlansArtifact()
    const mutated = JSON.parse(JSON.stringify(PRICING_TIERS)) as typeof PRICING_TIERS
    mutated.solo.monthlyPrice = 1
    expect(renderPlansArtifact(buildPlanRows(mutated))).not.toBe(before)
  })

  it('an added tier changes the artifact', () => {
    const before = buildPlanRows().length
    const mutated = JSON.parse(JSON.stringify(PRICING_TIERS)) as Record<string, unknown>
    mutated.extra = { ...(mutated.solo as object), slug: 'extra', name: 'Extra' }
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

  it('emits ONLY real subscription_plans columns', () => {
    // The upsert sends the row object as-is: one key that is not a column
    // fails the entire write at boot. A `limits` key slipped in during the
    // tier restructure and would have broken the deploy sync.
    const COLUMNS = new Set([
      'name', 'slug', 'description', 'price_monthly', 'price_yearly', 'currency',
      'stripe_price_id_monthly', 'stripe_price_id_yearly', 'stripe_product_id',
      'max_quotes_per_month', 'max_team_members', 'max_whatsapp_messages',
      'max_gmail_accounts', 'max_storage_mb', 'features', 'is_active',
      'max_itinerary_runs_per_month', 'max_pricing_runs_per_month', 'agent_memory_days',
    ])
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        expect(COLUMNS.has(key), `"${key}" is not a subscription_plans column`).toBe(true)
      }
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
