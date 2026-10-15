import { describe, it, expect } from 'vitest'
import {
  normaliseRule, matchesRule, planFor, planFromActions, gmailQueryFor, splitWords, messageText, describeConditions,
  type MailRule,
} from '@/lib/email/mail-rules'
import { unsubscribeMethod } from '@/lib/email/unsubscribe'
import { printHtml } from '@/lib/email/print-email'
import { labelChange, MAX_ACTION_IDS } from '@/lib/email/mail-actions'

const rule = (over: Partial<MailRule>): MailRule => ({ id: 'r', name: 'r', enabled: true, conditions: {}, actions: {}, ...over })
const msg = { from: 'Booking.com <noreply@booking.com>', to: 'ops@agency.com', cc: 'sara@agency.com', subject: 'New reservation #123', text: 'Guest arrives Cairo 12 March, two adults' }

describe('normaliseRule', () => {
  it('keeps known fields, trimmed', () => {
    const r = normaliseRule({ conditions: { from: '  booking.com ', junk: 'x' }, actions: { folder: ' Bookings ', star: true, evil: true } })
    expect(r).toEqual({ ok: true, name: 'Emails from booking.com', conditions: { from: 'booking.com' }, actions: { folder: 'Bookings', star: true } })
  })
  it('needs a condition and an action, and not both spam and delete', () => {
    expect(normaliseRule({ conditions: {}, actions: { star: true } }).ok).toBe(false)
    expect(normaliseRule({ conditions: { from: 'x' }, actions: {} }).ok).toBe(false)
    expect(normaliseRule({ conditions: { from: 'x' }, actions: { spam: true, delete: true } }).ok).toBe(false)
  })
  it('names a rule after its conditions when not named', () => {
    expect(describeConditions({ from: 'a', subject: 'b' })).toBe('Emails from a, subject "b"')
  })
})

describe('matchesRule', () => {
  it('from / to (or cc) / subject, case-insensitively; all must match', () => {
    expect(matchesRule({ from: 'BOOKING.COM' }, msg)).toBe(true)
    expect(matchesRule({ to: 'sara@' }, msg)).toBe(true)
    expect(matchesRule({ subject: 'reservation' }, msg)).toBe(true)
    expect(matchesRule({ from: 'booking.com', subject: 'cancelled' }, msg)).toBe(false)
  })
  it('has these words: every word or phrase, in subject or body', () => {
    expect(matchesRule({ words: 'cairo "two adults"' }, msg)).toBe(true)
    expect(matchesRule({ words: 'cairo luxor' }, msg)).toBe(false)
    expect(splitWords('a "b c" d')).toEqual(['a', 'b c', 'd'])
  })
  it('a rule with no conditions matches nothing', () => {
    expect(matchesRule({}, msg)).toBe(false)
  })
})

describe('planFor', () => {
  it('combines folders, star, read and skip-Inbox from every matching rule', () => {
    const p = planFor([
      rule({ conditions: { from: 'booking.com' }, actions: { folder: 'Bookings', markRead: true } }),
      rule({ conditions: { subject: 'reservation' }, actions: { star: true, skipInbox: true, folder: 'Bookings' } }),
      rule({ conditions: { subject: 'nope' }, actions: { delete: true } }),
    ], msg)
    expect(p).toEqual({ folders: ['Bookings'], addLabelIds: ['STARRED'], removeLabelIds: ['UNREAD', 'INBOX'], removed: false })
  })
  it('delete wins, then spam', () => {
    expect(planFromActions([{ star: true }, { delete: true }, { spam: true }])).toMatchObject({ addLabelIds: ['TRASH'], removed: true })
    expect(planFromActions([{ folder: 'X' }, { spam: true }])).toMatchObject({ addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'], folders: [] })
  })
  it('a switched-off rule does nothing', () => {
    expect(planFor([rule({ enabled: false, conditions: { from: 'booking' }, actions: { star: true } })], msg)).toBeNull()
  })
})

describe('gmailQueryFor', () => {
  it('searches the Inbox only, quoting values', () => {
    expect(gmailQueryFor({ from: 'booking.com', to: 'ops', subject: 'New "res"', words: 'cairo "two adults"' }))
      .toBe('in:inbox from:"booking.com" {to:"ops" cc:"ops"} subject:"New  res" "cairo" "two adults"')
  })
})

describe('messageText', () => {
  it('reads plain and html parts, without tags or styles', () => {
    const b = (s: string) => Buffer.from(s).toString('base64')
    const t = messageText({ mimeType: 'multipart/alternative', parts: [
      { mimeType: 'text/plain', body: { data: b('Hello Cairo') } },
      { mimeType: 'text/html', body: { data: b('<style>.x{}</style><p>Hi <b>Luxor</b></p>') } },
    ] })
    expect(t).toContain('Hello Cairo')
    expect(t).toContain('Hi Luxor')
    expect(t).not.toContain('.x{}')
  })
})

describe('unsubscribeMethod', () => {
  it('prefers one-click over a link over mailto', () => {
    expect(unsubscribeMethod('<mailto:u@list.com?subject=stop>, <https://list.com/u?id=1>', 'List-Unsubscribe=One-Click'))
      .toEqual({ kind: 'oneClick', url: 'https://list.com/u?id=1' })
    expect(unsubscribeMethod('<https://list.com/u>', null)).toEqual({ kind: 'link', url: 'https://list.com/u' })
    expect(unsubscribeMethod('<mailto:u@list.com?subject=stop>', null)).toEqual({ kind: 'mailto', to: 'u@list.com', subject: 'stop', body: 'unsubscribe' })
  })
  it('ignores plain http, javascript: and junk', () => {
    expect(unsubscribeMethod('<http://list.com/u>', 'List-Unsubscribe=One-Click')).toBeNull()
    expect(unsubscribeMethod('<javascript:alert(1)>', null)).toBeNull()
    expect(unsubscribeMethod('', null)).toBeNull()
    expect(unsubscribeMethod(undefined)).toBeNull()
  })
})

describe('printHtml', () => {
  it('prints every message with escaped headers', () => {
    const html = printHtml('Trip <b>', [
      { from: 'Ann <ann@x.com>', to: 'me@x.com', date: '2026-10-01T10:00:00Z', body: '<p>first</p>' },
      { from: 'me@x.com', to: 'ann@x.com', cc: 'b@x.com', date: '2026-10-02T10:00:00Z', body: '<p>second</p>', attachments: [{ filename: 'v.pdf' }] },
    ])
    expect(html).toContain('<title>Trip &lt;b&gt;</title>')
    expect(html).toContain('Ann &lt;ann@x.com&gt;')
    expect(html).toContain('<p>first</p>')
    expect(html).toContain('<p>second</p>')
    expect(html).toContain('Attachments: v.pdf')
    expect(html).toContain('2 messages')
  })
})

describe('labelChange', () => {
  it('report spam moves to Spam and out of the Inbox; not spam reverses it', () => {
    expect(labelChange('spam')).toEqual({ addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] })
    expect(labelChange('notSpam')).toEqual({ addLabelIds: ['INBOX'], removeLabelIds: ['SPAM'] })
  })
  it('refuses unknown actions and a move without a folder', () => {
    expect(labelChange('explode')).toEqual({ error: 'Invalid action' })
    expect('error' in labelChange('move')).toBe(true)
  })
  it('caps a select-all at 5,000', () => {
    expect(MAX_ACTION_IDS).toBe(5000)
  })
})
