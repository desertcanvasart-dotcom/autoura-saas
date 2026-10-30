import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { messageEmailHtml, requestEmailHtml } from '@/lib/supplier-reply-link'

const read = (p: string) => readFileSync(p, 'utf8')

describe('a pre-typed message as an email', () => {
  it('escapes every line; no button unless asked', () => {
    const html = messageEmailHtml('Hello <b>Narcis</b>,\n\n🚗 Car: ABC 123')
    expect(html).toContain('&lt;b&gt;Narcis&lt;/b&gt;')
    expect(html).toContain('🚗 Car: ABC 123')
    expect(html).not.toContain('<a href')
  })
  it('the request keeps its one-tap button', () => {
    expect(requestEmailHtml('Hi\nhttps://x/reply/t', 'https://x/reply/t')).toContain('Answer here — one tap')
  })
})

describe("the client's day message by email", () => {
  const r = read('app/api/bookings/[id]/client-day-message/route.ts')
  it('goes to the client email on the CRM client or the trip, from the company sender, replies to the company', () => {
    expect(r).toContain("(client?.email || itinerary?.client_email)")
    expect(r).toContain('resolveSender(')
    expect(r).toContain('replyTo: tenant.contact_email')
  })
  it('is noted on each of the day’s lines only once it has gone', () => {
    const branch = r.slice(r.indexOf("if (body.channel === 'email')"), r.indexOf('const raw = (client?.whatsapp'))
    expect(branch.indexOf('if (!sent.success)')).toBeLessThan(branch.indexOf("noteSent('email'"))
  })
  it('the button asks first', () => {
    expect(read('components/booking/ClientDayMessage.tsx')).toContain("window.confirm('Email the client this day’s details now?')")
  })
})

describe('telling a supplier "not needed" by email', () => {
  const r = read('app/api/bookings/[id]/suppliers/[lineId]/request/route.ts')
  it('only for a line that was asked and is now Not needed, logged once sent', () => {
    const branch = r.slice(r.indexOf("if (body.notice === 'cancelled')"), r.indexOf("if (!line.supplier_id && !lineSupplier("))
    expect(branch).toContain("status !== 'cancelled' || !line.requested_at")
    expect(branch).toContain("if (body.channel === 'email')")
    expect(branch.indexOf('if (!sent.success)')).toBeLessThan(branch.lastIndexOf("kind: 'cancel_sent'"))
  })
  it('the panel offers it beside the WhatsApp notice', () => {
    expect(read('components/booking/BookingSuppliersPanel.tsx')).toContain('notice="cancelled" onSent={load} notify={notify} />\n                            <RequestByEmail')
  })
})

describe('older lines', () => {
  it('a covered line with no supplier says "Supplier not recorded", not "No supplier yet"', () => {
    expect(read('components/booking/BookingSuppliersPanel.tsx')).toContain("'Supplier not recorded' : 'No supplier yet'")
  })
})
