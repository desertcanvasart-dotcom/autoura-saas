import { describe, it, expect } from 'vitest'
// @ts-expect-error — a plain .mjs script, no type declarations
import { planCleanup, SUPPLEMENT_TAG } from '../cleanup-grid-single-supplement.mjs'

// ============================================================================
// The one-time cleanup of single supplements the grid saved for parties of
// more than one (scripts/cleanup-grid-single-supplement.mjs). Its plan is
// pure: which lines go, which itinerary headers are re-summed, and which
// booking supplier rows go or are left for a person.
// ============================================================================

const line = (id: string, itinerary_id: string, total_cost: number, extra: Record<string, unknown> = {}) =>
  ({ id, itinerary_id, description: '[pricing-grid:accommodation] Mena House', quantity: 2, total_cost, ...extra })
const supp = (id: string, itinerary_id: string, quantity: number, total_cost: number) =>
  line(id, itinerary_id, total_cost, { description: SUPPLEMENT_TAG, quantity })
const supplierRow = (id: string, itinerary_id: string, extra: Record<string, unknown> = {}) =>
  ({ id, itinerary_id, booking_id: 'b1', supplier_id: null, supplier_name: 'Single Supplement', status: 'pending', confirmed_cost: null, ...extra })

function plan(input: Partial<Parameters<typeof planCleanup>[0]>) {
  return planCleanup({ services: [], itineraries: [], supplierRows: [], expenses: [], ...input })
}

describe('planCleanup', () => {
  it('removes the supplement saved for 2 pax; keeps the one a party of one was charged', () => {
    const p = plan({
      services: [line('h', 'it2', 200), supp('s2', 'it2', 2, 120), supp('s1', 'it1', 1, 60)],
      itineraries: [{ id: 'it2', total_cost: 260, supplier_cost: null }, { id: 'it1', total_cost: 208, supplier_cost: null }],
    })
    expect(p.deleteServiceIds).toEqual(['s2'])
    expect([...p.removedByItinerary]).toEqual([['it2', 120]])
  })

  it('re-sums supplier cost and profit from the lines that stay, only where an FX re-price set it', () => {
    const p = plan({
      services: [line('h', 'a', 200), supp('s', 'a', 2, 120), line('h2', 'b', 100), supp('t', 'b', 2, 50)],
      itineraries: [
        { id: 'a', total_cost: 260, supplier_cost: 320 }, // re-priced: summed the supplement
        { id: 'b', total_cost: 130, supplier_cost: null }, // grid's own profit stands
      ],
    })
    expect(p.itineraryUpdates).toEqual([{ id: 'a', supplier_cost: 200, profit: 60 }])
  })

  it('is safe to run twice: a second plan over the same rows gives the same header', () => {
    const input = {
      services: [line('h', 'a', 200), supp('s', 'a', 2, 120)],
      itineraries: [{ id: 'a', total_cost: 260, supplier_cost: 200 }], // already corrected, lines not yet removed
    }
    expect(plan(input).itineraryUpdates).toEqual([{ id: 'a', supplier_cost: 200, profit: 60 }])
  })

  it('removes a pending "Single Supplement" supplier row; leaves any someone acted on for review', () => {
    const p = plan({
      services: [supp('s', 'a', 2, 120)],
      itineraries: [{ id: 'a', total_cost: 260, supplier_cost: null }],
      supplierRows: [
        supplierRow('pending', 'a'),
        supplierRow('confirmed', 'a', { status: 'confirmed', confirmed_cost: 120 }),
        supplierRow('expensed', 'a'),
        supplierRow('hotel', 'a', { supplier_name: 'Mena House' }),
        supplierRow('linked', 'a', { supplier_id: 'sup1' }),
        supplierRow('other-trip', 'z'),
      ],
      expenses: [{ id: 'e1', booking_supplier_status_id: 'expensed' }],
    })
    expect(p.deleteSupplierRowIds).toEqual(['pending'])
    expect(p.reviewSupplierRows.map((r: { id: string; reason: string }) => [r.id, r.reason])).toEqual([
      ['confirmed', 'status confirmed, confirmed cost 120'],
      ['expensed', 'has an expense'],
    ])
  })

  it('nothing to remove: an empty plan', () => {
    const p = plan({ services: [supp('s1', 'it1', 1, 60)], supplierRows: [supplierRow('r', 'it1')] })
    expect(p.deleteServiceIds).toEqual([])
    expect(p.deleteSupplierRowIds).toEqual([])
    expect(p.itineraryUpdates).toEqual([])
  })
})
