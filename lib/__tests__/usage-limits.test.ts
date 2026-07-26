import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  resolveTenantPlan,
  countStructural,
  checkStructuralLimit,
  recordFailOpen,
} from '@/lib/usage-limits'

// ============================================================================
// Structural limits are counted live, not metered.
//
// The rule these pin, inherited from the 402 outage: fail OPEN when
// entitlement cannot be determined, fail CLOSED only on a measured
// over-limit — and RECORD every fail-open, because fail-open that nobody
// counts is indistinguishable from no enforcement, which is exactly what hid
// that outage for weeks.
// ============================================================================

const TENANT = '11111111-1111-1111-1111-111111111111'

/** Chainable stub whose terminal value is supplied per table. */
function makeSupabase(opts: {
  subscription?: { status: string; plan: { slug: string; name: string } | null } | null
  subscriptionError?: unknown
  counts?: Partial<Record<string, number>>
  countError?: string[]
  throwOn?: string[]
  onInsert?: (table: string, row: Record<string, unknown>) => void
  insertResult?: { error?: unknown } | Promise<{ error?: unknown }>
}) {
  return {
    from(table: string) {
      if (opts.throwOn?.includes(table)) throw new Error(`boom: ${table}`)

      const terminal =
        table === 'tenant_subscriptions'
          ? { data: opts.subscription ?? null, error: opts.subscriptionError ?? null }
          : {
              count: opts.counts?.[table] ?? 0,
              error: opts.countError?.includes(table) ? { message: 'query failed' } : null,
            }

      const chain: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'in', 'limit', 'order']) {
        chain[method] = () => chain
      }
      chain.maybeSingle = async () => terminal
      chain.single = async () => terminal
      chain.then = (resolve: (v: unknown) => unknown) => resolve(terminal)
      chain.insert = (row: Record<string, unknown>) => {
        opts.onInsert?.(table, row)
        return opts.insertResult ?? { then: (r: (v: unknown) => unknown) => r({ error: null }) }
      }
      return chain
    },
  }
}

const studioSub = { status: 'active', plan: { slug: 'studio', name: 'Studio' } }
const soloSub = { status: 'active', plan: { slug: 'solo', name: 'Solo' } }
const enterpriseSub = { status: 'active', plan: { slug: 'enterprise', name: 'Enterprise' } }

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

describe('resolveTenantPlan', () => {
  it('resolves the plan through the subscription join', async () => {
    const { plan } = await resolveTenantPlan(makeSupabase({ subscription: studioSub }), TENANT)
    expect(plan?.slug).toBe('studio')
    expect(plan?.limits.users).toBe(12)
  })

  it('returns no_subscription when there is no active row', async () => {
    const { plan, reason } = await resolveTenantPlan(makeSupabase({ subscription: null }), TENANT)
    expect(plan).toBeNull()
    expect(reason).toBe('no_subscription')
  })

  it('returns unknown_plan for a slug that is not in the catalogue', async () => {
    // e.g. a tenant still on a retired slug like "professional".
    const sub = { status: 'active', plan: { slug: 'professional', name: 'Professional' } }
    const { plan, reason } = await resolveTenantPlan(makeSupabase({ subscription: sub }), TENANT)
    expect(plan).toBeNull()
    expect(reason).toBe('unknown_plan')
  })

  it('returns query_error rather than throwing', async () => {
    const supabase = makeSupabase({ subscriptionError: { message: 'nope' } })
    const { plan, reason } = await resolveTenantPlan(supabase, TENANT)
    expect(plan).toBeNull()
    expect(reason).toBe('query_error')
  })

  it('returns client_error when the client throws', async () => {
    const supabase = makeSupabase({ throwOn: ['tenant_subscriptions'] })
    const { reason } = await resolveTenantPlan(supabase, TENANT)
    expect(reason).toBe('client_error')
  })
})

describe('countStructural — live counts, not meters', () => {
  it('counts seats from tenant_members', async () => {
    const supabase = makeSupabase({ counts: { tenant_members: 7 } })
    expect((await countStructural(supabase, TENANT, 'seats')).count).toBe(7)
  })

  it('counts B2B partners', async () => {
    const supabase = makeSupabase({ counts: { b2b_partners: 4 } })
    expect((await countStructural(supabase, TENANT, 'b2b_partners')).count).toBe(4)
  })

  it('reports an error instead of guessing zero', async () => {
    // Returning 0 on failure would read as "no usage" and silently allow.
    const supabase = makeSupabase({ countError: ['tenant_members'] })
    const { count, reason } = await countStructural(supabase, TENANT, 'seats')
    expect(count).toBeNull()
    expect(reason).toBe('query_error')
  })
})

describe('checkStructuralLimit — denies only on a measured over-limit', () => {
  it('allows below the limit', async () => {
    const supabase = makeSupabase({ subscription: studioSub, counts: { tenant_members: 11 } })
    const d = await checkStructuralLimit(supabase, TENANT, 'seats')
    expect(d.allowed).toBe(true)
    expect(d.current).toBe(11)
    expect(d.limit).toBe(12)
  })

  it('AT the limit blocks the NEXT one — 12 of 12 seats is full', async () => {
    const supabase = makeSupabase({ subscription: studioSub, counts: { tenant_members: 12 } })
    const d = await checkStructuralLimit(supabase, TENANT, 'seats')
    expect(d.allowed).toBe(false)
    expect(d.upgradeUrl).toBeTruthy()
  })

  it('OVER the limit still blocks, and never destroys anything', async () => {
    // Downgrade-while-over-limit: Studio(12) -> Solo(3) with 12 seats in place.
    // Creation is blocked; the decision says nothing about removing members.
    const supabase = makeSupabase({ subscription: soloSub, counts: { tenant_members: 12 } })
    const d = await checkStructuralLimit(supabase, TENANT, 'seats')
    expect(d.allowed).toBe(false)
    expect(d.current).toBe(12)
    expect(d.limit).toBe(3)
    expect(d.upgradeUrl).toBeTruthy()
  })

  it('treats a null tier limit as unlimited without even counting', async () => {
    const supabase = makeSupabase({ subscription: enterpriseSub, counts: { tenant_members: 9999 } })
    const d = await checkStructuralLimit(supabase, TENANT, 'seats')
    expect(d.allowed).toBe(true)
    expect(d.limit).toBeNull()
  })

  it('Agency has unlimited B2B partners', async () => {
    const agency = { status: 'active', plan: { slug: 'agency', name: 'Agency' } }
    const supabase = makeSupabase({ subscription: agency, counts: { b2b_partners: 500 } })
    const d = await checkStructuralLimit(supabase, TENANT, 'b2b_partners')
    expect(d.allowed).toBe(true)
    expect(d.limit).toBeNull()
  })

  it('enforces the Solo partner cap of 3', async () => {
    const supabase = makeSupabase({ subscription: soloSub, counts: { b2b_partners: 3 } })
    expect((await checkStructuralLimit(supabase, TENANT, 'b2b_partners')).allowed).toBe(false)
  })
})

describe('checkStructuralLimit — fails open, and says so', () => {
  it('allows when there is no subscription, flagging the reason', async () => {
    const supabase = makeSupabase({ subscription: null, counts: { tenant_members: 9999 } })
    const d = await checkStructuralLimit(supabase, TENANT, 'seats')
    expect(d.allowed).toBe(true)
    expect(d.failOpenReason).toBe('no_subscription')
  })

  it('allows on a retired/unknown plan slug', async () => {
    const sub = { status: 'active', plan: { slug: 'starter', name: 'Starter' } }
    const d = await checkStructuralLimit(makeSupabase({ subscription: sub }), TENANT, 'seats')
    expect(d.allowed).toBe(true)
    expect(d.failOpenReason).toBe('unknown_plan')
  })

  it('allows when the COUNT fails, even though the plan resolved', async () => {
    const supabase = makeSupabase({ subscription: studioSub, countError: ['tenant_members'] })
    const d = await checkStructuralLimit(supabase, TENANT, 'seats')
    expect(d.allowed).toBe(true)
    expect(d.failOpenReason).toBe('query_error')
    expect(d.limit).toBe(12) // the limit is still reported, only the count is unknown
  })

  it('never reports a failOpenReason on a genuine denial', async () => {
    const supabase = makeSupabase({ subscription: soloSub, counts: { tenant_members: 3 } })
    const d = await checkStructuralLimit(supabase, TENANT, 'seats')
    expect(d.allowed).toBe(false)
    expect(d.failOpenReason).toBeUndefined()
  })
})

describe('recordFailOpen', () => {
  it('writes the event with tenant, metric and reason', async () => {
    const rows: Array<Record<string, unknown>> = []
    const supabase = makeSupabase({ onInsert: (table, row) => { if (table === 'fail_open_events') rows.push(row) } })

    recordFailOpen(supabase, { tenantId: TENANT, metric: 'seats', reason: 'no_subscription', detail: 'x' })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      tenant_id: TENANT, metric: 'seats', reason: 'no_subscription', detail: 'x',
    })
  })

  it('accepts a null tenant — sometimes we cannot resolve one', async () => {
    const rows: Array<Record<string, unknown>> = []
    const supabase = makeSupabase({ onInsert: (_t, row) => rows.push(row) })
    recordFailOpen(supabase, { tenantId: null, metric: 'seats', reason: 'client_error' })
    expect(rows[0].tenant_id).toBeNull()
    expect(rows[0].detail).toBeNull()
  })

  it('NEVER throws — losing telemetry must not fail the user action', () => {
    const throwing = makeSupabase({ throwOn: ['fail_open_events'] })
    expect(() =>
      recordFailOpen(throwing, { tenantId: TENANT, metric: 'seats', reason: 'query_error' })
    ).not.toThrow()
  })

  it('swallows a rejected insert without an unhandled rejection', async () => {
    const supabase = makeSupabase({ insertResult: Promise.reject(new Error('db down')) })
    expect(() =>
      recordFailOpen(supabase, { tenantId: TENANT, metric: 'seats', reason: 'query_error' })
    ).not.toThrow()
    await new Promise(r => setTimeout(r, 0))
  })
})

describe('the five live tenants, against their assigned plans', () => {
  it('all sit well inside their seat limits at 1 member each', async () => {
    for (const [slug, limit] of [['solo', 3], ['studio', 12]] as const) {
      const sub = { status: 'active', plan: { slug, name: slug } }
      const supabase = makeSupabase({ subscription: sub, counts: { tenant_members: 1 } })
      const d = await checkStructuralLimit(supabase, TENANT, 'seats')
      expect(d.allowed, slug).toBe(true)
      expect(d.limit, slug).toBe(limit)
    }
  })
})
