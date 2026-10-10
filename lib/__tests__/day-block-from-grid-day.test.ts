import { describe, it, expect } from 'vitest'
import { blockDraftFromGridDay, suggestBlockCode, validateNewBlock } from '@/lib/day-blocks/from-grid-day'
import { SLOT_DEFINITIONS, type GridDay, type SelectedItem } from '@/app/pricing-grid/types'

const it_ = (name: string): SelectedItem => ({ rateId: name, name, rateEur: 10, rateNonEur: 10 })
const gridDay = (over: Partial<GridDay> = {}, items: Record<string, string[]> = {}): GridDay => ({
  id: 'd1', dayNumber: 2, title: 'Giza Pyramids & GEM', city: 'Cairo', description: 'Pyramids, then the museum.', isExpanded: false,
  slots: SLOT_DEFINITIONS.map(def => ({ slotId: def.slotId, selectedItems: (items[def.slotId] ?? []).map(it_), customAmount: 0 })),
  ...over,
})

describe('blockDraftFromGridDay', () => {
  it('reads a sightseeing day back into a block', () => {
    const draft = blockDraftFromGridDay(gridDay({ dayType: 'tour' }, {
      entrance_fees: ['Giza Pyramids', 'Grand Egyptian Museum'],
      guide: ['Egyptologist Cairo full day'],
      meals: ['Lunch at Khufu’s'],
      route: ['Van (8-12 pax) — Cairo Day Tour'],
    }))
    expect(draft).toMatchObject({
      name: 'Giza Pyramids & GEM', day_type: 'tour', city: 'Cairo', night: 'same', to_city: null,
      attractions: ['Giza Pyramids', 'Grand Egyptian Museum'], guide: 'egyptologist',
      meals: { breakfast: { included: false }, lunch: { included: true, venue: 'restaurant' }, dinner: { included: false } },
      transport: 'Cairo Day Tour', description: 'Pyramids, then the museum.', code: '',
    })
  })

  it('a transfer to another city moves the night there', () => {
    const draft = blockDraftFromGridDay(gridDay({ dayType: 'transfer', intercity: 'flight', city: 'Cairo' }), gridDay({ city: 'Luxor' }))
    expect(draft).toMatchObject({ night: 'move', to_city: 'Luxor', transport: 'Flight' })
  })

  it('a departure has no night; an arrival notes its airport and check-in', () => {
    expect(blockDraftFromGridDay(gridDay({ dayType: 'departure' })).night).toBe('none')
    expect(blockDraftFromGridDay(gridDay({ dayType: 'arrival' })).assistance).toEqual(expect.arrayContaining(['airport arrival', 'hotel check-in']))
  })
})

describe('suggestBlockCode', () => {
  it('city and type, numbered past the codes already taken', () => {
    expect(suggestBlockCode({ city: 'Cairo', day_type: 'tour' }, [])).toBe('CAI-TOUR')
    expect(suggestBlockCode({ city: 'Cairo', day_type: 'tour' }, ['cai-tour', 'CAI-TOUR-2'])).toBe('CAI-TOUR-3')
    expect(suggestBlockCode({ city: null, day_type: 'free' }, [])).toBe('DAY-FREE')
  })
})

describe('validateNewBlock', () => {
  const ok = { code: 'cai tour', name: 'Giza', day_type: 'tour', night: 'same', guide: 'none', meals: { lunch: { included: true, venue: 'restaurant' } } }

  it('normalises the code and the lists', () => {
    const r = validateNewBlock({ ...ok, attractions: [' Giza Pyramids ', '', 'Giza Pyramids'] })
    expect(r.ok && r.block).toMatchObject({ code: 'CAI-TOUR', attractions: ['Giza Pyramids'], meals: { lunch: { included: true, venue: 'restaurant' }, dinner: { included: false, venue: null } } })
  })

  it('refuses what the sheet import refuses', () => {
    expect(validateNewBlock({ ...ok, code: '' })).toMatchObject({ ok: false })
    expect(validateNewBlock({ ...ok, name: ' ' })).toMatchObject({ ok: false })
    expect(validateNewBlock({ ...ok, day_type: 'safari' })).toMatchObject({ ok: false })
    expect(validateNewBlock({ ...ok, night: 'move' })).toMatchObject({ ok: false, error: expect.stringMatching(/which city/) })
    expect(validateNewBlock({ ...ok, code: 'CAI/TOUR' })).toMatchObject({ ok: false })
  })
})
