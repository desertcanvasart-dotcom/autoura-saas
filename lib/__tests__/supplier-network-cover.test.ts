import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { bySourcing } from '@/lib/supplier-network'

const read = (p: string) => readFileSync(p, 'utf8')
const opts = [{ id: 'own1' }, { id: 'net1', network: true }, { id: 'own2' }, { id: 'net2', network: true }]

describe('Who covers it follows the agency’s sourcing (§7)', () => {
  it('own → no network suppliers', () => {
    expect(bySourcing(opts, 'own').map(o => o.id)).toEqual(['own1', 'own2'])
    expect(bySourcing(opts, null).map(o => o.id)).toEqual(['own1', 'own2'])
  })
  it('network → only network suppliers', () => {
    expect(bySourcing(opts, 'network').map(o => o.id)).toEqual(['net1', 'net2'])
  })
  it('both → own first, then network', () => {
    expect(bySourcing(opts, 'both').map(o => o.id)).toEqual(['own1', 'own2', 'net1', 'net2'])
  })
  it('the route marks network copies and filters by the setting; own cars and guides are separate and always offered', () => {
    const r = read('app/api/bookings/[id]/suppliers/[lineId]/cover/route.ts')
    expect(r).toContain('bySourcing([')
    expect(r).toContain('network: networkIds.has(')
    expect(r).toMatch(/own: own\.map\(/)
  })
  it('the picker shows a separate Network group and a link to find more', () => {
    const p = read('components/booking/CoverLinePicker.tsx')
    expect(p).toContain('Network suppliers (verified by Autoura — agree the price)')
    expect(p).toContain('Find more in the network →')
  })
})
