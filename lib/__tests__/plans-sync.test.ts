import { describe, it, expect } from 'vitest'
import { PRICING_TIERS } from '@/lib/pricing-config'
import {
  buildPlanRows,
  renderPlansArtifact,
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

  it('marks every generated plan active', () => {
    for (const row of rows) expect(row.is_active).toBe(true)
  })
})

describe('drift detection actually detects drift', () => {
  it('a changed LIMIT does NOT change the artifact — limits are not mirrored', () => {
    // This inverted at migration 241. Limits used to be copied into
    // subscription_plans, so editing one had to regenerate the artifact.
    // They are no longer mirrored anywhere: lib/usage-limits.ts reads
    // PRICING_TIERS directly, so there is no second copy to keep in step.
    // If this ever starts failing, a limit has crept back into the catalogue
    // and there are two numbers again.
    const before = renderPlansArtifact()
    const mutated = JSON.parse(JSON.stringify(PRICING_TIERS)) as typeof PRICING_TIERS
    mutated.solo.limits.users = 99
    expect(renderPlansArtifact(buildPlanRows(mutated))).toBe(before)
  })

  it('a changed publiclyPriced flag changes the artifact', () => {
    const before = renderPlansArtifact()
    const mutated = JSON.parse(JSON.stringify(PRICING_TIERS)) as typeof PRICING_TIERS
    mutated.solo.publiclyPriced = !mutated.solo.publiclyPriced
    expect(renderPlansArtifact(buildPlanRows(mutated))).not.toBe(before)
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
    // Migration 241 dropped every limit column, so this set is now identity
    // and price only (features carries just publiclyPriced).
    const COLUMNS = new Set([
      'name', 'slug', 'description', 'price_monthly', 'price_yearly', 'currency',
      'stripe_price_id_monthly', 'stripe_price_id_yearly', 'stripe_product_id',
      'features', 'is_active',
    ])
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        expect(COLUMNS.has(key), `"${key}" is not a subscription_plans column`).toBe(true)
      }
    }
  })

  it('a null price only ever appears on a contact-sales tier', () => {
    // The upsert once failed on every boot because Enterprise had a null
    // price against a NOT NULL column (migration 236). A null must always be
    // deliberate — "no published price" — never an accidentally missing
    // number on a tier we actually sell self-serve.
    for (const row of rows) {
      if (row.price_monthly === null || row.price_yearly === null) {
        expect(row.features.publiclyPriced, `${row.slug} has a null price but is publicly priced`).toBe(false)
      }
    }
  })

  it('never emits a zero price — that would read as a free tier', () => {
    for (const row of rows) {
      expect(row.price_monthly, row.slug).not.toBe(0)
      expect(row.price_yearly, row.slug).not.toBe(0)
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
