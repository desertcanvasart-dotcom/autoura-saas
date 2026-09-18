import { describe, it, expect, vi, beforeEach } from 'vitest'
import { officeRule } from '@/lib/email/office-addresses'

// The model is never called in these: what matters is who is judged, and what
// a yes or a no does to the database.
const judged: string[] = []
let answer: { isRequest: boolean; reason: string } | null = { isRequest: true, reason: 'asks about a trip' }

vi.mock('@/lib/email/email-leads', async () => {
  const real = await vi.importActual<typeof import('@/lib/email/email-leads')>('@/lib/email/email-leads')
  return {
    ...real,
    judgeLead: async (c: { fromEmail: string }) => {
      judged.push(c.fromEmail)
      return answer
    },
  }
})

import { createLeadsFromNewConversations, MAX_JUDGED_PER_SYNC } from '@/lib/email/create-leads'

const OFFICE = officeRule(['info@agency.com'], [])

function db(opts: { clients?: string[]; dismissed?: string[]; insertFails?: boolean } = {}) {
  const inserted: Array<Record<string, unknown>> = []
  const linked: Array<{ id: string; client_id: string }> = []
  return {
    inserted,
    linked,
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: async () => ({
          data:
            table === 'clients'
              ? (opts.clients ?? []).map(email => ({ email }))
              : (opts.dismissed ?? []).map(sender_email => ({ sender_email })),
        }),
        insert: (row: Record<string, unknown>) => {
          inserted.push(row)
          return {
            select: () => ({
              single: async () =>
                opts.insertFails ? { data: null, error: { message: 'nope' } } : { data: { id: `client-${inserted.length}` }, error: null },
            }),
          }
        },
        update: (patch: Record<string, unknown>) => ({
          eq: async (_c: string, id: string) => {
            linked.push({ id, client_id: String(patch.client_id) })
            return { error: null }
          },
        }),
      }
      return chain
    },
  }
}

const conv = (over: Record<string, unknown> = {}) => ({
  unifiedId: 'conv-1',
  fromEmail: 'ada@example.com',
  fromName: 'Ada Lovelace',
  subject: 'Egypt in March?',
  body: 'Hello, do you run Nile cruises in March for two people?',
  ...over,
})

beforeEach(() => {
  judged.length = 0
  answer = { isRequest: true, reason: 'asks about a trip' }
})

describe('a travel request', () => {
  it('becomes a client at status lead, from email, linked to its conversation', async () => {
    const d = db()
    const created = await createLeadsFromNewConversations({ db: d, tenantId: 't1', office: OFFICE, conversations: [conv()] })

    expect(created).toBe(1)
    expect(d.inserted[0]).toMatchObject({
      tenant_id: 't1',
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      status: 'lead',
      client_source: 'email',
    })
    expect(d.linked).toEqual([{ id: 'conv-1', client_id: 'client-1' }])
  })

  it('records why it was created, for whoever finds it later', async () => {
    const d = db()
    await createLeadsFromNewConversations({ db: d, tenantId: 't1', office: OFFICE, conversations: [conv()] })
    expect(String(d.inserted[0].notes)).toContain('asks about a trip')
  })
})

describe('what is never created', () => {
  it('nothing, when the model says it is not a request', async () => {
    answer = { isRequest: false, reason: 'supplier invoice' }
    const d = db()
    expect(await createLeadsFromNewConversations({ db: d, tenantId: 't1', office: OFFICE, conversations: [conv()] })).toBe(0)
    expect(d.inserted).toEqual([])
  })

  it('nothing, when the model cannot be read — an invented lead is work to undo', async () => {
    answer = null
    const d = db()
    expect(await createLeadsFromNewConversations({ db: d, tenantId: 't1', office: OFFICE, conversations: [conv()] })).toBe(0)
  })

  it('nothing for a sender already on record, and the model is not even asked', async () => {
    const d = db({ clients: ['ada@example.com'] })
    expect(await createLeadsFromNewConversations({ db: d, tenantId: 't1', office: OFFICE, conversations: [conv()] })).toBe(0)
    expect(judged).toEqual([])
  })

  it('nothing for a sender previously dismissed', async () => {
    const d = db({ dismissed: ['ada@example.com'] })
    expect(await createLeadsFromNewConversations({ db: d, tenantId: 't1', office: OFFICE, conversations: [conv()] })).toBe(0)
    expect(judged).toEqual([])
  })

  it('nothing for the office writing to itself', async () => {
    const d = db()
    const conversations = [conv({ fromEmail: 'hello@agency.com' })]
    expect(await createLeadsFromNewConversations({ db: d, tenantId: 't1', office: OFFICE, conversations })).toBe(0)
    expect(judged).toEqual([])
  })

  it('one client for one person, however many conversations they start', async () => {
    const d = db()
    const conversations = [conv(), conv({ unifiedId: 'conv-2', subject: 'Following up' })]
    expect(await createLeadsFromNewConversations({ db: d, tenantId: 't1', office: OFFICE, conversations })).toBe(1)
    expect(judged).toHaveLength(1)
  })

  it('nothing when the insert fails, and the conversation is not linked to a ghost', async () => {
    const d = db({ insertFails: true })
    expect(await createLeadsFromNewConversations({ db: d, tenantId: 't1', office: OFFICE, conversations: [conv()] })).toBe(0)
    expect(d.linked).toEqual([])
  })
})

describe('a first sync of a full mailbox', () => {
  it('judges at most a sensible number, rather than asking about three hundred old newsletters', async () => {
    const conversations = Array.from({ length: MAX_JUDGED_PER_SYNC + 5 }, (_, i) =>
      conv({ unifiedId: `conv-${i}`, fromEmail: `person${i}@example.com` })
    )
    const d = db()
    const created = await createLeadsFromNewConversations({ db: d, tenantId: 't1', office: OFFICE, conversations })
    expect(judged).toHaveLength(MAX_JUDGED_PER_SYNC)
    expect(created).toBe(MAX_JUDGED_PER_SYNC)
  })
})
