import { describe, it, expect } from 'vitest'
import { pickCandidate, ambiguityMessage } from '@/lib/pricing/candidate-selection'

type R = { name: string; is_preferred?: boolean }
const name = (r: R) => r.name

describe('pickCandidate — the refuse-to-guess rule', () => {
  it('no rows → none', () => {
    expect(pickCandidate([] as R[], name)).toEqual({ kind: 'none' })
  })
  it('one row → that row, preferred or not', () => {
    expect(pickCandidate([{ name: 'A' }], name)).toEqual({ kind: 'one', row: { name: 'A' } })
  })
  it('several rows, exactly one preferred → the preferred one', () => {
    const rows: R[] = [{ name: 'A' }, { name: 'B', is_preferred: true }, { name: 'C' }]
    expect(pickCandidate(rows, name)).toEqual({ kind: 'one', row: rows[1] })
  })
  it('several rows, none preferred → ambiguous, never the first row', () => {
    const r = pickCandidate([{ name: 'A' }, { name: 'B' }], name)
    expect(r.kind).toBe('ambiguous')
    if (r.kind === 'ambiguous') {
      expect(r.count).toBe(2)
      expect(r.names).toEqual(['A', 'B'])
      expect(r.preferredCount).toBe(0)
    }
  })
  it('several rows, two preferred → ambiguous (the flag no longer decides)', () => {
    const r = pickCandidate([{ name: 'A', is_preferred: true }, { name: 'B', is_preferred: true }], name)
    expect(r.kind).toBe('ambiguous')
    if (r.kind === 'ambiguous') expect(r.preferredCount).toBe(2)
  })
  it('lists at most four names and marks the rest with an ellipsis', () => {
    const rows = ['A', 'B', 'C', 'D', 'E', 'F'].map(n => ({ name: n }))
    const r = pickCandidate(rows, name)
    expect(r.kind).toBe('ambiguous')
    if (r.kind === 'ambiguous') {
      expect(r.names).toHaveLength(4)
      expect(ambiguityMessage('standard hotels in Cairo', r, 'Rates → Hotels')).toBe(
        '6 standard hotels in Cairo (A, B, C, D, …) and none is marked preferred. Mark exactly one as preferred in Rates → Hotels, or pick one in the pricing grid.'
      )
    }
  })
  it('a custom preferred predicate is honoured', () => {
    const rows = [{ name: 'A', flag: 'x' }, { name: 'B', flag: 'default' }]
    const r = pickCandidate(rows, r => r.name, r => r.flag === 'default')
    expect(r).toEqual({ kind: 'one', row: rows[1] })
  })
})
