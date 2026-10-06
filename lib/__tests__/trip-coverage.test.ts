import { describe, it, expect } from 'vitest'
import { dayNeeds, tripCoverage, type CoverageDay } from '@/lib/itineraries/coverage'
import { tripAttention } from '@/lib/itineraries/trip-stage'

const days: CoverageDay[] = [
  { id: 'd1', day_number: 1, date: '2026-10-01', services: [{ service_type: 'transfer', service_name: 'Meet & assist' }, { service_type: 'accommodation', service_name: 'Mena House' }] },
  { id: 'd2', day_number: 2, date: '2026-10-02', services: [{ service_type: 'guide', service_name: 'Egyptologist' }, { service_type: 'other', service_name: 'Van 8h', description: '[pricing-grid:route] Cairo day' }] },
  { id: 'd3', day_number: 3, date: '2026-10-03', services: [{ service_type: 'guide', service_name: 'Egyptologist' }, { service_type: 'transportation', service_name: 'Van Cairo–Alexandria' }] },
  { id: 'd4', day_number: 4, date: '2026-10-04', services: [{ service_type: 'tips', service_name: 'Tips' }] },
]

describe('what a day needs', () => {
  it('a guide line needs a guide, a transport line (or the grid route slot) a vehicle, an airport service airport staff', () => {
    expect([...dayNeeds(days[0].services)]).toEqual(['airport_staff'])
    expect([...dayNeeds(days[1].services)].sort()).toEqual(['guide', 'vehicle'])
    expect([...dayNeeds(days[3].services)]).toEqual([])
  })

  it('a hotel night is booked with the suppliers, not assigned here', () => {
    expect(dayNeeds([{ service_type: 'accommodation', service_name: 'Mena House' }]).size).toBe(0)
  })
})

describe('the coverage grid', () => {
  it('only the types the trip uses; assigned by date range or by day; missing vs not needed', () => {
    const rows = tripCoverage(days, [
      { resource_type: 'guide', resource_name: 'Amr', start_date: '2026-10-02', end_date: '2026-10-02', status: 'confirmed' },
      { resource_type: 'vehicle', resource_name: 'Van 1', start_date: '2026-10-01', end_date: '2026-10-04', status: 'confirmed' },
      { resource_type: 'driver', resource_name: 'Hassan', itinerary_day_id: 'd3', start_date: '2026-10-01', status: 'confirmed' },
      { resource_type: 'guide', resource_name: 'Old', start_date: '2026-10-03', status: 'cancelled' },
    ])
    expect(rows.map(r => r.type)).toEqual(['guide', 'vehicle', 'driver', 'airport_staff'])
    const guide = rows[0]
    expect(guide.cells.map(c => c.state)).toEqual(['not_needed', 'assigned', 'missing', 'not_needed'])
    expect(guide.missing).toEqual([3])
    // A vehicle on a day that needs none still shows as assigned.
    expect(rows[1].cells.map(c => c.state)).toEqual(['assigned', 'assigned', 'assigned', 'assigned'])
    // A driver is never "missing": often the vehicle's own.
    expect(rows[2].cells.map(c => c.state)).toEqual(['not_needed', 'not_needed', 'assigned', 'not_needed'])
    expect(rows[3].missing).toEqual([1])
  })

  it('an assignment with no end date covers its start day only', () => {
    const rows = tripCoverage(days, [{ resource_type: 'guide', resource_name: 'Amr', start_date: '2026-10-02', status: 'confirmed' }])
    expect(rows[0].missing).toEqual([3])
  })
})

describe('missing resources in "needs attention"', () => {
  const base = {
    status: 'confirmed', hasBooking: true, hasInvoice: true, invoiced: 100, paid: 100,
    startDate: '2026-10-10', endDate: '2026-10-14', currency: 'EUR', staleNights: [], cruiseNotes: [],
    missingResources: [{ label: 'Guide', days: [2, 3] }, { label: 'Airport staff', days: [1] }],
  }

  it('within two weeks of a booked trip, each gap is said, with Assign', () => {
    expect(tripAttention({ ...base, today: '2026-10-01' })).toEqual([
      { severity: 'warning', message: 'No guide assigned for days 2 and 3.', action: { kind: 'assign_resources', label: 'Assign' } },
      { severity: 'warning', message: 'No airport staff assigned for day 1.', action: { kind: 'assign_resources', label: 'Assign' } },
    ])
  })

  it('not months ahead, not on a quote, not after the trip', () => {
    expect(tripAttention({ ...base, today: '2026-08-01' })).toEqual([])
    expect(tripAttention({ ...base, status: 'sent', hasBooking: false, hasInvoice: false, invoiced: null, paid: null, today: '2026-10-01' })).toEqual([])
    expect(tripAttention({ ...base, status: 'completed', today: '2026-10-20' })).toEqual([])
  })
})
