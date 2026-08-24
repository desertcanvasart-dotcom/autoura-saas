import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// POST /api/share/[token]/report — the traveller's "report a problem".
//
// This is a PUBLIC input path: no session, the share token is the only
// credential, and the body is attacker-controllable. The contract under test:
//   * only a well-formed token that resolves to an UNREVOKED share gets in;
//     everything else is a 404 indistinguishable from a dead URL
//   * every identity on the task row (tenant, itinerary, assignee, priority)
//     is derived server-side — a poisoned body cannot override any of it
//   * the per-trip hourly cap closes the task-list-flooding hole the
//     in-memory limiter leaves open across deploys
// ============================================================================

const notifications: unknown[] = []
const pushes: unknown[] = []
const inserted: Record<string, unknown>[] = []

// Scenario knobs, reset per test
let shareRow: Record<string, unknown> | null = null
let itineraryRow: Record<string, unknown> | null = null
let recentReportCount = 0
let memberRows: Array<{ id: string; role: string }> = []

vi.mock('@/lib/supabase-server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'itinerary_shares') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: shareRow }) }) }) }
      }
      if (table === 'itineraries') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: itineraryRow }) }) }) }
      }
      if (table === 'team_members') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ limit: async () => ({ data: memberRows }) }) }),
          }),
        }
      }
      if (table === 'tasks') {
        return {
          // the hourly-cap count query
          select: () => ({
            eq: () => ({ eq: () => ({ like: () => ({ gte: async () => ({ count: recentReportCount }) }) }) }),
          }),
          insert: (row: Record<string, unknown>) => {
            inserted.push(row)
            return { select: () => ({ single: async () => ({ data: { id: 'task-1' }, error: null }) }) }
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }),
}))
vi.mock('@/lib/notifications', () => ({
  createNotification: async (input: unknown) => { notifications.push(input) },
}))
vi.mock('@/lib/push', () => ({
  sendPushToTenant: async (tenantId: string, payload: unknown) => { pushes.push({ tenantId, payload }) },
}))

import { POST } from '@/app/api/share/[token]/report/route'

let ipSeq = 0
function call(body: unknown, token?: string) {
  // distinct token + IP per call unless a test pins them — both rate
  // limiters are module-global and must not couple unrelated tests
  ipSeq++
  const t = token ?? `T${ipSeq}`.padEnd(32, 'x')
  const req = new Request(`https://app.test/api/share/${t}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.0.0.${ipSeq}` },
    body: JSON.stringify(body),
  })
  return POST(req as never, { params: Promise.resolve({ token: t }) })
}

// flush the fire-and-forget notification IIFE
const settle = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  notifications.length = 0
  pushes.length = 0
  inserted.length = 0
  shareRow = { itinerary_id: 'itin-1', tenant_id: 'tenant-1', revoked_at: null }
  itineraryRow = { trip_name: 'Cairo & Nile', assigned_to: 'tm-owner' }
  recentReportCount = 0
  memberRows = [{ id: 'tm-owner-role', role: 'owner' }]
})

describe('token gate', () => {
  it('404s a malformed token without touching the database', async () => {
    const res = await call({ message: 'help' }, '../../etc/passwd')
    expect(res.status).toBe(404)
    expect(inserted).toHaveLength(0)
  })

  it('404s a token with no share row', async () => {
    shareRow = null
    expect((await call({ message: 'help' })).status).toBe(404)
    expect(inserted).toHaveLength(0)
  })

  it('404s a REVOKED share — revocation must kill the whole surface', async () => {
    shareRow = { itinerary_id: 'itin-1', tenant_id: 'tenant-1', revoked_at: '2026-08-01T00:00:00Z' }
    expect((await call({ message: 'help' })).status).toBe(404)
    expect(inserted).toHaveLength(0)
  })
})

describe('input validation', () => {
  it('400s an empty or whitespace-only message', async () => {
    expect((await call({ message: '' })).status).toBe(400)
    expect((await call({ message: '   \n  ' })).status).toBe(400)
    expect((await call({})).status).toBe(400)
    expect(inserted).toHaveLength(0)
  })

  it('caps message length and strips control characters', async () => {
    await call({ message: 'a'.repeat(5000) + '\u0007\u0000' })
    const task = inserted[0] as { description: string }
    expect(task.description).not.toContain('\u0007')
    expect(task.description).not.toContain('\u0000')
    expect(task.description).toContain('a'.repeat(2000))
    expect(task.description).not.toContain('a'.repeat(2001))
  })
})

describe('the task row is derived, never trusted', () => {
  it('creates an urgent task for the share row tenant + itinerary, assigned to the trip owner', async () => {
    const res = await call({ message: 'The driver has not arrived', name: 'Maria' })
    expect(res.status).toBe(200)
    expect(inserted).toHaveLength(1)
    const task = inserted[0]
    expect(task.tenant_id).toBe('tenant-1')
    expect(task.linked_type).toBe('itinerary')
    expect(task.linked_id).toBe('itin-1')
    expect(task.priority).toBe('urgent')
    expect(task.status).toBe('todo')
    expect(task.assigned_to).toBe('tm-owner')
    expect(task.title).toBe('Traveller report — Cairo & Nile')
    expect(task.description).toContain('The driver has not arrived')
    expect(task.description).toContain('Maria')
  })

  it('a poisoned body cannot override tenant, priority, status or assignee', async () => {
    await call({
      message: 'help',
      tenant_id: 'EVIL-TENANT', linked_id: 'EVIL-ITIN', priority: 'low',
      status: 'done', assigned_to: 'EVIL-MEMBER', archived: true,
    })
    const task = inserted[0]
    expect(task.tenant_id).toBe('tenant-1')
    expect(task.linked_id).toBe('itin-1')
    expect(task.priority).toBe('urgent')
    expect(task.status).toBe('todo')
    expect(task.assigned_to).toBe('tm-owner')
    expect(task.archived).toBe(false)
  })
})

describe('alerts', () => {
  it('notifies the trip owner and pushes to the tenant', async () => {
    await call({ message: 'Hotel room not ready' })
    await settle()
    expect(notifications).toHaveLength(1)
    expect((notifications[0] as { team_member_id: string }).team_member_id).toBe('tm-owner')
    expect((notifications[0] as { send_email: boolean }).send_email).toBe(true)
    expect(pushes).toHaveLength(1)
    expect((pushes[0] as { tenantId: string }).tenantId).toBe('tenant-1')
  })

  it('falls back to owners/managers when the trip has no owner', async () => {
    itineraryRow = { trip_name: 'Cairo & Nile', assigned_to: null }
    memberRows = [
      { id: 'tm-a', role: 'owner' }, { id: 'tm-b', role: 'manager' },
      { id: 'tm-c', role: 'staff' },
    ]
    await call({ message: 'help' })
    await settle()
    expect(notifications.map(n => (n as { team_member_id: string }).team_member_id).sort()).toEqual(['tm-a', 'tm-b'])
  })

  it('a tenant with only rank-and-file members still gets the alert', async () => {
    itineraryRow = { trip_name: 'Cairo & Nile', assigned_to: null }
    memberRows = [{ id: 'tm-staff', role: 'staff' }]
    await call({ message: 'help' })
    await settle()
    expect(notifications.map(n => (n as { team_member_id: string }).team_member_id)).toEqual(['tm-staff'])
  })
})

describe('flood control', () => {
  it('429s once the trip has hit the hourly report cap, without inserting', async () => {
    recentReportCount = 10
    const res = await call({ message: 'help' })
    expect(res.status).toBe(429)
    expect(inserted).toHaveLength(0)
  })

  it('429s a single token hammering the endpoint (per-token limiter)', async () => {
    const token = 'B'.repeat(32)
    let last: Response | null = null
    for (let i = 0; i < 6; i++) last = await call({ message: 'spam' }, token)
    expect(last!.status).toBe(429)
  })
})
