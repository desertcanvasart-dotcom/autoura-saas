import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildServiceRequestMessage, requestEmailHtml, requestEmailSubject } from '@/lib/supplier-reply-link'

const url = 'https://getautoura.net/reply/abc123'
const message = buildServiceRequestMessage({
  supplierName: 'Ahmed', agency: 'Travel2Egypt', service: 'Airport pickup', serviceDate: '2026-11-03', serviceTime: '09:30',
  pickup: 'Cairo Airport <script>', guests: 2, clientName: 'Tersa', replyHours: 4, assign: 'car', url,
})

describe('the supplier request by email', () => {
  it('subject says what and when; a reminder says so', () => {
    expect(requestEmailSubject('Airport pickup', '2026-11-03', false)).toBe('Booking request: Airport pickup — Tue, 3 Nov 2026')
    expect(requestEmailSubject('Lunch', null, true)).toBe('Reminder: Booking request: Lunch')
  })

  it('carries the same text, escaped, with the reply link as a button and printed once more', () => {
    const html = requestEmailHtml(message, url)
    expect(html).toContain('Booking request from Travel2Egypt:')
    expect(html).toContain('Pickup: Cairo Airport')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain(`href="${url}"`)
    expect(html.split(url).length - 1).toBe(2) // the button and the printed copy, not the text line too
  })

  it('the route sends only after a press, from the company sender, and marks Requested only once it has gone', () => {
    const src = readFileSync('app/api/bookings/[id]/suppliers/[lineId]/request/route.ts', 'utf8')
    const from = src.indexOf("if (body.channel === 'email')")
    const branch = src.slice(from, src.indexOf('const phone = await supplierPhone(', from))
    // After the request message is built (it needs the reply link), not in the not-needed notice.
    expect(from).toBeGreaterThan(src.indexOf('const message = buildServiceRequestMessage'))
    expect(branch).toContain('resolveSender(')
    expect(branch.indexOf('if (!sent.success)')).toBeLessThan(branch.indexOf("to: 'requested'"))
    expect(branch).toContain("channel: 'email'")
    expect(branch).toContain(".eq('tenant_id', tenant_id)")
  })
})
