import { describe, it, expect } from 'vitest'
import { ratePeriodLines } from '@/lib/rates/rate-seasons'

// ============================================
// Every period, on its own line
// ============================================
// The hotel list showed today's period and the peak as two numbers plus a
// COUNT; the cruise list showed the base columns, which the periods editor
// leaves null. Either way an operator could not check the periods they had
// typed from a contract, and a period with a blank nightly rate — the one the
// engine refuses to price — looked exactly like a priced one.

const season = (name: string, from: string, to: string, ppd: number, nonEur = ppd) => ({
  name, from, to,
  rates: { ppd_eur: ppd, ppd_non_eur: nonEur, single_supplement_eur: 0, triple_reduction_eur: 0 },
})

const hotel = (seasons: unknown[]) => ({ seasons })

describe('ratePeriodLines', () => {
  it('returns one line per period, in order, with both passports', () => {
    const lines = ratePeriodLines(
      hotel([season('Winter', '2027-01-01', '2027-02-28', 120, 130), season('Summer', '2027-06-01', '2027-08-31', 90)]),
      'accommodation',
      '2027-01-15'
    )
    expect(lines.map(l => l.name)).toEqual(['Winter', 'Summer'])
    expect(lines[0]).toMatchObject({ from: '2027-01-01', to: '2027-02-28', eur: 120, nonEur: 130, blank: false })
    expect(lines[1]).toMatchObject({ eur: 90, nonEur: 90 })
  })

  it('marks the period that covers today', () => {
    const lines = ratePeriodLines(
      hotel([season('Winter', '2027-01-01', '2027-02-28', 120), season('Summer', '2027-06-01', '2027-08-31', 90)]),
      'accommodation',
      '2027-07-04'
    )
    expect(lines.map(l => l.current)).toEqual([false, true])
  })

  it('marks a blank rate, which is what the engine refuses to price', () => {
    const lines = ratePeriodLines(hotel([season('Winter', '2027-01-01', '2027-02-28', 0)]), 'accommodation', '2027-01-15')
    expect(lines[0].blank).toBe(true)
    expect(lines[0].eur).toBeNull()
  })

  it('marks no period as current when today falls between them', () => {
    const lines = ratePeriodLines(
      hotel([season('Winter', '2027-01-01', '2027-02-28', 120), season('Summer', '2027-06-01', '2027-08-31', 90)]),
      'accommodation',
      '2027-04-10'
    )
    expect(lines.some(l => l.current)).toBe(false)
  })

  it('is empty for a row with no periods, so the list can say so', () => {
    expect(ratePeriodLines({ ppd_eur: 100 }, 'accommodation')).toEqual([])
    expect(ratePeriodLines({}, 'cruise')).toEqual([])
  })
})
