// Reported from production, 2026-09-20: the dashboard would not load at all —
// "This page couldn't load", React error #130 in the console.
//
// The "Needs attention" panel kept its OWN hand-typed list of item kinds, with
// an icon for each. The API went on to emit two more ('extra_request' in #300,
// 'awaiting_reply' in #449); the panel looked their icon up, got `undefined`,
// rendered it as a component, and took the whole page down. It waited for the
// first account with a customer unanswered for more than a day.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe as suite, it, expect } from 'vitest'
import { AlertTriangle } from 'lucide-react'
import { iconFor, describe as describeItem, headline } from '@/app/dashboard/NeedsAttention'
import { buildAwaitingReplyItems, type AttentionItem } from '@/lib/dashboard/attention'

const LIB = readFileSync(join(process.cwd(), 'lib/dashboard/attention.ts'), 'utf8')
const PANEL = readFileSync(join(process.cwd(), 'app/dashboard/NeedsAttention.tsx'), 'utf8')

// Every kind the API can emit, read two ways so neither can drift alone: the
// declared union, and the literals actually pushed.
const union = LIB.match(/export type AttentionType = ([^\n]+)/)![1].match(/'([a-z_]+)'/g)!.map(s => s.slice(1, -1))
const emitted = [...new Set([...LIB.matchAll(/\btype: '([a-z_]+)'/g)].map(m => m[1]))]

const item = (type: string, over: Partial<AttentionItem> = {}): AttentionItem => ({
  type: type as AttentionItem['type'], severity: 'soon', bookingId: 'b1', bookingNumber: 'BK-1',
  tripName: 'Nile in Depth', clientName: 'A. Traveller', startDate: null, detail: {}, href: '/x', ...over,
})

suite('every kind of item the API emits', () => {
  it('is in the declared union — and there are the six we know of', () => {
    expect(emitted.sort()).toEqual([...union].sort())
    expect(union).toContain('awaiting_reply')
    expect(union).toContain('extra_request')
  })

  it.each(union)('%s has its own icon', type => {
    expect(iconFor(type)).toBeDefined()
    expect(iconFor(type)).not.toBe(AlertTriangle)
  })

  it.each(union)('%s has its own wording', type => {
    expect(describeItem(item(type))).not.toBe('Needs a look')
    expect(describeItem(item(type)).length).toBeGreaterThan(5)
  })
})

suite('a kind this build has never heard of', () => {
  // A tab left open across a deploy runs yesterday's panel against today's API.
  it('gets a real component, never undefined — the page stays up', () => {
    expect(iconFor('something_added_next_month')).toBe(AlertTriangle)
  })

  it('and words, rather than an empty line', () => {
    expect(describeItem(item('something_added_next_month'))).toBe('Needs a look')
  })
})

suite('the panel cannot fall behind the API again', () => {
  it('takes the item and its kinds FROM the API, not from a copy', () => {
    expect(PANEL).toMatch(/import type \{ AttentionItem, AttentionType \} from '@\/lib\/dashboard\/attention'/)
    expect(PANEL).not.toMatch(/interface AttentionItem/)
  })

  it('maps icons by Record<AttentionType, …>, so a missing one is a type error', () => {
    expect(PANEL).toMatch(/const ICONS: Record<AttentionType, IconType> = \{/)
  })

  it('never indexes the map directly when rendering', () => {
    expect(PANEL).not.toMatch(/=\s*ICONS\[item\.type\]/)
    expect(PANEL).toContain('const Icon = iconFor(item.type)')
  })
})

suite('a customer waiting for a reply', () => {
  const now = new Date('2026-09-20T12:00:00Z')
  const [waiting] = buildAwaitingReplyItems(
    [{ id: 'c1', contact_name: 'Marie Dupont', contact_email: 'marie@example.com', awaiting_reply_since: '2026-09-17T09:00:00Z' }] as never,
    now,
  )

  it('is the item that crashed the page, straight from the API\'s own builder', () => {
    expect(waiting.type).toBe('awaiting_reply')
    expect(iconFor(waiting.type)).not.toBe(AlertTriangle)
  })

  it('is headed by the person — a conversation is not a "Booking"', () => {
    expect(headline(waiting)).toBe('Marie Dupont')
    expect(headline(item('balance_due'))).toBe('Nile in Depth')
  })

  it('says how long, in days', () => {
    expect(describeItem(waiting)).toBe('Waiting 3 days for our reply')
    expect(describeItem(item('awaiting_reply', { detail: { hours: 30 } }))).toBe('Waiting 1 day for our reply')
  })
})

suite('an extra asked for in the portal', () => {
  it('names what was asked for', () => {
    expect(describeItem(item('extra_request', { detail: { title: 'Hot air balloon' } }))).toBe('Extra requested: Hot air balloon')
  })
})
