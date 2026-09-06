import { describe, it, expect } from 'vitest'
import { groupVehicleRowsToTiers } from '@/app/api/pricing-grid/rates/route'
import { buildTransportTierIndex } from '@/app/pricing-grid/lib/calculator'

// Option B: this app stores transportation_rates as ONE ROW PER VEHICLE.
// groupVehicleRowsToTiers() turns those rows into the `${rowId}__${tier}` option
// shape the grid's tier index expects — read-only, no schema change. Grouping
// key mirrors travel-ops-pro migration 20260205.

const cairoDayTour = [
  { id: 'r-sedan',   created_at: '2026-01-01', service_type: 'day_tour', city: 'Cairo', route_name: 'Cairo Day Tour', vehicle_type: 'Sedan',   base_rate_eur: 50,  base_rate_non_eur: 45,  capacity_min: 1,  capacity_max: 2 },
  { id: 'r-minivan', created_at: '2026-01-02', service_type: 'day_tour', city: 'Cairo', route_name: 'Cairo Day Tour', vehicle_type: 'Minivan', base_rate_eur: 70,  base_rate_non_eur: 65,  capacity_min: 3,  capacity_max: 7 },
  { id: 'r-bus',     created_at: '2026-01-03', service_type: 'day_tour', city: 'Cairo', route_name: 'Cairo Day Tour', vehicle_type: 'Bus',     base_rate_eur: 200, base_rate_non_eur: 190, capacity_min: 21, capacity_max: 45 },
]

describe('groupVehicleRowsToTiers — sibling per-vehicle rows → grid tier set', () => {
  it('groups one route’s vehicles under a single keeper rowId with per-tier rates', () => {
    const opts = groupVehicleRowsToTiers(cairoDayTour)
    expect(opts).toHaveLength(3)
    // keeper = earliest created_at = r-sedan → every option shares that rowId
    expect(opts.every((o) => o.id.startsWith('r-sedan__'))).toBe(true)
    expect(opts.map((o) => o.id)).toEqual(['r-sedan__sedan', 'r-sedan__minivan', 'r-sedan__bus'])
    expect(opts.find((o) => o.id === 'r-sedan__sedan')).toMatchObject({
      rateEur: 50, rateNonEur: 45, capacity_min: 1, capacity_max: 2,
    })
  })

  it('feeds buildTransportTierIndex so the vehicle re-selects by pax', () => {
    const idx = buildTransportTierIndex(groupVehicleRowsToTiers(cairoDayTour) as any)
    const tiers = idx.get('r-sedan')
    expect(tiers).toBeDefined()
    expect(tiers).toHaveLength(3)
    const sorted = [...tiers!].sort((a, b) => a.capMin - b.capMin)
    expect(sorted.map((t) => [t.capMin, t.capMax, t.rateEur, t.rateNonEur])).toEqual([
      [1, 2, 50, 45],
      [3, 7, 70, 65],
      [21, 45, 200, 190],
    ])
  })

  it('separate routes get separate keepers', () => {
    const opts = groupVehicleRowsToTiers([
      ...cairoDayTour,
      { id: 'r2', created_at: '2026-02-01', service_type: 'intercity_transfer', origin_city: 'Cairo', destination_city: 'Luxor', vehicle_type: 'Van', base_rate_eur: 300, base_rate_non_eur: 280, capacity_min: 8, capacity_max: 12 },
    ])
    const rowIds = new Set(opts.map((o) => o.id.split('__')[0]))
    expect(rowIds).toEqual(new Set(['r-sedan', 'r2']))
  })

  it('falls back to the canonical capacity band when a row’s capacity is null, and mirrors EUR when non-EUR is missing', () => {
    const [opt] = groupVehicleRowsToTiers([
      { id: 'x', service_type: 'day_tour', city: 'Aswan', vehicle_type: 'minivan', base_rate_eur: 80, base_rate_non_eur: null, capacity_min: null, capacity_max: null },
    ])
    expect(opt).toMatchObject({ id: 'x__minivan', capacity_min: 3, capacity_max: 7, rateEur: 80, rateNonEur: 80 })
  })

  it('keeps an unknown vehicle type (does not drop the rate)', () => {
    const opts = groupVehicleRowsToTiers([
      { id: 'edfu', service_type: 'day_tour', city: 'Edfu', vehicle_type: 'Horse Carriage', base_rate_eur: 25, base_rate_non_eur: 25, capacity_min: 1, capacity_max: 4 },
    ])
    expect(opts).toHaveLength(1)
    expect(opts[0].id).toBe('edfu__horse_carriage')
    expect(opts[0]).toMatchObject({ capacity_min: 1, capacity_max: 4, rateEur: 25 })
  })

  it('skips vehicle rows with no usable rate', () => {
    const opts = groupVehicleRowsToTiers([
      { id: 'r-sedan', service_type: 'day_tour', city: 'Cairo', vehicle_type: 'Sedan', base_rate_eur: 0, base_rate_non_eur: 0, capacity_min: 1, capacity_max: 2 },
    ])
    expect(opts).toHaveLength(0)
  })

  // One row per vehicle since migration 337 — an agency's own vehicle
  // ("coaster") is a tier like any other, with the row's own band.
  it('offers an agency-named vehicle from its own row and band', () => {
    const opts = groupVehicleRowsToTiers([
      { id: 'c1', created_at: '2026-03-01', service_type: 'day_tour', city: 'Luxor', route_name: 'Luxor West Bank',
        vehicle_type: 'coaster', base_rate_eur: 150, base_rate_non_eur: null, capacity_min: 13, capacity_max: 24 },
      { id: 'c2', created_at: '2026-03-02', service_type: 'day_tour', city: 'Luxor', route_name: 'Luxor West Bank',
        vehicle_type: 'sedan', base_rate_eur: 40, base_rate_non_eur: 40, capacity_min: 1, capacity_max: 2 },
    ])
    expect(opts.map((o) => o.id).sort()).toEqual(['c1__coaster', 'c1__sedan'])
    expect(opts.find((o) => o.id === 'c1__coaster')).toMatchObject({ rateEur: 150, rateNonEur: 150, capacity_min: 13, capacity_max: 24 })
    const idx = buildTransportTierIndex(opts as Parameters<typeof buildTransportTierIndex>[0])
    const sorted = [...idx.get('c1')!].sort((a, b) => a.capMin - b.capMin)
    expect(sorted.map((t) => [t.capMin, t.capMax, t.rateEur])).toEqual([[1, 2, 40], [13, 24, 150]])
  })
})
