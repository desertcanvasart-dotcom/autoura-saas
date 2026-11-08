// Land packages in the Quote Builder (migration 462): a day block that is day
// N of a package lays the package down on its first day and leaves off what it
// includes; the form validator; the tour day editor's field.
import { describe, it, expect } from 'vitest'
import { applyBlockToGridDay, type GridBlock } from '@/lib/day-blocks/grid-apply'
import { SLOT_DEFINITIONS, type AllRates, type GridDay } from '@/app/pricing-grid/types'
import { landPackageOptionId, type LandPackageRow } from '@/lib/pricing/land-package'
import { validateLandPackage } from '@/lib/rates/land-package-input'
import { applyDayForm } from '@/lib/tours/day-edit'

const PKG: LandPackageRow = {
  id: 'pk1', package_name: 'Bahariya desert safari (camp)', city: 'Bahariya', start_city: 'Cairo',
  duration_days: 2, night_places: ['camp'],
  meals: [{ breakfast: false, lunch: true, dinner: true }, { breakfast: true, lunch: false, dinner: false }],
  includes_transport: true, includes_local_vehicle: true, includes_guide: true, includes_entrance: true,
  covered_attractions: ['White Desert', 'Crystal Mountain'], base_rate_eur: 120, base_rate_non_eur: 120,
}

const day = (): GridDay => ({
  id: 'd', dayNumber: 2, title: '', city: '', description: '', isExpanded: false,
  slots: SLOT_DEFINITIONS.map(def => ({ slotId: def.slotId, selectedItems: [], customAmount: 0 })),
})
const rates = {
  route: [
    { id: 'road__sedan', name: 'Sedan Cairo → Bahariya', rateEur: 90, rateNonEur: 90, service_type: 'intercity_dropoff', city: 'Cairo', origin_city: 'Cairo', destination_city: 'Bahariya', capacity_min: 1, capacity_max: 4 },
    { id: 'tour__sedan', name: 'Sedan day tour Bahariya', rateEur: 40, rateNonEur: 40, service_type: 'day_tour', city: 'Bahariya', origin_city: 'Bahariya', capacity_min: 1, capacity_max: 4 },
  ],
  guide: [{ id: 'g-bah', name: 'English (Egyptologist)', rateEur: 50, rateNonEur: 50, city: 'Bahariya' }],
  airport_services: [], hotel_services: [], tipping: [], boat_rides: [], water: [], cruise: [], flights: [],
  experiences: [{ id: landPackageOptionId('pk1'), name: 'Bahariya desert safari (camp) — 2 days / 1 night', rateEur: 120, rateNonEur: 120, city: 'Bahariya', pricing_basis: 'per_person', land_package: PKG }],
  accommodation: [{ id: 'h-bah', name: 'Oasis Lodge', rateEur: 35, rateNonEur: 35, city: 'Bahariya' }],
  entrance_fees: [
    { id: 'f-wd', name: 'White Desert', rateEur: 5, rateNonEur: 5, city: 'Bahariya' },
    { id: 'f-hs', name: 'Hot Spring', rateEur: 3, rateNonEur: 3, city: 'Bahariya' },
  ],
  meals: [
    { id: 'm-l', name: 'Lunch - Oasis (Bahariya)', rateEur: 12, rateNonEur: 12, city: 'Bahariya', category: 'Lunch' },
    { id: 'm-d', name: 'Dinner - Oasis (Bahariya)', rateEur: 15, rateNonEur: 15, city: 'Bahariya', category: 'Dinner' },
  ],
} as unknown as AllRates

const block = (over: Partial<GridBlock> = {}): GridBlock => ({
  code: 'CAI-BAH-1', name: 'Cairo to Bahariya & White Desert', shorthand: [], day_type: 'transfer', city: 'Bahariya', to_city: null,
  night: 'included', night_place: 'White Desert camp', attractions: ['White Desert', 'Hot Spring'], photo_stops: [], guide: 'egyptologist',
  meals: { breakfast: { included: false, venue: null }, lunch: { included: true, venue: 'restaurant' }, dinner: { included: true, venue: 'restaurant' } },
  transport: 'road Cairo-Bahariya + 4x4', assistance: [], optional_extras: [], description: null, notes: null, source: null,
  ...over,
})
const ids = (d: GridDay, slot: string) => d.slots.find(s => s.slotId === slot)!.selectedItems.map(i => i.rateId)

describe('a day block that is day 1 of a land package', () => {
  const { day: d, filled, toPick } = applyBlockToGridDay(day(), block({ land_package_id: 'pk1', land_package_day: 1 }), rates, 2)

  it('puts the package in, priced per person', () => {
    expect(ids(d, 'experiences')).toEqual([landPackageOptionId('pk1')])
    expect(d.slots.find(s => s.slotId === 'experiences')!.selectedItems[0].pricingBasis).toBe('per_person')
  })
  it('leaves off the car, the guide, the night and its meals', () => {
    expect(ids(d, 'route')).toEqual([])
    expect(ids(d, 'guide')).toEqual([])
    expect(ids(d, 'accommodation')).toEqual([])
    expect(ids(d, 'meals')).toEqual([])
    expect(filled).toEqual(expect.arrayContaining(['transport (in the package)', 'guide (in the package)', 'night (in the package: desert camp)']))
  })
  it('charges only the sights its ticket does not cover', () => {
    expect(ids(d, 'entrance_fees')).toEqual(['f-hs'])
  })
  it('asks the operator to pick nothing it covers', () => {
    expect(toPick.join()).not.toMatch(/Road|Guide|Day tour|Lunch|Dinner/)
  })
})

describe('day 2 of the package', () => {
  it('is not charged the package again', () => {
    const { day: d } = applyBlockToGridDay(day(), block({ land_package_id: 'pk1', land_package_day: 2, night: 'move', to_city: 'Cairo' }), rates, 2)
    expect(ids(d, 'experiences')).toEqual([])
    expect(ids(d, 'route')).toEqual([])
  })
})

describe('without the package', () => {
  it('the same block is priced piece by piece, as before', () => {
    const { day: d } = applyBlockToGridDay(day(), block(), rates, 2)
    expect(ids(d, 'guide')).toEqual(['g-bah'])
    expect(ids(d, 'meals')).toEqual(['m-l', 'm-d'])
    expect(ids(d, 'entrance_fees')).toEqual(['f-wd', 'f-hs'])
    expect(ids(d, 'experiences')).toEqual([])
  })
  it('a package that is gone is listed for the operator', () => {
    const r = applyBlockToGridDay(day(), block({ land_package_id: 'gone', land_package_day: 1 }), rates, 2)
    expect(r.toPick.join()).toMatch(/Land package/)
  })
})

describe('the Land packages form', () => {
  const ok = { package_name: 'Bahariya (camp)', duration_days: 2, night_places: ['camp'], meals: [{ lunch: true, dinner: true }, { breakfast: true }], base_rate_eur: 4500 }
  it('saves a well-formed package, mirroring the price for non-EU', () => {
    const r = validateLandPackage(ok)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.row).toMatchObject({ duration_days: 2, night_places: ['camp'], base_rate_eur: 4500, base_rate_non_eur: 4500, includes_transport: true, includes_guide: true, includes_entrance: true })
      expect(r.row.meals).toEqual([{ breakfast: false, lunch: true, dinner: true }, { breakfast: true, lunch: false, dinner: false }])
    }
  })
  it('refuses a night count that does not match the days, an unknown place, a bad price', () => {
    expect(validateLandPackage({ ...ok, night_places: [] })).toMatchObject({ ok: false, error: expect.stringMatching(/1 night/) })
    expect(validateLandPackage({ ...ok, night_places: ['tent'] })).toMatchObject({ ok: false, error: expect.stringMatching(/not a night place/) })
    expect(validateLandPackage({ ...ok, base_rate_eur: -1 })).toMatchObject({ ok: false })
    expect(validateLandPackage({ ...ok, package_name: ' ' })).toMatchObject({ ok: false })
    expect(validateLandPackage({ ...ok, duration_days: 15, night_places: Array(14).fill('hotel') })).toMatchObject({ ok: false })
  })
  it('cleans the covered places: trimmed, no repeats', () => {
    const r = validateLandPackage({ ...ok, covered_attractions: [' White  Desert ', 'white desert', '', 'Hot Spring'] })
    expect(r.ok && r.row.covered_attractions).toEqual(['White Desert', 'Hot Spring'])
  })
})

describe('the tour day editor', () => {
  const form = { title: 'Day', description: '', meals: { breakfast: '', lunch: '', dinner: '' }, picked: [], activityIds: [], transportType: '', transportRateId: '', city: 'Bahariya', night: 'none', cityTransfer: false, length: '', propertiesByTier: {}, noSightseeing: false } as never
  it('stores a package starting on the day, and clears it', () => {
    const withIt = applyDayForm(null, { ...(form as object), landPackageId: 'pk1' } as never, 2)
    expect(withIt.land_package_id).toBe('pk1')
    expect(applyDayForm(withIt, { ...(form as object), landPackageId: '' } as never, 2)).not.toHaveProperty('land_package_id')
    expect(applyDayForm(withIt, form, 2).land_package_id).toBe('pk1') // not owned by the form → untouched
  })
})
