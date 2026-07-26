import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// The usage API and the pages that read it drifted apart and nothing caught it.
//
// The route returned `{ usage: { quotes, team_members, ... } }`. Both
// /settings/billing and /settings/billing/usage read
// `usage.metrics.quotes_created` — an object that was never in the payload —
// so the pages threw on render the moment a tenant had an active subscription.
// It looked fine for as long as every tenant 404'd on "no active subscription".
//
// These tests pin the contract from the consumer's side: the exact keys the
// pages destructure, and the invariants they rely on.
// ============================================================================

const mockAuth = vi.fn()
const mockResolvePlan = vi.fn()
const mockStructural = vi.fn()
const mockVolume = vi.fn()

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: () => mockAuth(),
}))

vi.mock('@/lib/usage-limits', () => ({
  resolveTenantPlan: (...a: unknown[]) => mockResolvePlan(...a),
  checkStructuralLimit: (...a: unknown[]) => mockStructural(...a),
  checkVolumeLimit: (...a: unknown[]) => mockVolume(...a),
}))

const { GET } = await import('../usage/route')

const WINDOW = { kind: 'monthly', start: new Date('2026-07-01'), end: new Date('2026-08-01') }

function ok(current: number, limit: number | null, extra: Record<string, unknown> = {}) {
  return { current, limit, planSlug: 'studio', ...extra }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ supabase: {}, tenant_id: 'tenant-1' })
  mockResolvePlan.mockResolvedValue({ plan: { slug: 'studio', name: 'Studio' } })
  mockStructural.mockResolvedValue(ok(2, 12))
  mockVolume.mockResolvedValue(ok(10, 300, { window: WINDOW }))
})

async function body() {
  return (await GET()).json()
}

describe('GET /api/billing/usage — the shape both pages destructure', () => {
  it('returns the four real metrics, and only those', async () => {
    const data = await body()
    expect(data.success).toBe(true)
    expect(data.metrics.map((m: { key: string }) => m.key)).toEqual([
      'seats',
      'b2b_partners',
      'ai_generations',
      'itineraries',
    ])
  })

  it('gives every metric the exact keys the pages read', async () => {
    const data = await body()
    for (const m of data.metrics) {
      expect(Object.keys(m).sort()).toEqual(
        ['band', 'key', 'label', 'limit', 'message', 'percentage', 'undetermined', 'used', 'window'].sort()
      )
    }
  })

  it('carries plan identity and an upgrade destination at the top level', async () => {
    const data = await body()
    expect(data.plan).toEqual({ slug: 'studio', name: 'Studio' })
    expect(data.upgrade_url).toBe('/settings/billing/plans')
    expect(Array.isArray(data.warnings)).toBe(true)
    expect(typeof data.needs_upgrade).toBe('boolean')
  })

  it('reports unlimited as a null limit and a null percentage — never -1', async () => {
    // The pages previously tested `limit !== -1`. Nothing ever emitted -1, so
    // an unlimited plan rendered a progress bar against NaN.
    mockStructural.mockResolvedValue(ok(4, null))
    mockVolume.mockResolvedValue(ok(4, null, { window: WINDOW }))
    const data = await body()
    for (const m of data.metrics) {
      expect(m.limit).toBeNull()
      expect(m.percentage).toBeNull()
      expect(m.band).toBe('ok')
    }
  })
})

describe('bands match what the gates enforce', () => {
  it('flags warning at 80% and overage past 100%', async () => {
    mockStructural.mockResolvedValue(ok(10, 12)) // 83%
    mockVolume.mockResolvedValue(ok(330, 300, { window: WINDOW })) // 110%
    const data = await body()
    const byKey = Object.fromEntries(data.metrics.map((m: { key: string }) => [m.key, m]))
    expect(byKey.seats.band).toBe('warning')
    expect(byKey.ai_generations.band).toBe('overage')
    expect(data.needs_upgrade).toBe(true)
    expect(data.warnings.length).toBeGreaterThan(0)
  })

  it('stays quiet when everything is comfortably inside plan', async () => {
    const data = await body()
    expect(data.warnings).toEqual([])
    expect(data.needs_upgrade).toBe(false)
  })
})

describe('an undetermined check never presents as a quota decision', () => {
  it('marks the metric undetermined and raises no warning', async () => {
    // Failing open means we allowed the work WITHOUT verifying entitlement.
    // Reporting that as "approaching your limit" would be inventing a number.
    mockStructural.mockResolvedValue(ok(0, null, { failOpenReason: 'no_subscription' }))
    mockVolume.mockResolvedValue(ok(0, null, { failOpenReason: 'query_error', window: null }))
    const data = await body()
    for (const m of data.metrics) expect(m.undetermined).toBe(true)
    expect(data.warnings).toEqual([])
    expect(data.needs_upgrade).toBe(false)
  })
})

describe('windows', () => {
  it('exposes a window for metered limits and none for live counts', async () => {
    const data = await body()
    const byKey = Object.fromEntries(data.metrics.map((m: { key: string }) => [m.key, m]))
    // Seats and partners are counted live — there is no window to show.
    expect(byKey.seats.window).toBeNull()
    expect(byKey.b2b_partners.window).toBeNull()
    expect(byKey.ai_generations.window).toEqual({
      start: WINDOW.start.toISOString(),
      end: WINDOW.end.toISOString(),
    })
  })
})

describe('auth and failure', () => {
  it('propagates the auth failure rather than returning empty usage', async () => {
    mockAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 })
    const res = await GET()
    expect(res.status).toBe(401)
    expect((await res.json()).success).toBe(false)
  })

  it('500s instead of pretending zero when a check throws', async () => {
    mockVolume.mockRejectedValue(new Error('boom'))
    const res = await GET()
    expect(res.status).toBe(500)
    expect((await res.json()).success).toBe(false)
  })
})
