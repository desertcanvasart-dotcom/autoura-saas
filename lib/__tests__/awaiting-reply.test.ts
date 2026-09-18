import { describe, it, expect } from 'vitest'
import { buildAwaitingReplyItems, AWAITING_REPLY_HOURS } from '@/lib/dashboard/attention'

// ============================================
// A customer waiting on us for a day
// ============================================
// The dashboard's "Needs a reply" reads UNREAD flags, so a message somebody
// opened and then did not answer disappears from it — which is the one most
// worth chasing. This reads the wait itself (migration 366).

const NOW = new Date('2027-06-10T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

const conv = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  contact_name: 'Ada Traveller',
  contact_email: 'ada@example.test',
  awaiting_reply_since: hoursAgo(30),
  ...over,
})

describe('buildAwaitingReplyItems', () => {
  it('raises a customer who has waited a day', () => {
    const [item] = buildAwaitingReplyItems([conv()], NOW)
    expect(item.type).toBe('awaiting_reply')
    expect(item.clientName).toBe('Ada Traveller')
    expect(item.detail.hours).toBe(30)
    expect(item.href).toContain('c1')
  })

  it('leaves a fresh message alone — answering takes a while', () => {
    expect(buildAwaitingReplyItems([conv({ awaiting_reply_since: hoursAgo(AWAITING_REPLY_HOURS - 1) })], NOW)).toEqual([])
  })

  it('calls two days urgent, one day soon', () => {
    expect(buildAwaitingReplyItems([conv({ awaiting_reply_since: hoursAgo(25) })], NOW)[0].severity).toBe('soon')
    expect(buildAwaitingReplyItems([conv({ awaiting_reply_since: hoursAgo(49) })], NOW)[0].severity).toBe('urgent')
  })

  it('ignores an answered conversation, and unusable dates', () => {
    expect(buildAwaitingReplyItems([conv({ awaiting_reply_since: null })], NOW)).toEqual([])
    expect(buildAwaitingReplyItems([conv({ awaiting_reply_since: 'not a date' })], NOW)).toEqual([])
  })

  it('names the email when there is no name', () => {
    expect(buildAwaitingReplyItems([conv({ contact_name: null })], NOW)[0].clientName).toBe('ada@example.test')
    expect(buildAwaitingReplyItems([conv({ contact_name: null, contact_email: null })], NOW)[0].clientName).toBe('A customer')
  })

  it('puts the longest wait first', () => {
    const items = buildAwaitingReplyItems(
      [conv({ id: 'a', awaiting_reply_since: hoursAgo(26) }), conv({ id: 'b', awaiting_reply_since: hoursAgo(80) })],
      NOW
    )
    expect(items.map(i => i.bookingId)).toEqual(['b', 'a'])
  })
})

describe('buildAwaitingReplyItems and robots', () => {
  // The database stamps awaiting_reply_since on any inbound message; it cannot
  // tell a customer from a Twilio notification. Live 2026-09-18: five of the
  // twelve "waiting" conversations were no-reply addresses, and they were the
  // oldest, so they sat at the top of the dashboard.
  it('does not raise a no-reply address', () => {
    expect(buildAwaitingReplyItems([conv({ contact_email: 'donotreply@twilio.com' })], NOW)).toEqual([])
    expect(buildAwaitingReplyItems([conv({ contact_email: 'ads-noreply@google.com' })], NOW)).toEqual([])
  })

  it('still raises the customer sitting behind them', () => {
    const items = buildAwaitingReplyItems(
      [
        conv({ id: 'robot', contact_email: 'noreply@twilio.com', awaiting_reply_since: hoursAgo(900) }),
        conv({ id: 'human', contact_email: 'ada@example.test', awaiting_reply_since: hoursAgo(30) }),
      ],
      NOW
    )
    expect(items.map(i => i.bookingId)).toEqual(['human'])
  })
})
