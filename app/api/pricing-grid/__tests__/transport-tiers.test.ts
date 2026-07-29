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

  // WIDE rows (route-first entry form + bulk importer): one row per route,
  // per-class rate columns, no base_rate_eur. Before expandWideRows these were
  // silently invisible to the grid.
  it('expands a wide route row into per-class tier options', () => {
    const opts = groupVehicleRowsToTiers([
      {
        id: 'w1', created_at: '2026-03-01', service_type: 'day_tour', city: 'Cairo', route_name: 'Cairo Day Tour',
        vehicle_type: null, base_rate_eur: null,
        sedan_rate_eur: 50, sedan_rate_non_eur: 45, sedan_capacity_min: 1, sedan_capacity_max: 2,
        van_rate_eur: 90, van_rate_non_eur: 85, van_capacity_min: 8, van_capacity_max: 14,
        bus_rate_eur: 200, bus_rate_non_eur: null, bus_capacity_min: null, bus_capacity_max: null,
      },
    ])
    expect(opts.map((o) => o.id)).toEqual(['w1__sedan', 'w1__van', 'w1__bus'])
    expect(opts.find((o) => o.id === 'w1__sedan')).toMatchObject({ rateEur: 50, rateNonEur: 45, capacity_min: 1, capacity_max: 2 })
    // missing non-EUR mirrors EUR; missing capacities fall back to the canonical band
    expect(opts.find((o) => o.id === 'w1__bus')).toMatchObject({ rateEur: 200, rateNonEur: 200 })
    // vehicle classes with no rate are simply not offered
    expect(opts.some((o) => o.id.includes('minivan') || o.id.includes('minibus'))).toBe(false)
  })

  it('feeds the tier index from a wide row so per-pax re-selection works', () => {
    const idx = buildTransportTierIndex(groupVehicleRowsToTiers([
      {
        id: 'w2', service_type: 'day_tour', city: 'Luxor', route_name: 'Luxor West Bank',
        sedan_rate_eur: 40, sedan_capacity_min: 1, sedan_capacity_max: 2,
        minibus_rate_eur: 150, minibus_capacity_min: 15, minibus_capacity_max: 20,
      },
    ]) as Parameters<typeof buildTransportTierIndex>[0])
    const tiers = idx.get('w2')
    expect(tiers).toHaveLength(2)
    const sorted = [...tiers!].sort((a, b) => a.capMin - b.capMin)
    expect(sorted.map((t) => [t.capMin, t.capMax, t.rateEur])).toEqual([
      [1, 2, 40],
      [15, 20, 150],
    ])
  })

  it('a mixed batch keeps tall rows tall and expands wide rows', () => {
    const opts = groupVehicleRowsToTiers([
      ...cairoDayTour,
      {
        id: 'w3', service_type: 'intercity_transfer', origin_city: 'Cairo', destination_city: 'Alexandria',
        van_rate_eur: 120, van_capacity_min: 8, van_capacity_max: 14,
      },
    ])
    const rowIds = new Set(opts.map((o) => o.id.split('__')[0]))
    expect(rowIds).toEqual(new Set(['r-sedan', 'w3']))
    expect(opts).toHaveLength(4)
  })
})
