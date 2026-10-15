import { describe, it, expect } from 'vitest'
import { collectCandidates, MAX_FALLBACK_LISTING, type Gmail } from '@/lib/email/gmail-candidates'
import { headerAddresses } from '@/lib/email/contact-name'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ============================================
// Inbox sync — mail that was skipped for good
// ============================================

/** A mailbox whose date window lists `total` messages, `pageSize` a page. */
function pagedGmail(total: number, pageSize = 500) {
  const pages: Array<string | undefined> = []
  const gmail = {
    users: {
      getProfile: async () => ({ data: { historyId: '900' } }),
      history: { list: async () => { throw Object.assign(new Error('too old'), { code: 404 }) } },
      messages: {
        list: async ({ pageToken, maxResults }: { pageToken?: string; maxResults: number }) => {
          pages.push(pageToken)
          const start = pageToken ? Number(pageToken) : 0
          const n = Math.min(maxResults, pageSize)
          const ids = Array.from({ length: Math.max(0, Math.min(n, total - start)) }, (_, i) => ({ id: `m${start + i}`, threadId: 't' }))
          const next = start + ids.length < total ? String(start + ids.length) : undefined
          return { data: { messages: ids, nextPageToken: next } }
        },
      },
    },
  } as unknown as Gmail
  return { gmail, pages }
}

const base = { mainQuery: 'after:2026/10/01', rescueQueries: [], maxResults: 50, knownSenders: new Set<string>(), useHistory: true, startHistoryId: '100' }

describe('history too old — the date-window fallback', () => {
  it('takes the whole window, not the newest page of 50', async () => {
    const { gmail, pages } = pagedGmail(1200)
    const c = await collectCandidates(gmail, base)
    expect(c.mode).toBe('listing')
    expect(c.refs).toHaveLength(1200)
    expect(pages.length).toBe(3)
  })

  it('stops at the cap, says so, and still moves the history id on', async () => {
    const { gmail } = pagedGmail(MAX_FALLBACK_LISTING + 900)
    const c = await collectCandidates(gmail, base)
    expect(c.refs.length).toBeGreaterThanOrEqual(MAX_FALLBACK_LISTING)
    expect(c.fellBackBecause).toMatch(/stopped at/)
    expect(c).toMatchObject({ truncated: false, historyId: '900' })
  })

  it('an ordinary (non-history) run still lists one page of maxResults', async () => {
    const { gmail, pages } = pagedGmail(1200)
    const c = await collectCandidates(gmail, { ...base, useHistory: false })
    expect(c.refs).toHaveLength(50)
    expect(pages).toHaveLength(1)
  })
})

describe('headerAddresses', () => {
  it('splits a bare list instead of keeping it whole', () => {
    expect(headerAddresses('a@x.com, B@Y.com')).toEqual(['a@x.com', 'b@y.com'])
  })
  it('keeps a quoted name with a comma as one address', () => {
    expect(headerAddresses('"Smith, John" <j@x.com>, Ann <ann@y.com>')).toEqual(['j@x.com', 'ann@y.com'])
  })
  it('finds no address in undisclosed-recipients', () => {
    expect(headerAddresses('undisclosed-recipients:;')).toEqual([])
  })
  it('reads group syntax', () => {
    expect(headerAddresses('Team: a@x.com, b@x.com;')).toEqual(['a@x.com', 'b@x.com'])
  })
  it('is empty for nothing', () => {
    expect(headerAddresses(null)).toEqual([])
  })
})

describe('the sync route', () => {
  const route = readFileSync(path.join(__dirname, '..', '..', 'app/api/email/sync/route.ts'), 'utf8')

  it('counts a failed thread, so the history id is not advanced past it', () => {
    const c = route.slice(route.indexOf('catch (threadErr'))
    expect(c.slice(0, 400)).toContain('insertFailed++')
  })

  it('files mail into a conversation another sync just created, and counts any other failure', () => {
    expect(route).toContain("unifiedErr?.code === '23505'")
    expect(route).toContain('insertFailed += messages.length')
    expect(route).not.toMatch(/if \(unifiedErr \|\| !newUnified\) continue/)
  })

  it('takes the customer from the first non-office recipient, and parses Cc quote-aware', () => {
    expect(route).toContain('firstCustomerAddress(firstTo, office)')
    expect(route).not.toContain("cc.split(',')")
  })
})
