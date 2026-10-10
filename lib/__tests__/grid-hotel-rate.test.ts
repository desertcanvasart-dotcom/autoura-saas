import { describe, it, expect } from 'vitest'
import { gridHotelRate } from '@/lib/rates/grid-hotel-rate'

// A hotel saved through Rates → Hotels: periods, mirrored onto ppd_eur —
// pp_double_eur (the importer's column) never written.
const formHotel = {
  property_name: 'Barcelo Cairo Pyramids', city: 'Cairo', tier: 'budget',
  ppd_eur: 40, single_supplement_eur: 25, pp_double_eur: null,
  seasons: [
    { name: 'Summer', from: '2026-05-01', to: '2026-09-30', rates: { ppd_eur: 40, ppd_non_eur: 45, single_supplement_eur: 25, single_supplement_non_eur: 28, triple_reduction_eur: 0, triple_reduction_non_eur: 0, guide_rate_eur: 15 } },
    { name: 'Winter', from: '2026-10-01', to: '2027-04-30', rates: { ppd_eur: 55, ppd_non_eur: 60, single_supplement_eur: 30, single_supplement_non_eur: 33, triple_reduction_eur: 0, triple_reduction_non_eur: 0, guide_rate_eur: 0 } },
  ],
}

describe('gridHotelRate', () => {
  it('prices a hotel saved through the periods form (was €0.00 in the grid)', () => {
    const r = gridHotelRate(formHotel)
    expect(r).toMatchObject({ ppdEur: 40, ppdNonEur: 45, singleSuppEur: 25, singleSuppNonEur: 28, guideRateEur: 15, periodName: 'Summer', gapDate: null })
  })

  it('takes the period covering the trip start date', () => {
    const r = gridHotelRate(formHotel, '2026-10-08')
    expect(r).toMatchObject({ ppdEur: 55, ppdNonEur: 60, singleSuppEur: 30, periodName: 'Winter' })
    // 0 in a period is "no concession", never a free bed.
    expect(r.guideRateEur).toBeNull()
  })

  it('a start date between the periods is a gap, not another period’s price', () => {
    const r = gridHotelRate(formHotel, '2027-06-01')
    expect(r).toMatchObject({ ppdEur: 0, ppdNonEur: 0, gapDate: '2027-06-01' })
  })

  it('a CSV-imported hotel keeps its pp_double price', () => {
    const r = gridHotelRate({ pp_double_eur: 70, pp_double_non_eur: 80, single_supp_eur: 35, single_supp_non_eur: null })
    expect(r).toMatchObject({ ppdEur: 70, ppdNonEur: 80, singleSuppEur: 35, singleSuppNonEur: 35, periodName: null, gapDate: null })
  })
})
