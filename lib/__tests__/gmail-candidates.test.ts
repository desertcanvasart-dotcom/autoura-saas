import { describe, it, expect } from 'vitest'
import { collectCandidates, storedIds, downloadMessages, MAX_HISTORY_MESSAGES, type Gmail } from '@/lib/email/gmail-candidates'

// Stage 0 of the owner dashboard (2026-09-25). Checked live first: nothing was
// missing from the store — but every scheduled run downloaded every recent
// message in full to find it already stored, a failed download was swallowed
// by `catch {}`, and no history id was ever written.

type Msg = { id: string; threadId?: string; labelIds?: string[]; from?: string }

function fakeGmail(opts: {
  historyId?: string
  history?: Msg[] | { status: number }
  listing?: Msg[]
  failGet?: Set<string>
  full?: Record<string, Msg>
}) {
  const calls = { list: 0, historyList: 0, getFull: [] as string[], getMeta: [] as string[] }
  const gmail = {
    users: {
      getProfile: async () => ({ data: { historyId: opts.historyId ?? '900' } }),
      history: {
        list: async () => {
          calls.historyList++
          if (opts.history && !Array.isArray(opts.history)) throw Object.assign(new Error('gone'), { code: opts.history.status })
          return { data: { history: [{ messagesAdded: (opts.history ?? []).map(m => ({ message: m })) }] } }
        },
      },
      messages: {
        list: async () => { calls.list++; return { data: { messages: opts.listing ?? [] } } },
        get: async ({ id, format }: { id: string; format: string }) => {
          if (format === 'metadata') {
            calls.getMeta.push(id)
            const m = [...(Array.isArray(opts.history) ? opts.history : [])].find(x => x.id === id)
            return { data: { payload: { headers: [{ name: 'From', value: m?.from ?? '' }] } } }
          }
          calls.getFull.push(id)
          if (opts.failGet?.has(id)) throw new Error('backend error')
          const m = opts.full?.[id] ?? { id, labelIds: ['INBOX'] }
          return { data: { id, threadId: m.threadId ?? `t-${id}`, labelIds: m.labelIds ?? ['INBOX'] } }
        },
      },
    },
  } as unknown as Gmail
  return { gmail, calls }
}

const base = { mainQuery: 'after:2026/09/22', rescueQueries: [], maxResults: 50, knownSenders: new Set<string>() }

describe('which messages a run considers', () => {
  it('scheduled run with a history id: only what Gmail added since — no listing', async () => {
    const { gmail, calls } = fakeGmail({ history: [{ id: 'a', threadId: 't1', labelIds: ['INBOX'] }] })
    const c = await collectCandidates(gmail, { ...base, useHistory: true, startHistoryId: '800' })
    expect(c).toMatchObject({ mode: 'history', historyId: '900', truncated: false })
    expect(c.refs.map(r => r.id)).toEqual(['a'])
    expect(calls.list).toBe(0)
  })

  it('drafts, spam and trash are never candidates', async () => {
    const { gmail } = fakeGmail({ history: [
      { id: 'd', labelIds: ['DRAFT'] }, { id: 's', labelIds: ['SPAM'] }, { id: 't', labelIds: ['TRASH'] }, { id: 'ok', labelIds: ['INBOX'] },
    ] })
    const c = await collectCandidates(gmail, { ...base, useHistory: true, startHistoryId: '800' })
    expect(c.refs.map(r => r.id)).toEqual(['ok'])
  })

  it('promotions/social/forums only when the sender is already on record', async () => {
    const { gmail, calls } = fakeGmail({ history: [
      { id: 'promo', labelIds: ['CATEGORY_PROMOTIONS'], from: 'Deals <deals@shop.com>' },
      { id: 'client', labelIds: ['CATEGORY_SOCIAL'], from: 'Narcis <poch.narcis@gmail.com>' },
    ] })
    const c = await collectCandidates(gmail, { ...base, knownSenders: new Set(['poch.narcis@gmail.com']), useHistory: true, startHistoryId: '800' })
    expect(c.refs.map(r => r.id)).toEqual(['client'])
    expect(calls.getMeta.sort()).toEqual(['client', 'promo'])
  })

  it('a history id Gmail no longer has (404) or never accepted (400) falls back to the date window', async () => {
    for (const status of [404, 400]) {
      const { gmail, calls } = fakeGmail({ history: { status }, listing: [{ id: 'x', threadId: 't' }] })
      const c = await collectCandidates(gmail, { ...base, useHistory: true, startHistoryId: '1' })
      expect(c.mode).toBe('listing')
      expect(c.fellBackBecause).toMatch(status === 404 ? /too old/ : /not accepted/)
      expect(c.refs.map(r => r.id)).toEqual(['x'])
      expect(calls.list).toBe(1)
    }
  })

  it('any other history error is the run failing — never swallowed', async () => {
    const { gmail } = fakeGmail({ history: { status: 500 } })
    await expect(collectCandidates(gmail, { ...base, useHistory: true, startHistoryId: '1' })).rejects.toThrow()
  })

  it('no stored id (first run) or a manual sync: the date window', async () => {
    const { gmail, calls } = fakeGmail({ listing: [{ id: 'x' }] })
    expect((await collectCandidates(gmail, { ...base, useHistory: true, startHistoryId: null })).mode).toBe('listing')
    expect((await collectCandidates(gmail, { ...base, useHistory: false, startHistoryId: '5' })).mode).toBe('listing')
    expect(calls.historyList).toBe(0)
  })

  it('more history than one run takes: capped, and marked truncated so the id is not advanced', async () => {
    const many = Array.from({ length: MAX_HISTORY_MESSAGES + 20 }, (_, i) => ({ id: `m${i}`, labelIds: ['INBOX'] }))
    const { gmail } = fakeGmail({ history: many })
    const c = await collectCandidates(gmail, { ...base, useHistory: true, startHistoryId: '800' })
    expect(c.refs).toHaveLength(MAX_HISTORY_MESSAGES)
    expect(c.truncated).toBe(true)
  })
})

describe('only new mail is downloaded, and failures are counted', () => {
  it('the store is checked in one query per 100 ids, scoped to the company', async () => {
    const queries: { tenant: unknown; ids: string[] }[] = []
    const db = {
      from: () => {
        const q: { tenant?: unknown; ids?: string[] } = {}
        const chain = {
          select: () => chain,
          eq: (_c: string, v: unknown) => { q.tenant = v; return chain },
          in: async (_c: string, ids: string[]) => { queries.push({ tenant: q.tenant, ids }); return { data: ids.filter(i => i.endsWith('0')).map(i => ({ gmail_message_id: i })), error: null } },
        }
        return chain
      },
    }
    const ids = Array.from({ length: 250 }, (_, i) => `id${i}`)
    const stored = await storedIds(db, 't1', ids)
    expect(queries.map(q => q.ids.length)).toEqual([100, 100, 50])
    expect(queries.every(q => q.tenant === 't1')).toBe(true)
    expect(stored.size).toBe(25)
  })

  it('a failed download is counted (it used to vanish in catch {}); a draft is skipped', async () => {
    const { gmail, calls } = fakeGmail({ failGet: new Set(['b']), full: { c: { id: 'c', labelIds: ['DRAFT'] } } })
    const r = await downloadMessages(gmail, [{ id: 'a', threadId: null }, { id: 'b', threadId: null }, { id: 'c', threadId: null }])
    expect(r.messages.map(m => m.id)).toEqual(['a'])
    expect(r.failed).toBe(1)
    expect(r.skipped).toBe(1)
    expect(calls.getFull.sort()).toEqual(['a', 'b', 'c'])
  })
})
