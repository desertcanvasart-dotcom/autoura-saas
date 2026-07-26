import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  gateStructural,
  gateVolume,
  toUsageNotice,
  blockedResponse,
  incrementVolumeUsage,
  loadUsageAnchor,
} from '@/lib/usage-enforcement'
import { classifyUsage } from '@/lib/usage-grace'
import { computeUsageWindow, windowKeys } from '@/lib/usage-window'

// ============================================================================
// The layer that actually blocks a user.
//
// Two properties matter most and are pinned hardest:
//   1. A blocked create returns 402 and NEVER implies data loss.
//   2. Anything we cannot determine fails OPEN and is RECORDED — the failure
//      mode that hid the 402 outage was enforcement that silently wasn't.
// ============================================================================

const TENANT = '11111111-1111-1111-1111-111111111111'
const PERIOD = '2026-07-21T00:00:00Z'

function makeSupabase(opts: {
  subscription?: Record<string, unknown> | null
  usageRow?: Record<string, unknown> | null
  countError?: string[]
  counts?: Record<string, number>
  tenantCreatedAt?: string
  onInsert?: (table: string, row: Record<string, unknown>) => void
  onRpc?: (fn: string, args: Record<string, unknown>) => void
} = {}) {
  return {
    rpc(fn: string, args: Record<string, unknown>) {
      opts.onRpc?.(fn, args)
      return { then: (r: (v: unknown) => unknown) => r({ error: null }) }
    },
    from(table: string) {
      const terminal =
        table === 'tenant_subscriptions'
          ? { data: opts.subscription ?? null, error: null }
          : table === 'tenants'
          ? { data: opts.tenantCreatedAt ? { created_at: opts.tenantCreatedAt } : null, error: null }
          : table === 'tenant_usage'
          ? {
              data: opts.usageRow ?? null,
              error: opts.countError?.includes('tenant_usage') ? { message: 'boom' } : null,
            }
          : {
              count: opts.counts?.[table] ?? 0,
              error: opts.countError?.includes(table) ? { message: 'boom' } : null,
            }

      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'limit', 'order']) chain[m] = () => chain
      chain.maybeSingle = async () => terminal
      chain.single = async () => terminal
      chain.then = (r: (v: unknown) => unknown) => r(terminal)
      chain.insert = (row: Record<string, unknown>) => {
        opts.onInsert?.(table, row)
        return { then: (r: (v: unknown) => unknown) => r({ error: null }) }
      }
      return chain
    },
  }
}

const sub = (slug: string) => ({
  status: 'active',
  current_period_start: PERIOD,
  plan: { slug, name: slug },
})

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

describe('gateStructural', () => {
  it('lets a create through below the limit, with no banner', async () => {
    const supabase = makeSupabase({ subscription: sub('studio'), counts: { tenant_members: 3 } })
    const gate = await gateStructural(supabase, TENANT, 'seats', 'team members')
    expect(gate.ok).toBe(true)
    expect(gate.usage).toBeNull()
  })

  it('blocks at the limit with a 402 carrying a usage block', async () => {
    const supabase = makeSupabase({ subscription: sub('solo'), counts: { tenant_members: 3 } })
    const gate = await gateStructural(supabase, TENANT, 'seats', 'team members')

    expect(gate.ok).toBe(false)
    expect(gate.response!.status).toBe(402)

    const body = await gate.response!.json()
    expect(body.success).toBe(false)
    expect(body.limit_reached).toBe(true)
    expect(body.usage.band).toBe('blocked')
    expect(body.usage.current).toBe(3)
    expect(body.usage.limit).toBe(3)
    expect(body.usage.upgradeUrl).toBeTruthy()
  })

  it('a block NEVER implies existing data is at risk', async () => {
    const supabase = makeSupabase({ subscription: sub('solo'), counts: { b2b_partners: 9 } })
    const gate = await gateStructural(supabase, TENANT, 'b2b_partners', 'B2B partners')
    const body = await gate.response!.json()
    expect(body.usage.message).toMatch(/stay available/i)
    expect(body.usage.message).not.toMatch(/delete|remove|lost/i)
  })

  it('FAILS OPEN and records why when entitlement is unknown', async () => {
    const events: Array<Record<string, unknown>> = []
    const supabase = makeSupabase({
      subscription: null,
      counts: { tenant_members: 9999 },
      onInsert: (t, row) => { if (t === 'fail_open_events') events.push(row) },
    })

    const gate = await gateStructural(supabase, TENANT, 'seats', 'team members')

    expect(gate.ok).toBe(true)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ tenant_id: TENANT, metric: 'seats', reason: 'no_subscription' })
  })

  it('records a fail-open when the COUNT fails, not just the plan lookup', async () => {
    const events: Array<Record<string, unknown>> = []
    const supabase = makeSupabase({
      subscription: sub('studio'),
      countError: ['tenant_members'],
      onInsert: (t, row) => { if (t === 'fail_open_events') events.push(row) },
    })
    const gate = await gateStructural(supabase, TENANT, 'seats', 'team members')
    expect(gate.ok).toBe(true)
    expect(events[0]).toMatchObject({ reason: 'query_error' })
  })
})

describe('gateVolume', () => {
  it('passes silently below 80%', async () => {
    const supabase = makeSupabase({ subscription: sub('solo'), usageRow: { itinerary_runs: 5 } })
    const gate = await gateVolume(supabase, TENANT, 'ai_generations', 'AI generations this month')
    expect(gate.ok).toBe(true)
    expect(gate.usage).toBeNull()
  })

  it('passes WITH a warning banner at 80%', async () => {
    const supabase = makeSupabase({ subscription: sub('solo'), usageRow: { itinerary_runs: 40 } })
    const gate = await gateVolume(supabase, TENANT, 'ai_generations', 'AI generations this month')
    expect(gate.ok).toBe(true)
    expect(gate.usage?.band).toBe('warning')
    expect(gate.usage?.message).toBeTruthy()
  })

  it('ALLOWS overage past 100%, with an upgrade path but no failure', async () => {
    const supabase = makeSupabase({ subscription: sub('solo'), usageRow: { itinerary_runs: 55 } })
    const gate = await gateVolume(supabase, TENANT, 'ai_generations', 'AI generations this month')
    expect(gate.ok).toBe(true)
    expect(gate.usage?.band).toBe('overage')
    expect(gate.usage?.upgradeUrl).toBeTruthy()
    expect(gate.usage?.message).not.toMatch(/error|failed/i)
  })

  it('blocks at 125% with a 402', async () => {
    const supabase = makeSupabase({ subscription: sub('solo'), usageRow: { itinerary_runs: 63 } })
    const gate = await gateVolume(supabase, TENANT, 'ai_generations', 'AI generations this month')
    expect(gate.ok).toBe(false)
    expect(gate.response!.status).toBe(402)
    const body = await gate.response!.json()
    expect(body.usage.band).toBe('blocked')
  })

  it('fails open and records when the meter cannot be read', async () => {
    const events: Array<Record<string, unknown>> = []
    const supabase = makeSupabase({
      subscription: sub('solo'),
      countError: ['tenant_usage'],
      onInsert: (t, row) => { if (t === 'fail_open_events') events.push(row) },
    })
    const gate = await gateVolume(supabase, TENANT, 'ai_generations', 'AI generations this month')
    expect(gate.ok).toBe(true)
    expect(events[0]).toMatchObject({ metric: 'ai_generations', reason: 'query_error' })
  })
})

describe('incrementVolumeUsage — writer and reader must agree on the window', () => {
  it('passes the COMPUTED window, not the subscription period', async () => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
    const supabase = makeSupabase({ onRpc: (fn, args) => calls.push({ fn, args }) })

    incrementVolumeUsage(supabase, TENANT, 'ai_generations', PERIOD)

    expect(calls).toHaveLength(1)
    expect(calls[0].fn).toBe('increment_usage')

    const expected = windowKeys(computeUsageWindow(PERIOD, 'monthly'))
    expect(calls[0].args).toMatchObject({
      p_tenant_id: TENANT,
      p_metric: 'itinerary_runs',
      p_amount: 1,
      p_period_start: expected.period_start,
      p_period_end: expected.period_end,
    })
  })

  it('uses the ANNUAL window and the itineraries metric name', async () => {
    const calls: Array<{ args: Record<string, unknown> }> = []
    const supabase = makeSupabase({ onRpc: (_fn, args) => calls.push({ args }) })

    incrementVolumeUsage(supabase, TENANT, 'itineraries', PERIOD)

    const expected = windowKeys(computeUsageWindow(PERIOD, 'annual'))
    expect(calls[0].args.p_metric).toBe('itineraries')
    expect(calls[0].args.p_period_start).toBe(expected.period_start)
  })

  it('writes to the same key the reader will look under', async () => {
    // If these diverge, usage appears to reset every period and no limit is
    // ever reached — the bug migration 238 exists to prevent.
    const calls: Array<{ args: Record<string, unknown> }> = []
    const supabase = makeSupabase({ onRpc: (_fn, args) => calls.push({ args }) })
    incrementVolumeUsage(supabase, TENANT, 'itineraries', PERIOD)

    const readerWindow = computeUsageWindow(PERIOD, 'annual')
    expect(calls[0].args.p_period_start).toBe(windowKeys(readerWindow).period_start)
  })

  it('does nothing without an anchor rather than guessing a window', async () => {
    const calls: unknown[] = []
    const supabase = makeSupabase({ onRpc: () => calls.push(1) })
    incrementVolumeUsage(supabase, TENANT, 'itineraries', null)
    expect(calls).toHaveLength(0)
  })

  it('NEVER throws — a lost increment must not fail a create that succeeded', () => {
    const throwing = { rpc: () => { throw new Error('db down') } }
    expect(() => incrementVolumeUsage(throwing, TENANT, 'itineraries', PERIOD)).not.toThrow()
  })
})

describe('loadUsageAnchor', () => {
  it('prefers the subscription period start', async () => {
    const supabase = makeSupabase({ subscription: { current_period_start: PERIOD } })
    const anchor = await loadUsageAnchor(supabase, TENANT)
    expect(anchor?.toISOString()).toBe('2026-07-21T00:00:00.000Z')
  })

  it('falls back to tenant creation so pre-billing tenants still roll over', async () => {
    const supabase = makeSupabase({ subscription: null, tenantCreatedAt: '2026-07-15T00:00:00Z' })
    const anchor = await loadUsageAnchor(supabase, TENANT)
    expect(anchor?.toISOString()).toBe('2026-07-15T00:00:00.000Z')
  })

  it('returns null when nothing is known', async () => {
    expect(await loadUsageAnchor(makeSupabase({ subscription: null }), TENANT)).toBeNull()
  })
})

describe('toUsageNotice', () => {
  it('says nothing while comfortably inside the plan', () => {
    const decision = {
      ...classifyUsage(5, 100), metric: 'itineraries' as const, current: 5, limit: 100,
      planSlug: 'studio', window: null, label: 'x',
    }
    expect(toUsageNotice(decision, 'itineraries this year')).toBeNull()
  })

  it('reports a structural block only when it blocks', () => {
    const allowed = { allowed: true, metric: 'seats' as const, current: 1, limit: 3, planSlug: 'solo' }
    expect(toUsageNotice(allowed, 'team members')).toBeNull()
  })
})

describe('blockedResponse', () => {
  it('is a 402 with a machine-readable usage block', async () => {
    const decision = { allowed: false, metric: 'seats' as const, current: 3, limit: 3, planSlug: 'solo', upgradeUrl: '/x' }
    const res = blockedResponse(decision, 'team members')
    expect(res.status).toBe(402)
    const body = await res.json()
    expect(body.usage).toMatchObject({ band: 'blocked', current: 3, limit: 3 })
  })
})
