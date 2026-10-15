import { describe, it, expect } from 'vitest'
import { collectHistoryChanges, isInboxArrival } from '@/lib/email/poll-history'
import { pollBackoffMs, MAX_POLL_BACKOFF_MS } from '@/lib/use-email-polling'

// ============================================
// Live inbox polling
// ============================================
// The poll counted the user's own sent replies and every draft autosave as new
// Inbox mail, kept only the first message of each label change, and gave up
// polling for good after three errors in a row.

const added = (id: string, labelIds?: string[]) => ({ messagesAdded: [{ message: { id, labelIds } }] })

describe('collectHistoryChanges', () => {
  it('counts mail that arrived in the Inbox', () => {
    expect(collectHistoryChanges([added('m1', ['INBOX', 'UNREAD'])]).newMessageIds).toEqual(['m1'])
  })

  it('does not count a sent reply or a draft autosave as new mail', () => {
    const r = collectHistoryChanges([added('s1', ['SENT']), added('d1', ['DRAFT']), added('d2', ['DRAFT', 'INBOX'])])
    expect(r.newMessageIds).toEqual([])
  })

  it('keeps an arrival whose labels history does not say (the route checks them)', () => {
    expect(collectHistoryChanges([added('m1')]).newMessageIds).toEqual(['m1'])
  })

  it('reports each message once, and not one deleted since', () => {
    const r = collectHistoryChanges([
      added('m1', ['INBOX']),
      added('m1', ['INBOX']),
      added('m2', ['INBOX']),
      { messagesDeleted: [{ message: { id: 'm2' } }] },
    ])
    expect(r.newMessageIds).toEqual(['m1'])
    expect(r.deletedMessageIds).toEqual(['m2'])
  })

  it('records a label change for every message in the record, not only the first', () => {
    const r = collectHistoryChanges([
      { labelsRemoved: [{ message: { id: 'a' }, labelIds: ['UNREAD'] }, { message: { id: 'b' }, labelIds: ['UNREAD'] }] },
    ])
    expect(r.labelChanges.map(c => c.messageId).sort()).toEqual(['a', 'b'])
    expect(r.labelChanges[0]).toMatchObject({ labelsRemoved: ['UNREAD'] })
  })

  it('nets out a label added then removed', () => {
    const r = collectHistoryChanges([
      { labelsAdded: [{ message: { id: 'a' }, labelIds: ['STARRED'] }] },
      { labelsRemoved: [{ message: { id: 'a' }, labelIds: ['STARRED'] }] },
    ])
    expect(r.labelChanges).toEqual([{ messageId: 'a', labelsRemoved: ['STARRED'] }])
  })
})

describe('isInboxArrival', () => {
  it('is Inbox mail only', () => {
    expect(isInboxArrival(['INBOX'])).toBe(true)
    expect(isInboxArrival(['SENT'])).toBe(false)
    expect(isInboxArrival(['INBOX', 'DRAFT'])).toBe(false)
  })
})

describe('pollBackoffMs', () => {
  const I = 120_000
  it('keeps the normal cadence for the first failures', () => {
    expect(pollBackoffMs(1, I)).toBe(0)
    expect(pollBackoffMs(2, I)).toBe(0)
  })
  it('backs off from the third, doubling, and never stops for good', () => {
    expect(pollBackoffMs(3, I)).toBe(2 * I)
    expect(pollBackoffMs(4, I)).toBe(4 * I)
    expect(pollBackoffMs(50, I)).toBe(MAX_POLL_BACKOFF_MS)
    expect(Number.isFinite(pollBackoffMs(1000, I))).toBe(true)
  })
})
