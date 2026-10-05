// The dashboard's Needs attention rows had no way out: a robot sender the
// filter missed, a reply sent from a phone, a balance chased by hand — each sat
// at the top for weeks and buried what was new. A row can now be dismissed
// (migration 397). These pin the rule that makes that safe: a dismissal holds
// only while the row's state does, so anything that changes brings it back.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  attentionKey,
  attentionFingerprint,
  withoutDismissed,
  buildAwaitingReplyItems,
  type AttentionItem,
} from '@/lib/dashboard/attention'

const item = (over: Partial<AttentionItem> = {}): AttentionItem => ({
  type: 'balance_due', severity: 'urgent', bookingId: 'b1', bookingNumber: 'BK-1',
  tripName: 'Nile in Depth', clientName: 'A. Traveller', startDate: '2026-10-20',
  detail: { balanceDue: 1200, deadline: '2026-10-10', overdue: false },
  href: '/bookings/b1', ...over,
})

const dismissalOf = (i: AttentionItem) => ({ item_key: attentionKey(i), fingerprint: attentionFingerprint(i) })

describe('a dismissed row', () => {
  it('is hidden while its state holds', () => {
    const row = item()
    const other = item({ bookingId: 'b2', href: '/bookings/b2' })
    const out = withoutDismissed([row, other], [dismissalOf(row)])
    expect(out.items).toEqual([other])
    expect(out.dismissed).toBe(1)
  })

  it('survives the JSON trip to the browser and back', () => {
    const row = item()
    const fromBrowser = JSON.parse(JSON.stringify(row)) as AttentionItem
    expect(withoutDismissed([row], [dismissalOf(fromBrowser)]).items).toEqual([])
  })

  it('comes back when the balance or its deadline moves', () => {
    const row = item()
    const d = [dismissalOf(row)]
    expect(withoutDismissed([item({ detail: { ...row.detail, balanceDue: 900 } })], d).items).toHaveLength(1)
    expect(withoutDismissed([item({ detail: { ...row.detail, deadline: '2026-10-15' } })], d).items).toHaveLength(1)
    expect(withoutDismissed([item({ detail: { ...row.detail, overdue: true } })], d).items).toHaveLength(1)
  })

  it('comes back when another traveller is still missing details', () => {
    const row = item({ type: 'details_missing', detail: { complete: 2, total: 4 } })
    const later = item({ type: 'details_missing', detail: { complete: 3, total: 5 } })
    expect(withoutDismissed([later], [dismissalOf(row)]).items).toEqual([later])
  })
})

describe('a customer waiting for a reply', () => {
  const conv = { id: 'c1', contact_name: 'Marie', contact_email: 'marie@example.com', awaiting_reply_since: '2026-09-17T09:00:00Z', last_inbound_at: '2026-09-17T09:00:00Z' }
  const [first] = buildAwaitingReplyItems([conv], new Date('2026-09-20T12:00:00Z'))

  it('stays dismissed as the hours tick by', () => {
    const [later] = buildAwaitingReplyItems([conv], new Date('2026-09-25T12:00:00Z'))
    expect(later.detail.hours).not.toBe(first.detail.hours)
    expect(later.severity).toBe(first.severity)
    expect(withoutDismissed([later], [dismissalOf(first)]).items).toEqual([])
  })

  it('comes back when they write again', () => {
    const [wroteAgain] = buildAwaitingReplyItems([{ ...conv, last_inbound_at: '2026-09-21T08:00:00Z' }], new Date('2026-09-22T12:00:00Z'))
    expect(withoutDismissed([wroteAgain], [dismissalOf(first)]).items).toEqual([wroteAgain])
  })

  it('comes back as a new wait after we replied and they wrote back', () => {
    const [newWait] = buildAwaitingReplyItems([{ ...conv, awaiting_reply_since: '2026-09-23T09:00:00Z', last_inbound_at: '2026-09-23T09:00:00Z' }], new Date('2026-09-25T12:00:00Z'))
    expect(withoutDismissed([newWait], [dismissalOf(first)]).items).toEqual([newWait])
  })
})

describe('keys', () => {
  it('tell apart two requests on the same booking', () => {
    const a = item({ type: 'change_request', detail: { requestedAt: '2026-09-01T00:00:00Z' } })
    const b = item({ type: 'change_request', detail: { requestedAt: '2026-09-05T00:00:00Z' } })
    expect(attentionKey(a)).not.toBe(attentionKey(b))
    expect(withoutDismissed([a, b], [dismissalOf(a)]).items).toEqual([b])
  })

  it('tell apart kinds on the same booking', () => {
    const balance = item()
    const guide = item({ type: 'no_guide', detail: {}, href: '/itineraries/i1/edit' })
    expect(withoutDismissed([balance, guide], [dismissalOf(balance)]).items).toEqual([guide])
  })
})

describe('the wiring', () => {
  const ROUTE = readFileSync(join(process.cwd(), 'app/api/dashboard/attention/route.ts'), 'utf8')
  const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/397_dashboard_attention_dismissals.sql'), 'utf8')

  it('the list route filters through withoutDismissed and reads last_inbound_at', () => {
    expect(ROUTE).toContain('withoutDismissed(')
    expect(ROUTE).toContain('last_inbound_at')
  })

  it('the table is tenant-scoped by RLS', () => {
    expect(SQL).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(SQL).toMatch(/UNIQUE \(tenant_id, item_key\)/)
    for (const op of ['select', 'insert', 'update', 'delete']) {
      expect(SQL).toContain(`dashboard_attention_dismissals_${op}`)
    }
  })
})
