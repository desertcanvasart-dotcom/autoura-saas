import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================
// A claimed sending domain can be released
// ============================================
// There was no DELETE: once claimed, a domain was held for good (the unique
// index holds it even while pending), so a mistyped domain could not be
// replaced and a domain claimed by the wrong company blocked its real owner.

let role = 'owner'
let tenantRow: Record<string, unknown> = { resend_domain_id: 'rd_1', email_domain: 'sawatours.org' }
let removeError: { name?: string; message: string } | null = null
const removed: string[] = []
const updates: Array<Record<string, unknown>> = []
const created: string[] = []

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, tenant_id: 'ten1', role, supabase: {} }),
  createAdminClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.update = (patch: Record<string, unknown>) => { updates.push(patch); return q }
      q.eq = () => q
      q.single = async () => ({ data: tenantRow, error: null })
      q.then = (res: (v: unknown) => unknown) => res({ error: null })
      return q
    },
  }),
}))
vi.mock('resend', () => ({
  Resend: class {
    domains = {
      remove: async (id: string) => { removed.push(id); return { error: removeError } },
      create: async ({ name }: { name: string }) => { created.push(name); return { data: { id: 'rd_2', records: [] }, error: null } },
    }
  },
}))

import { DELETE, POST } from '@/app/api/settings/email-domain/route'

beforeEach(() => {
  role = 'owner'
  tenantRow = { resend_domain_id: 'rd_1', email_domain: 'sawatours.org' }
  removeError = null
  removed.length = 0
  updates.length = 0
  created.length = 0
  process.env.RESEND_API_KEY = 'k'
})

describe('DELETE /api/settings/email-domain', () => {
  it('removes the domain from Resend and clears it here', async () => {
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(removed).toEqual(['rd_1'])
    expect(updates[0]).toMatchObject({ email_domain: null, resend_domain_id: null, email_domain_status: 'not_configured' })
  })

  it('still releases a domain Resend has already forgotten', async () => {
    removeError = { name: 'not_found', message: 'Domain not found' }
    expect((await DELETE()).status).toBe(200)
    expect(updates).toHaveLength(1)
  })

  it('keeps the domain when Resend refuses for another reason', async () => {
    removeError = { name: 'application_error', message: 'Internal error' }
    expect((await DELETE()).status).toBe(502)
    expect(updates).toHaveLength(0)
  })

  it('is for owners and admins only', async () => {
    role = 'member'
    expect((await DELETE()).status).toBe(403)
    expect(removed).toEqual([])
  })
})

describe('POST /api/settings/email-domain', () => {
  const post = (body: unknown) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never)

  it('refuses a sender name that cannot be an address, instead of saving it', async () => {
    const res = await post({ domain: 'sawatours.org', from_local: 'Bookings Team' })
    expect(res.status).toBe(400)
    expect(created).toEqual([])
  })

  it('accepts a valid one', async () => {
    const res = await post({ domain: 'sawatours.org', from_local: 'bookings' })
    expect(res.status).toBe(200)
    expect(updates[0]).toMatchObject({ email_from_local: 'bookings', email_domain_status: 'pending' })
  })
})
