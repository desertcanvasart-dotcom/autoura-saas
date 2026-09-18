import { describe, it, expect } from 'vitest'
import { toApprovedGaps, unapprovedGaps, sharePriceDecision } from '@/lib/itineraries/share-approval'
import type { QuoteGap } from '@/lib/pricing/quote-completeness'

// ============================================
// A share link remembers what was approved
// ============================================
// A link for an itinerary with unpriced services is created only when the
// operator says "share anyway". Before this, that approval was not recorded and
// the public page never looked again: a service that lost its cost AFTER the
// link went out still showed the traveller a total that left it out.

const gap = (day: number | null, name: string): QuoteGap => ({ day, name, issue: 'No cost entered.' })
const complete = { complete: true, gaps: [] }
const withGaps = (gaps: QuoteGap[]) => ({ complete: false, gaps })

const base = { status: 'confirmed', totalCost: 2400, currency: 'EUR' }

describe('unapprovedGaps', () => {
  const gaps = [gap(1, 'Airport transfer'), gap(2, 'Lunch')]

  it('nothing approved covers nothing', () => {
    expect(unapprovedGaps(gaps, null)).toHaveLength(2)
    expect(unapprovedGaps(gaps, 'garbage')).toHaveLength(2)
    expect(unapprovedGaps(gaps, [{ nonsense: true }])).toHaveLength(2)
  })

  it('matches on day and name, ignoring case and spacing', () => {
    expect(unapprovedGaps(gaps, [{ day: 1, name: ' airport TRANSFER ' }, { day: 2, name: 'Lunch' }])).toEqual([])
  })

  it('a gap on another day is not covered', () => {
    expect(unapprovedGaps(gaps, [{ day: 1, name: 'Airport transfer' }, { day: 3, name: 'Lunch' }]).map(g => g.day))
      .toEqual([2])
  })

  it('counts: approving one Lunch does not cover a second one added later', () => {
    const twice = [...gaps, gap(2, 'Lunch')]
    expect(unapprovedGaps(twice, [{ day: 1, name: 'Airport transfer' }, { day: 2, name: 'Lunch' }]).map(g => g.name))
      .toEqual(['Lunch'])
    expect(unapprovedGaps(twice, toApprovedGaps(twice))).toEqual([])
  })

  it('survives the round trip through the database', () => {
    expect(unapprovedGaps(gaps, JSON.parse(JSON.stringify(toApprovedGaps(gaps))))).toEqual([])
  })
})

describe('sharePriceDecision', () => {
  it('shows the price for a complete, priced itinerary', () => {
    expect(sharePriceDecision({ ...base, completeness: complete, approvedGaps: null })).toEqual({ show: true })
  })

  it('shows it when every current gap was approved', () => {
    const gaps = [gap(1, 'Airport transfer'), gap(2, 'Lunch')]
    expect(sharePriceDecision({ ...base, completeness: withGaps(gaps), approvedGaps: toApprovedGaps(gaps) }))
      .toEqual({ show: true })
  })

  it('withholds it when a gap appeared after the approval, naming it', () => {
    const gaps = [gap(1, 'Airport transfer'), gap(2, 'Lunch')]
    const d = sharePriceDecision({ ...base, completeness: withGaps(gaps), approvedGaps: [{ day: 1, name: 'Airport transfer' }] })
    expect(d.show).toBe(false)
    if (!d.show) {
      expect(d.reason).toBe('new_gaps')
      expect(d.gaps?.map(g => g.name)).toEqual(['Lunch'])
    }
  })

  it('withholds it on a draft, and on an unusable amount', () => {
    expect(sharePriceDecision({ ...base, status: 'draft', completeness: complete, approvedGaps: null }))
      .toMatchObject({ show: false, reason: 'draft' })
    for (const totalCost of [0, null, '', 'abc', -50]) {
      expect(sharePriceDecision({ ...base, totalCost, completeness: complete, approvedGaps: null }), String(totalCost))
        .toMatchObject({ show: false, reason: 'amount' })
    }
  })

  it('FAILS CLOSED when the services could not be read', () => {
    expect(sharePriceDecision({ ...base, completeness: null, approvedGaps: null }))
      .toEqual({ show: false, reason: 'unchecked' })
  })

  it('an old link with no record withholds the price as soon as a gap exists', () => {
    // Every link that already exists has approvedGaps null — the safe reading.
    expect(sharePriceDecision({ ...base, completeness: withGaps([gap(1, 'Guide')]), approvedGaps: null }))
      .toMatchObject({ show: false, reason: 'new_gaps' })
  })
})
