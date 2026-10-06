import { describe, it, expect } from 'vitest'
import { blockFromSheetRow, blocksFromSheet, sheetColumn, sheetRowFromBlock, nightLabel } from '@/lib/day-blocks/blocks'
import { planImport } from '@/lib/day-blocks/import-plan'

// Rows as the agency's first draft wrote them (Travel2Egypt, 2026-10-06).
const draftHeaders = {
  code: 'code',
  name: 'name',
  shorthand: 'shorthand (suggested - please correct)',
  type: 'day type',
  city: 'city (spent)',
  night: 'night',
  attractions: 'attractions (paid entry)',
  stops: 'photo stops / no ticket',
  guide: 'guide',
  lunch: 'lunch',
  dinner: 'dinner',
  transport: 'transport',
  assistance: 'assistance',
  source: 'from (your data)',
}
const draft = (cells: Partial<Record<keyof typeof draftHeaders, string>>) =>
  Object.fromEntries(Object.entries(cells).map(([k, v]) => [draftHeaders[k as keyof typeof draftHeaders], v]))

describe('the sheet headers', () => {
  it('ignore bracketed notes, case and spacing', () => {
    expect(sheetColumn('shorthand (suggested - please correct)')).toBe('shorthand')
    expect(sheetColumn('City (spent)')).toBe('city')
    expect(sheetColumn('Photo stops / no ticket')).toBe('photo stops')
    expect(sheetColumn('from (your data)')).toBe('source')
    expect(sheetColumn('to check')).toBeNull()
  })
})

describe('a draft row', () => {
  it('a day trip: the night stays where you are', () => {
    const { block } = blockFromSheetRow(draft({
      code: 'CAI-ALX', name: 'Alexandria day trip from Cairo', shorthand: 'CAI/ALX/CAI; ALX DAY', type: 'tour',
      city: 'Alexandria', night: 'no stay (back to Cairo)',
      attractions: "Catacombs of Kom El Shoqafa; Pompey's Pillar; Graeco-Roman Museum; ", stops: 'Qaitbay Citadel',
      guide: 'yes', lunch: 'included (restaurant)', dinner: 'none',
    }), 6)
    expect(block).toMatchObject({
      code: 'CAI-ALX', day_type: 'tour', city: 'Alexandria', to_city: null, night: 'same',
      shorthand: ['CAI/ALX/CAI', 'ALX DAY'],
      attractions: ['Catacombs of Kom El Shoqafa', "Pompey's Pillar", 'Graeco-Roman Museum'],
      photo_stops: ['Qaitbay Citadel'],
      guide: 'egyptologist',
      meals: { breakfast: { included: false, venue: null }, lunch: { included: true, venue: 'restaurant' }, dinner: { included: false, venue: null } },
    })
  })

  it('a transfer: "Luxor > Aswan" and "move: Aswan"', () => {
    const { block } = blockFromSheetRow(draft({ code: 'LXR-ASW-ESNA', name: 'Luxor to Aswan', type: 'transfer', city: 'Luxor > Aswan', night: 'move: Aswan', guide: 'yes' }), 12)
    expect(block).toMatchObject({ city: 'Luxor', to_city: 'Aswan', night: 'move' })
    expect(nightLabel(block!)).toBe('Night in Aswan')
  })

  it('a night the block includes: "stay: White Desert camp"', () => {
    const { block } = blockFromSheetRow(draft({ code: 'CAI-BAH-1', name: 'Bahariya', type: 'transfer', city: 'Bahariya Oasis', night: 'stay: White Desert camp', guide: 'yes', dinner: 'included (camp)' }), 8)
    expect(block).toMatchObject({ night: 'included', night_place: 'White Desert camp', to_city: null })
    expect(block!.meals.dinner).toEqual({ included: true, venue: 'camp' })
  })

  it('on board, none, and "(same city)"', () => {
    expect(blockFromSheetRow(draft({ code: 'C', name: 'n', type: 'cruise', night: 'on board' }), 2).block?.night).toBe('on_board')
    expect(blockFromSheetRow(draft({ code: 'D', name: 'n', type: 'departure', night: 'none' }), 2).block?.night).toBe('none')
    expect(blockFromSheetRow(draft({ code: 'F', name: 'n', type: 'free', city: '(same city)', night: 'stay' }), 2).block).toMatchObject({ city: null, night: 'same' })
  })

  it('an assistant or a spot guide is not an Egyptologist', () => {
    expect(blockFromSheetRow(draft({ code: 'A', name: 'n', guide: 'English-speaking assistant' }), 2).block?.guide).toBe('assistant')
    expect(blockFromSheetRow(draft({ code: 'B', name: 'n', guide: 'spot guide' }), 2).block?.guide).toBe('spot')
    expect(blockFromSheetRow(draft({ code: 'C', name: 'n', guide: 'no' }), 2).block?.guide).toBe('none')
  })

  it('a row it cannot read says why, and is not guessed', () => {
    const r = blockFromSheetRow(draft({ code: 'X', name: '', type: 'safari', night: 'maybe', guide: 'perhaps', lunch: 'sometimes' }), 9)
    expect(r.block).toBeUndefined()
    expect(r.errors).toEqual([
      'It has no name.',
      'Day type "safari" is not one of arrival, tour, transfer, cruise, free, departure.',
      'Night "maybe" is not one of: same, move: <city>, included: <place>, on board, none.',
      'Guide "perhaps" is not one of: yes, no, assistant, spot guide.',
      'Lunch "sometimes" is not "included", "included (<where>)" or "none".',
    ])
  })

  it('a move with no city is reported', () => {
    expect(blockFromSheetRow(draft({ code: 'M', name: 'n', night: 'move' }), 4).errors).toEqual(['The night moves, but the sheet does not say to which city.'])
  })
})

describe('the whole sheet', () => {
  it('skips blank rows, reports problems by sheet row, keeps the first of a repeated code', () => {
    const read = blocksFromSheet([
      draft({ code: 'a-1', name: 'One' }),
      { code: '', name: '' },
      draft({ code: 'A-1', name: 'Again' }),
      draft({ code: 'B', name: 'Two', type: 'nope' }),
    ])
    expect(read.blocks.map(b => [b.code, b.name])).toEqual([['A-1', 'One']])
    expect(read.problems.map(p => [p.row, p.code])).toEqual([[4, 'A-1'], [5, 'B']])
  })

  it('an export reads back as the same block', () => {
    const { block } = blockFromSheetRow(draft({
      code: 'ASW-ABS-OVN-1', name: 'Abu Simbel with overnight', type: 'transfer', city: 'Aswan > Abu Simbel', night: 'move: Abu Simbel',
      attractions: 'Abu Simbel Temples', stops: 'Lake Nasser', guide: 'yes', lunch: 'included (restaurant)', dinner: 'included (hotel)',
      transport: 'road Aswan-Abu Simbel', assistance: 'hotel check-in',
    }), 2)
    const again = blockFromSheetRow(sheetRowFromBlock(block!), 2).block
    expect(again).toEqual(block)
  })
})

describe('an import', () => {
  const block = blockFromSheetRow(draft({ code: 'A', name: 'One', guide: 'yes' }), 2).block!
  it('adds new codes, updates changed ones, leaves the rest', () => {
    const plan = planImport(
      [block, { ...block, code: 'B', name: 'Two' }, { ...block, code: 'C' }],
      [{ ...block, id: 'id-b', code: 'B', name: 'Old two' }, { ...block, id: 'id-c', code: 'C' }, { ...block, id: 'id-z', code: 'Z' }],
    )
    expect(plan.added.map(b => b.code)).toEqual(['A'])
    expect(plan.updated).toEqual([{ id: 'id-b', block: { ...block, code: 'B', name: 'Two' }, changed: ['name'] }])
    expect(plan.unchanged).toEqual(['C'])
  })
})
