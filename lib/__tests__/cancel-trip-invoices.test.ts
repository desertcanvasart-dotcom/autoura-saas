import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { openInvoicesOnCancel } from '@/lib/itineraries/cancel-invoices'
import { writeOffBalance } from '@/lib/invoices/write-off'

const read = (p: string) => readFileSync(p, 'utf8')
const NOW = () => '2026-11-03T00:00:00.000Z'

// A cancelled trip kept its invoices open: ITN-S-2026-6386 was cancelled and
// INV-2026-001 still read Overdue, USD 579.35 due, with Record payment.
describe('cancelling a trip: which invoices are voided, which ask', () => {
  it('unpaid → void; part paid → write-off choice; settled or cancelled → left alone', () => {
    const got = openInvoicesOnCancel([
      { id: 'a', invoice_number: 'INV-1', currency: 'USD', status: 'sent', amount_paid: 0, balance_due: 579.35 },
      { id: 'b', invoice_number: 'INV-2', currency: 'USD', status: 'partially_paid', amount_paid: 100, balance_due: 50 },
      { id: 'c', invoice_number: 'INV-3', currency: 'USD', status: 'paid', amount_paid: 200, balance_due: 0 },
      { id: 'd', invoice_number: 'INV-4', currency: 'USD', status: 'cancelled', amount_paid: 0, balance_due: 80 },
      { id: 'e', invoice_number: 'INV-5', currency: 'EUR', status: 'draft', amount_paid: 0, balance_due: 10 },
    ])
    expect(got.map(g => [g.invoice_number, g.action])).toEqual([['INV-1', 'void'], ['INV-2', 'writeoff'], ['INV-5', 'void']])
  })
})

describe('writing off the balance of a part-paid invoice', () => {
  const base = { invoice_type: 'standard', tax_rate: 0, discount_amount: 0, currency: 'USD', status: 'partially_paid', paid_at: null, notes: null }

  it('a lined invoice takes the balance as discount, so it still adds up and reads Paid', () => {
    const r = writeOffBalance({ ...base, line_items: [{ amount: 500 }], tax_rate: 10, total_amount: 550, amount_paid: 200 }, 'Client ill', NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.written_off).toBe(350)
    expect(r.update).toMatchObject({ subtotal: 500, tax_amount: 50, discount_amount: 350, total_amount: 200, balance_due: 0, status: 'paid', paid_at: NOW() })
    expect(r.update.notes).toBe('Balance of USD 350.00 written off — trip cancelled: Client ill.')
  })

  it('a deposit invoice (or one without lines) has its total brought down to what was paid', () => {
    const r = writeOffBalance({ ...base, invoice_type: 'deposit', line_items: [], total_amount: 300, amount_paid: 120, notes: 'Deposit 30%' }, null, NOW)
    expect(r.ok && r.update).toMatchObject({ total_amount: 120, balance_due: 0, status: 'paid', notes: 'Deposit 30%\nBalance of USD 180.00 written off — trip cancelled.' })
  })

  it('refuses an unpaid, settled or cancelled invoice', () => {
    expect(writeOffBalance({ ...base, line_items: [], total_amount: 100, amount_paid: 0 }, null, NOW).ok).toBe(false)
    expect(writeOffBalance({ ...base, line_items: [], total_amount: 100, amount_paid: 100 }, null, NOW).ok).toBe(false)
    expect(writeOffBalance({ ...base, status: 'cancelled', line_items: [], total_amount: 100, amount_paid: 50 }, null, NOW).ok).toBe(false)
  })
})

describe('wiring', () => {
  it('the write-off route is managers and up, and uses the rule', () => {
    const route = read('app/api/invoices/[id]/write-off/route.ts')
    expect(route).toContain("gateRole('manage')")
    expect(route).toContain('writeOffBalance(')
  })

  it('the cancel dialog voids unpaid invoices and asks about part-paid ones, after the trip is cancelled', () => {
    const dialog = read('components/itineraries/CancelTripDialog.tsx')
    expect(dialog).toContain('openInvoicesOnCancel(list)')
    expect(dialog).toContain("body: JSON.stringify({ status: 'cancelled' })")
    expect(dialog).toContain('/write-off`')
    expect(dialog).toContain('Leave it open')
    expect(dialog.indexOf("fetch(`/api/itineraries/${itineraryId}`")).toBeLessThan(dialog.indexOf('for (const inv of invoices ?? [])'))
  })

  it('a cancelled trip\'s Finance tab offers Void / Write off instead of Record payment', () => {
    const panel = read('components/itineraries/InvoicesPayments.tsx')
    expect(panel).toContain("{!tripCancelled && inv.status !== 'cancelled' && due > 0.005 && recording !== inv.id && (")
    expect(panel).toContain("'Void invoice' : 'Write off balance'")
    expect(read('app/itineraries/[id]/page.tsx')).toContain("tripCancelled={itinerary.status === 'cancelled'}")
  })
})
