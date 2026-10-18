// A voucher PDF must print its services even when an empty list sits ahead of
// them, and the edit page's attractions picker ADDS lines rather than
// replacing a voucher's own (it replaced them on every save, for every type).
import { describe, it, expect } from 'vitest'
import { voucherLines, withPickedAttractions } from '@/lib/documents/voucher-lines'

const line = (name: string) => ({ service_name: name, date: '2026-11-02', quantity: 2, total_cost: 80 })

describe('voucherLines', () => {
  it('prints the services when an empty list would have won (the sibling app’s bug)', () => {
    const doc = { services: [line('Mena House — 2 nights')], selected_attractions: [], selected_routes: null }
    expect(voucherLines(doc).map(l => l.service_name)).toEqual(['Mena House — 2 nights'])
  })

  it('prints services today, when the table has no selected_* columns', () => {
    expect(voucherLines({ services: [line('Lunch — Abou El Sid')] })).toHaveLength(1)
  })

  it('falls back to the first other list with lines, and is empty when none has any', () => {
    expect(voucherLines({ services: [], selected_meals: [{ restaurant_name: 'X' }] })).toEqual([{ restaurant_name: 'X' }])
    expect(voucherLines({ services: null, selected_attractions: [] })).toEqual([])
  })
})

describe('withPickedAttractions', () => {
  it('keeps a generated voucher’s lines when nothing was picked', () => {
    const services = [line('Lunch — Abou El Sid'), line('Dinner — Sequoia')]
    expect(withPickedAttractions(services, [])).toEqual(services)
  })

  it('adds the picked entrance fees after the existing lines', () => {
    const out = withPickedAttractions([line('Lunch')], [{ attraction_name: 'Giza Plateau', city: 'Giza', eur_rate: 20, quantity: 3 }])
    expect(out).toHaveLength(2)
    expect(out[0].service_name).toBe('Lunch')
    expect(out[1]).toEqual({ service_name: 'Giza Plateau', service_type: 'entrance_fee', city: 'Giza', quantity: 3, unit_rate: 20, total_cost: 60 })
  })

  it('treats missing services as none', () => {
    expect(withPickedAttractions(null, [])).toEqual([])
  })
})
