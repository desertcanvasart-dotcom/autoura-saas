import { vi, describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'

// ============================================
// Once the office locks a portal link's details, the portal takes no new
// change requests or extras (operator decision, 2026-10-11). An offer the
// office already priced can still be answered.
// ============================================

let locked = false
const writes: string[] = []
const pushes: unknown[] = []

function db() {
  const chain: Record<string, unknown> = {}
  let table = ''
  const self = () => chain
  Object.assign(chain, {
    from: (t: string) => { table = t; return chain },
    select: self, eq: self, in: self, order: self,
    maybeSingle: async () => table === 'booking_portal_links'
      ? { data: { tenant_id: 't1', booking_id: 'b1', passenger_id: null, form_locked: locked } }
      : { data: null },
    insert: async () => { writes.push(`insert:${table}`); return { error: null } },
    update: () => { writes.push(`update:${table}`); return chain },
  })
  return chain
}

vi.mock('@/lib/supabase-server', () => ({ createAdminClient: () => db() }))
vi.mock('@/lib/booking-extras-db', () => ({ extrasAdmin: () => db() }))
vi.mock('@/lib/push', () => ({ sendPushToTenant: (...a: unknown[]) => { pushes.push(a) } }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ success: true }), getClientIdentifier: () => 'ip' }))
vi.mock('@/lib/booking-portal', () => ({
  isValidPortalToken: () => true,
  isPortalVerified: () => true,
  portalLinkState: () => ({ usable: true }),
  portalVerifyCookieName: () => 'pv',
}))

import { POST as changeRequest } from '@/app/api/portal/[token]/change-request/route'
import { GET as listExtras, POST as requestExtra } from '@/app/api/portal/[token]/extras/route'

const params = { params: Promise.resolve({ token: 'tok' }) }
const post = (body: unknown) => new NextRequest('http://x', { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => { locked = false; writes.length = 0; pushes.length = 0 })

describe('a locked portal link', () => {
  it('refuses a change request, and the office is not notified', async () => {
    locked = true
    const res = await changeRequest(post({ count: 2 }), params)
    expect(res.status).toBe(409)
    expect(writes).toEqual([])
    expect(pushes).toEqual([])
  })

  it('refuses a new extra, and the page offers no form', async () => {
    locked = true
    expect((await requestExtra(post({ title: 'Balloon ride' }), params)).status).toBe(409)
    expect(writes).toEqual([])
    const list = await (await listExtras(new NextRequest('http://x'), params)).json()
    expect(list.canRequest).toBe(false)
  })

  it('an unlocked link still takes both', async () => {
    expect((await changeRequest(post({ count: 2 }), params)).status).toBe(200)
    expect((await requestExtra(post({ title: 'Balloon ride' }), params)).status).toBe(200)
    expect(writes).toEqual(['insert:booking_change_requests', 'insert:booking_extras'])
    const list = await (await listExtras(new NextRequest('http://x'), params)).json()
    expect(list.canRequest).toBe(true)
  })

  it('the page hides the change-request form once locked', () => {
    const page = readFileSync(path.join(process.cwd(), 'app/portal/[token]/PortalContent.tsx'), 'utf8')
    expect(page).toContain("{scope === 'booking' && !formLocked && <ChangeRequestForm token={token} />}")
  })
})
