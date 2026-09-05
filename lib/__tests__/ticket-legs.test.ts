import { describe, it, expect } from 'vitest'
import {
  collectTicketLegs,
  normalizeStationCity,
  rowServesRoute,
  selectTicketRow,
  groupSleeperTrains,
  isSingleCabin,
  trainForNamedRow,
} from '@/lib/pricing/ticket-legs'

// ============================================
// Ticket legs — the pure rules (B-item 2)
// ============================================
// Leg collection (incl. the sleeper's day-shift and unmarked-stays-road),
// the never-guess selection rule, and sleeper cabin-pair grouping with the
// Cairo ↔ Giza station alias.

describe('collectTicketLegs', () => {
  const days = (list: Array<Partial<{ city: string; transport_type: 'flight' | 'train' | 'sleeping_train'; transport_rate_id: string }>>) =>
    list.map((d, i) => ({ day: i + 1, city: d.city || 'Cairo', ...d }))

  it('flight/train legs run PREVIOUS day city → this day city, on a real change', () => {
    const legs = collectTicketLegs(days([
      { city: 'Cairo' },
      { city: 'Luxor', transport_type: 'flight' },
      { city: 'Aswan', transport_type: 'train', transport_rate_id: 'tr-1' },
    ]))
    expect(legs).toEqual([
      { mode: 'flight', from: 'Cairo', to: 'Luxor', dayNumber: 2, namedRateId: undefined },
      { mode: 'train', from: 'Luxor', to: 'Aswan', dayNumber: 3, namedRateId: 'tr-1' },
    ])
  })

  it('an unmarked city change stays a ROAD transfer — no leg', () => {
    expect(collectTicketLegs(days([{ city: 'Cairo' }, { city: 'Luxor' }]))).toEqual([])
  })

  it('a marked day without a city change is not a leg (nothing to ride)', () => {
    expect(collectTicketLegs(days([{ city: 'Cairo' }, { city: 'Cairo', transport_type: 'flight' }]))).toEqual([])
  })

  it('the sleeper shifts a day: THIS city → NEXT day city (board tonight, wake there)', () => {
    const legs = collectTicketLegs(days([
      { city: 'Cairo', transport_type: 'sleeping_train' },
      { city: 'Luxor' },
    ]))
    expect(legs).toEqual([
      { mode: 'sleeping_train', from: 'Cairo', to: 'Luxor', dayNumber: 1, namedRateId: undefined },
    ])
  })

  it('a last-day sleeper has nowhere to wake — no leg', () => {
    expect(collectTicketLegs(days([{ city: 'Cairo' }, { city: 'Luxor', transport_type: 'sleeping_train' }]))).toEqual([])
  })

  it('Cairo ↔ Giza are one station city — a Giza→Cairo "change" is not a leg', () => {
    expect(normalizeStationCity('Giza')).toBe('cairo')
    expect(collectTicketLegs(days([{ city: 'Giza' }, { city: 'Cairo', transport_type: 'train' }]))).toEqual([])
  })
})

describe('rowServesRoute', () => {
  it('matches through the station alias, on both column vocabularies', () => {
    const leg = { from: 'Giza', to: 'Luxor' }
    expect(rowServesRoute({ origin_city: 'Cairo', destination_city: 'Luxor' }, leg)).toBe(true)
    expect(rowServesRoute({ route_from: 'cairo', route_to: 'LUXOR' }, leg)).toBe(true)
    expect(rowServesRoute({ origin_city: 'Luxor', destination_city: 'Cairo' }, leg)).toBe(false)
  })
})

describe('selectTicketRow — the never-guess rule', () => {
  const rows = [
    { id: 'a', name: 'Watania 1' },
    { id: 'b', name: 'Watania 2' },
  ]
  const label = (r: { name: string }) => r.name

  it('a named row wins', () => {
    expect(selectTicketRow(rows, 'b', label)).toEqual({ kind: 'row', row: rows[1] })
  })

  it('a named-but-gone row is ITS OWN hole — never a fallback', () => {
    expect(selectTicketRow(rows, 'gone', label)).toEqual({ kind: 'named_missing', namedId: 'gone' })
  })

  it('exactly one candidate auto-resolves', () => {
    expect(selectTicketRow([rows[0]], undefined, label)).toEqual({ kind: 'row', row: rows[0] })
  })

  it('zero candidates is a no-rate hole; several are an ambiguity naming them', () => {
    expect(selectTicketRow([], undefined, label)).toEqual({ kind: 'no_rate' })
    expect(selectTicketRow(rows, undefined, label)).toEqual({ kind: 'ambiguous', candidates: ['Watania 1', 'Watania 2'] })
  })
})

describe('sleeper cabin pairs', () => {
  const rows = [
    { id: 'dbl', cabin_type: 'double_cabin', rate_oneway_eur: 120, origin_city: 'Cairo', destination_city: 'Luxor', operator_name: 'Watania' },
    { id: 'sgl', cabin_type: 'single_cabin', rate_oneway_eur: 180, origin_city: 'Cairo', destination_city: 'Luxor', operator_name: 'Watania' },
    { id: 'other', cabin_type: 'double_cabin', rate_oneway_eur: 150, origin_city: 'Cairo', destination_city: 'Luxor', operator_name: 'Ernst' },
  ]

  it('one TRAIN is its cabin-row pair sharing route/operator/validity', () => {
    const trains = groupSleeperTrains(rows)
    expect(trains).toHaveLength(2)
    const watania = trains.find(t => t.label === 'Watania')!
    expect(watania.halfTwin?.id).toBe('dbl')
    expect(watania.single?.id).toBe('sgl')
  })

  it('cabin classification and named-row train resolution', () => {
    expect(isSingleCabin('single_cabin')).toBe(true)
    expect(isSingleCabin('double_cabin')).toBe(false)
    const trains = groupSleeperTrains(rows)
    expect(trainForNamedRow(trains, 'sgl')?.label).toBe('Watania')
    expect(trainForNamedRow(trains, 'nope')).toBeNull()
  })
})
