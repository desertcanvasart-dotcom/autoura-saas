import { describe, it, expect, vi, beforeEach } from 'vitest'

// The B2C bulk routes used to build their own anon client, passing the
// browser's cookies as a plain header. The database never sees a login that
// way, so row security matched nothing: a bulk delete "succeeded", deleted
// nothing, and the quotes came back on reload. They must use the session's
// client, like the B2B routes.
const calls: { op: string; ids: string[] }[] = []
const sessionClient = {
  from: () => {
    let op = ''
    const chain = {
      delete: () => { op = 'delete'; return chain },
      update: () => { op = 'update'; return chain },
      in: (_col: string, ids: string[]) => { calls.push({ op, ids }); return chain },
      select: async () => ({ data: calls.at(-1)!.ids.map(id => ({ id })), error: null }),
    }
    return chain
  },
}

vi.mock('@/lib/supabase-server', () => ({
  createAuthenticatedClient: vi.fn(async () => sessionClient),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => { throw new Error('bulk routes must not build their own client') },
}))

import { DELETE } from '@/app/api/quotes/b2c/bulk-delete/route'
import { PUT } from '@/app/api/quotes/b2c/bulk-update/route'

const req = (body: unknown) => ({ json: async () => body }) as never

describe('B2C quote bulk actions run as the signed-in user', () => {
  beforeEach(() => { calls.length = 0 })

  it('bulk delete deletes through the session client and reports the count', async () => {
    const res = await DELETE(req({ quote_ids: ['q1', 'q2'] }))
    const body = await res.json()
    expect(calls).toEqual([{ op: 'delete', ids: ['q1', 'q2'] }])
    expect(body.deleted_count).toBe(2)
  })

  it('bulk status change updates through the session client and reports the count', async () => {
    const res = await PUT(req({ quote_ids: ['q3'], status: 'sent' }))
    const body = await res.json()
    expect(calls).toEqual([{ op: 'update', ids: ['q3'] }])
    expect(body.updated_count).toBe(1)
  })
})
