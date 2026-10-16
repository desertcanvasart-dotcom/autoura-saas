import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PACKAGE_TYPE_CONFIGS } from '@/lib/package-types'
import { packageRules } from '@/lib/ai/package-prompt-rules'
import { applyPackageToDays, describeRemoved } from '@/app/pricing-grid/lib/package-apply'

const pkg = (slug: string) => PACKAGE_TYPE_CONFIGS.find(p => p.slug === slug)!

describe('every package is its own product', () => {
  it('no two packages tell the parser the same thing', () => {
    const prompts = PACKAGE_TYPE_CONFIGS.map(p => packageRules(p).split('\n').slice(2).join('\n'))
    expect(new Set(prompts).size).toBe(PACKAGE_TYPE_CONFIGS.length)
  })
  it('day trips keep one base; shore excursions start at the port; cruise + land needs a cruise', () => {
    expect(packageRules(pkg('day-trips'))).toMatch(/ONE base/)
    expect(packageRules(pkg('tours-only'))).not.toMatch(/ONE base/)
    expect(packageRules(pkg('shore-excursions'))).toMatch(/cruise port/)
    expect(packageRules(pkg('cruise-land'))).toMatch(/CRUISE INCLUDED/)
    expect(packageRules(pkg('full-package'))).toMatch(/Full package: the day templates/)
  })
})

describe('the parser scrubs transport by its type', () => {
  it('drops airport transfers and overnight moves a package does not sell', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/pricing-grid/parse/route.ts'), 'utf8')
    expect(src).toContain("dropRoutes(day, airportRows)")
    expect(src).toContain("if (!pkg.includes.overnightMoves) dropRoutes(day, overnightMoveRows)")
  })
})

describe('switching package on the grid', () => {
  const item = (rateId: string, serviceType?: string) => ({ rateId, name: rateId, rateEur: 1, rateNonEur: 1, serviceType })
  const day = {
    id: 'd', dayNumber: 1, title: '', city: 'Cairo', description: '', isExpanded: false,
    slots: [
      { slotId: 'accommodation', selectedItems: [item('mena')], customAmount: 0 },
      { slotId: 'airport_services', selectedItems: [item('meet')], customAmount: 0 },
      { slotId: 'route', selectedItems: [item('arr', 'airport_transfer'), item('tour', 'day_tour'), item('drop', 'intercity_dropoff')], customAmount: 0 },
    ],
  } as never

  it('Land Package removes the airport, keeps hotels and tours', () => {
    const r = applyPackageToDays([day], pkg('land-package'))
    const slots = (r.days[0] as { slots: Array<{ slotId: string; selectedItems: Array<{ rateId: string }> }> }).slots
    expect(slots.find(s => s.slotId === 'route')!.selectedItems.map(i => i.rateId)).toEqual(['tour', 'drop'])
    expect(slots.find(s => s.slotId === 'accommodation')!.selectedItems).toHaveLength(1)
    expect(describeRemoved(r.removed)).toBe('2 airport services')
  })

  it('Day Trips removes hotels, airport and overnight moves', () => {
    const r = applyPackageToDays([day], pkg('day-trips'))
    expect(r.removed).toEqual({ hotels: 1, airport: 2, overnightMoves: 1, cruises: 0 })
    expect(describeRemoved(r.removed)).toBe('1 hotel night, 2 airport services and 1 overnight transfer to another city')
  })

  it('Full Package removes nothing', () => {
    expect(describeRemoved(applyPackageToDays([day], pkg('full-package')).removed)).toBe('')
  })
})
