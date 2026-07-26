import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkLimit } from '@/lib/billing-middleware'

// ============================================================================
// A billing check must never be the reason a paying operator cannot work.
//
// The rule, locked here: fail OPEN when entitlement cannot be determined, fail
// CLOSED only on a genuine, measured over-limit.
//
// This matters because it already broke production once. `check_usage_limit`
// returned FALSE when a tenant had no `tenant_subscriptions` row — and the
// table was empty — so every tenant was hard-blocked from AI itinerary
// generation with a 402 that read like a quota decision. Migration 235 fixes
// the SQL side; these tests pin the TypeScript wrapper's half of the contract.
// ============================================================================

/**
 * Minimal supabase stub. `rpcResult` drives check_usage_limit; the query
 * builder is chainable and terminates in whatever `rows` says.
 */
function makeSupabase(opts: {
  rpcResult?: { data: unknown; error: unknown }
  rpcThrows?: boolean
  subscription?: { status: string; plan: Record<string, unknown> } | null
  usage?: Record<string, unknown> | null
  memberCount?: number
}) {
  const builder = (terminal: { data?: unknown; count?: number; error?: unknown }) => {
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'in', 'gte', 'order', 'limit']) {
      chain[method] = () => chain
    }
    chain.single = async () => terminal
    // Awaiting the builder directly (head:true count queries).
    chain.then = (resolve: (v: unknown) => unknown) => resolve(terminal)
    return chain
  }

  return {
    rpc: async () => {
      if (opts.rpcThrows) throw new Error('connection reset')
      return opts.rpcResult ?? { data: true, error: null }
    },
    from: (table: string) => {
      if (table === 'tenant_subscriptions') {
        return builder({ data: opts.subscription ?? null, error: null })
      }
      if (table === 'tenant_usage') {
        return builder({ data: opts.usage ?? null, error: null })
      }
      if (table === 'tenant_members') {
        return builder({ data: [], count: opts.memberCount ?? 0, error: null })
      }
      return builder({ data: null, error: null })
    },
  }
}

const TENANT = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('checkLimit — fails open', () => {
  it('allows when the tenant has no subscription row (the 402 outage)', async () => {
    // This is the exact production state: RPC says allowed (post-migration-235),
    // and there is no subscription row to describe a plan.
    const supabase = makeSupabase({
      rpcResult: { data: true, error: null },
      subscription: null,
    })

    const result = await checkLimit(TENANT, 'itinerary_runs', supabase)

    expect(result.allowed).toBe(true)
    expect(result.limit).toBeNull()
    expect(result.plan_name).toBe('No Plan')
    expect(result.upgrade_url).toBeUndefined()
  })

  it('allows when the limit check itself errors', async () => {
    const supabase = makeSupabase({
      rpcResult: { data: null, error: { message: 'function does not exist' } },
    })

    const result = await checkLimit(TENANT, 'itinerary_runs', supabase)

    // Infrastructure failure must not present as a quota decision.
    expect(result.allowed).toBe(true)
    expect(result.subscription_status).toBe('unknown')
  })

  it('allows when the client throws outright', async () => {
    const supabase = makeSupabase({ rpcThrows: true })

    const result = await checkLimit(TENANT, 'itinerary_runs', supabase)
    expect(result.allowed).toBe(true)
  })
})

describe('checkLimit — denies only on a measured over-limit', () => {
  it('denies and surfaces an upgrade path when the RPC says over', async () => {
    const supabase = makeSupabase({
      rpcResult: { data: false, error: null },
      subscription: {
        status: 'active',
        plan: { name: 'Starter', max_itinerary_runs_per_month: 30 },
      },
      usage: { itinerary_runs: 30 },
    })

    const result = await checkLimit(TENANT, 'itinerary_runs', supabase)

    expect(result.allowed).toBe(false)
    expect(result.limit).toBe(30)
    expect(result.current).toBe(30)
    expect(result.plan_name).toBe('Starter')
    // The block must always offer a way forward, never a dead end.
    expect(result.upgrade_url).toBeTruthy()
  })

  it('allows while under the cap, reporting real usage', async () => {
    const supabase = makeSupabase({
      rpcResult: { data: true, error: null },
      subscription: {
        status: 'active',
        plan: { name: 'Starter', max_itinerary_runs_per_month: 30 },
      },
      usage: { itinerary_runs: 12 },
    })

    const result = await checkLimit(TENANT, 'itinerary_runs', supabase)

    expect(result.allowed).toBe(true)
    expect(result.limit).toBe(30)
    expect(result.current).toBe(12)
  })

  it('treats a NULL plan limit as unlimited', async () => {
    const supabase = makeSupabase({
      rpcResult: { data: true, error: null },
      subscription: {
        status: 'active',
        plan: { name: 'Enterprise', max_itinerary_runs_per_month: null },
      },
      usage: { itinerary_runs: 9999 },
    })

    const result = await checkLimit(TENANT, 'itinerary_runs', supabase)

    expect(result.allowed).toBe(true)
    expect(result.limit).toBeNull()
  })

  it('counts seats live rather than from a usage meter', async () => {
    const supabase = makeSupabase({
      rpcResult: { data: true, error: null },
      subscription: { status: 'active', plan: { name: 'Starter', max_team_members: 3 } },
      memberCount: 2,
    })

    const result = await checkLimit(TENANT, 'team_members', supabase)

    expect(result.limit).toBe(3)
    expect(result.current).toBe(2)
  })
})
