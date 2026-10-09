// The send routes mark a voucher sent once the message has gone (it was a
// second request from the page). A re-send never moves a voucher backwards.
import { describe, it, expect } from 'vitest'
import { markSupplierDocumentSent } from '@/lib/documents/mark-sent'

function db(status: string | null) {
  const updates: Record<string, unknown>[] = []
  const client = {
    from: () => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = () => b
      b.maybeSingle = async () => ({ data: status === null ? null : { status }, error: null })
      b.update = (u: Record<string, unknown>) => { updates.push(u); return b }
      b.then = (r: (v: unknown) => void) => r({ error: null })
      return b
    },
  }
  return { client, updates }
}

const now = new Date('2026-10-09T08:00:00Z')

describe('markSupplierDocumentSent', () => {
  it('moves a draft to sent and stamps when', async () => {
    const d = db('draft')
    expect(await markSupplierDocumentSent(d.client, { documentId: 'doc', now })).toEqual({ error: null })
    expect(d.updates[0]).toMatchObject({ status: 'sent', sent_at: now.toISOString() })
  })

  it('records a re-send without moving a confirmed voucher back', async () => {
    const d = db('confirmed')
    await markSupplierDocumentSent(d.client, { documentId: 'doc', now })
    expect(d.updates[0]).not.toHaveProperty('status')
    expect(d.updates[0]).toMatchObject({ sent_at: now.toISOString() })
  })

  it('reports a voucher it cannot see', async () => {
    const d = db(null)
    expect((await markSupplierDocumentSent(d.client, { documentId: 'doc', now })).error).toBeTruthy()
    expect(d.updates).toHaveLength(0)
  })
})
