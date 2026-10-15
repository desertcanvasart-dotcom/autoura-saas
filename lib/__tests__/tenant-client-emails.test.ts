import { describe, it, expect } from 'vitest'
import { tenantClientEmails, CLIENT_PAGE_SIZE } from '@/lib/email/tenant-client-emails'
import { autoLinkEmails } from '@/lib/email-auto-link'

// A company with more than 1000 clients: a plain select stopped at 1000 rows
// (PostgREST max_rows), so mail from the rest was never linked to its client.

function clientsDb(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: `c${String(i).padStart(5, '0')}`, email: `client${i}@x.test` }))
  const upserts: Array<{ rows: unknown[]; opts: unknown }> = []
  const db = {
    upserts,
    from(table: string) {
      const q: Record<string, unknown> = {}
      let range: [number, number] = [0, 999]
      q.select = () => q
      q.eq = () => q
      q.not = () => q
      q.order = () => q
      q.in = async () => ({ data: [] })
      q.range = async (a: number, b: number) => {
        range = [a, Math.min(b, a + 999)] // the server's own cap
        return { data: rows.slice(range[0], range[1] + 1), error: null }
      }
      q.upsert = (r: unknown[], opts: unknown) => {
        upserts.push({ rows: r, opts })
        return { select: async () => ({ data: r.map((_, i) => ({ id: `l${i}` })), error: null }) }
      }
      void table
      return q
    },
  }
  return db
}

describe('tenantClientEmails', () => {
  it('reads every page, not just the first 1000', async () => {
    expect(await tenantClientEmails(clientsDb(2500), 't1')).toHaveLength(2500)
  })
  it('stops on a short page', async () => {
    expect(await tenantClientEmails(clientsDb(CLIENT_PAGE_SIZE), 't1')).toHaveLength(CLIENT_PAGE_SIZE)
    expect(await tenantClientEmails(clientsDb(0), 't1')).toEqual([])
  })
})

describe('autoLinkEmails', () => {
  it('links mail from a client past the first 1000', async () => {
    const db = clientsDb(1500)
    const res = await autoLinkEmails(db as never, 't1', 'u1', [
      { messageId: 'm1', threadId: 't', fromEmail: 'client1400@x.test', toEmails: [] },
    ])
    expect(res.linked).toBe(1)
  })

  it('skips links made meanwhile instead of failing the whole batch', async () => {
    const db = clientsDb(3)
    await autoLinkEmails(db as never, 't1', 'u1', [{ messageId: 'm1', threadId: 't', fromEmail: 'client1@x.test', toEmails: [] }])
    expect(db.upserts[0].opts).toMatchObject({ onConflict: 'user_id,message_id', ignoreDuplicates: true })
  })
})
