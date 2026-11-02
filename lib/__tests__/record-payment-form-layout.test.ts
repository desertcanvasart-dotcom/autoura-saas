import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

// Record payment on the itinerary's Finance tab was one cramped row whose
// labels sat at different heights (the select and date box are taller under
// globals.css). It is its own titled panel, two rows of equal-height fields.
describe('itinerary Finance tab: Record payment form layout', () => {
  const panel = read('components/itineraries/InvoicesPayments.tsx')

  it('a titled panel naming the invoice and its balance due', () => {
    expect(panel).toContain('Record payment · {inv.invoice_number}')
    expect(panel).toContain('Balance due <span')
  })

  it('amount, method and date on one row, all the same height; reference and buttons below', () => {
    expect(panel).toContain('grid grid-cols-1 sm:grid-cols-3 gap-3')
    expect((panel.match(/className="h-10"/g) ?? []).length).toBe(4)
    expect(panel).toContain('Save payment')
  })

  it('the Finance tab cards have more room between them', () => {
    expect(read('app/itineraries/[id]/page.tsx')).toContain("{tab === 'finance' && (\n              <div className=\"space-y-6\">")
  })
})
