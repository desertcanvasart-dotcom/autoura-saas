// The Tours group checked against its docs: what the check found broken.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import { describe, it, expect } from 'vitest'
import { parseDaysCsv, serializeDaysCsv } from '@/lib/tours/itinerary-csv'
import { parseTemplatesCsv } from '@/lib/tours/template-csv'
import { pickTransportPackage } from '@/lib/b2b/price-variation'
import { packageVehicleTiers } from '@/lib/pricing/grid-rates'
import { buildTransportTierIndex } from '@/app/pricing-grid/lib/calculator'

const papa = (csv: string) => {
  const p = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() })
  return { data: p.data, errors: p.errors.map(e => ({ message: e.message })) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const day = (n: number, city: string) => ({
  day: n, city, accommodation_type: n === 3 ? 'none' : 'hotel',
  meals: { breakfast: 'included', lunch: 'none', dinner: 'none' },
  attractions: [`Site ${n}`],
  services: { airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: true },
})
const threeDays = [{ template_code: 'CAI-3', itinerary: [day(1, 'Cairo'), day(2, 'Cairo'), day(3, 'Cairo')] }]

/** The days sheet with one cell of one day changed. */
function withCell(dayNo: number, label: string, value: string): string {
  const parsed = Papa.parse<Record<string, string>>(serializeDaysCsv(threeDays), { header: true, skipEmptyLines: true })
  const row = parsed.data.find(r => r.Day === String(dayNo))!
  row[label] = value
  return Papa.unparse(parsed.data)
}

describe('Import Days never writes a tour with a refused day', () => {
  it('a refused LAST day refuses the whole tour (it used to pass 1..2 and delete day 3)', () => {
    const { byTemplate, refused } = parseDaysCsv(withCell(3, 'Dinner', ''), papa)
    expect(byTemplate.has('CAI-3')).toBe(false)
    expect(refused.map(r => r.reason).join('\n')).toMatch(/Dinner is not stated/)
    expect(refused.map(r => r.reason).join('\n')).toMatch(/"CAI-3": not imported — one of its days was refused/)
  })

  it('a clean sheet still imports all three days', () => {
    const { byTemplate, refused } = parseDaysCsv(serializeDaysCsv(threeDays), papa)
    expect(refused).toEqual([])
    expect(byTemplate.get('CAI-3')).toHaveLength(3)
  })

  it('a typo in a yes/no column is refused, not read as false', () => {
    const { byTemplate, refused } = parseDaysCsv(withCell(2, 'Guide', 'ture'), papa)
    expect(byTemplate.has('CAI-3')).toBe(false)
    expect(refused[0].reason).toMatch(/Guide "ture" — a yes\/no column takes true or false/)
  })

  it('yes / no / 1 / 0 are still read', () => {
    const { byTemplate } = parseDaysCsv(withCell(2, 'Airport Arrival', 'no'), papa)
    expect(byTemplate.get('CAI-3')![1]).toMatchObject({ services: { airport_arrival: false } })
  })
})

describe('the tour sheet refuses cells it cannot hold', () => {
  it('a yes/no typo is refused rather than switching the tour off', () => {
    const { records, refused } = parseTemplatesCsv('Code,Name,Type,Duration Days,Active\nX-1,Foo,day_tour,1,ture\n', papa)
    expect(records).toEqual([])
    expect(refused[0].reason).toContain('Active "ture" is not true or false')
  })

  it('a non-number is refused rather than stored as nothing; 2.5 days is refused', () => {
    const { records, refused } = parseTemplatesCsv(
      'Code,Name,Type,Duration Days,Duration Nights\nX-1,Foo,day_tour,1,two\nX-2,Bar,day_tour,2.5,\n', papa)
    expect(records).toEqual([])
    expect(refused[0].reason).toContain('Duration Nights "two" is not a whole number')
    expect(refused[1].reason).toContain('Duration Days "2.5" is not a whole number')
  })

  it('inactive / false still switch a tour off', () => {
    const { records } = parseTemplatesCsv('Code,Name,Type,Duration Days,Active\nX-1,Foo,day_tour,1,inactive\n', papa)
    expect(records[0]).toMatchObject({ is_active: false })
  })
})

describe('the B2B calculator picks a transport package by the tour\'s route', () => {
  const luxAsw = { id: 'a', origin_city: 'Luxor', destination_city: 'Aswan' }
  const aswLux = { id: 'b', origin_city: 'Aswan', destination_city: 'Luxor' }

  it('the package whose origin and destination the tour covers, in order', () => {
    expect(pickTransportPackage([luxAsw, aswLux], ['Cairo', 'Aswan', 'Luxor'])).toBe(aswLux)
    expect(pickTransportPackage([luxAsw, aswLux], ['luxor', 'aswan'])).toBe(luxAsw)
  })
  it('no package on the route is none — a Cairo tour never takes the Luxor package', () => {
    expect(pickTransportPackage([luxAsw], ['Cairo', 'Alexandria'])).toBeNull()
  })
  it('no cities on record: only an unambiguous single package', () => {
    expect(pickTransportPackage([luxAsw], [])).toBe(luxAsw)
    expect(pickTransportPackage([luxAsw, aswLux], null)).toBeNull()
  })
})

describe('the pricing grid prices a package from its vehicles list', () => {
  const vocab = [
    { key: 'van', meta: { min_pax: 9, max_pax: 14 } },
    { key: 'sedan', meta: { min_pax: 1, max_pax: 2 } },
  ]
  const pkg = {
    id: 'pkg1', package_name: 'Nile', origin_city: 'Luxor', destination_city: 'Aswan', duration_days: 4,
    package_type: 'cruise_sightseeing',
    vehicles: [{ vehicle_type: 'sedan', rate: 100 }, { vehicle_type: 'van', rate: 260 }],
    sedan_rate: null,
  }

  it('one tiered option per vehicle, banded from the vocabulary (it read sedan_rate, null since mig 381)', () => {
    const opts = packageVehicleTiers([pkg], vocab, k => (k === 'van' ? 'Coach' : 'Car'))
    expect(opts.map(o => [o.id, o.rateEur, o.capacity_min, o.capacity_max])).toEqual([
      ['pkg1__sedan', 100, 1, 2],
      ['pkg1__van', 260, 9, 14],
    ])
    expect(String(opts[1].name)).toMatch(/^Coach \(9-14 pax\) — Transport package: Nile/)
    expect(opts.every(o => o.service_type === 'cruise_transport_package' && o.row_id === 'pkg1')).toBe(true)
    // The grid re-selects the vehicle by group size from these, as for a route.
    expect(buildTransportTierIndex(opts as never).get('pkg1')).toHaveLength(2)
  })

  it('a legacy row (five columns, no list) still prices', () => {
    const opts = packageVehicleTiers([{ ...pkg, vehicles: null, sedan_rate: 90, minivan_rate: 120 }], [])
    expect(opts.map(o => [o.id, o.rateEur])).toEqual([['pkg1__sedan', 90], ['pkg1__minivan', 120]])
  })
})

describe('who may change the catalogue', () => {
  const gated: Array<[string, string[]]> = [
    ['app/api/tours/templates/route.ts', ['POST']],
    ['app/api/tours/templates/[id]/route.ts', ['PUT', 'DELETE']],
    ['app/api/tours/variations/route.ts', ['POST']],
    ['app/api/tours/variations/[id]/services/route.ts', ['POST', 'PATCH', 'DELETE']],
    ['app/api/tours/bulk/import/route.ts', ['POST']],
    ['app/api/tours/bulk/import-days/route.ts', ['POST']],
  ]
  it.each(gated)('%s: every write checks the manage role (RLS checks only the tenant)', (file, methods) => {
    const src = read(file)
    for (const m of methods) {
      const body = src.slice(src.indexOf(`export async function ${m}(`)).split(/\nexport async function /)[0]
      expect(body, `${m} in ${file}`).toContain("roleDenied(authResult.role, 'manage')")
    }
  })

  it('the Tour Manager page is managers and admins, as the sidebar shows it', () => {
    expect(read('middleware.ts')).toContain("'/tours/manage': ['admin', 'manager']")
  })

  it('managers can open Transport Packages (the page checked admin only)', () => {
    const src = read('app/b2b/pricing-rules/page.tsx')
    expect(src).not.toMatch(/\bisAdmin\b/)
    expect(src).toContain('if (!isManager)')
    expect(src).toContain('{currencySymbol}{v.rate}')
  })

  it('a package PUT writes only the fields it was sent', () => {
    const src = read('app/api/b2b/transport-packages/[id]/route.ts')
    expect(src).toContain('if (body[key] !== undefined) update[key] = body[key]')
    expect(src).toContain('if (body.vehicles !== undefined) update.vehicles')
  })
})
