import { describe, it, expect } from 'vitest'
import { isGuideTip, soldItems } from '@/app/pricing-grid/lib/guide-rule'
import { fillTipRoles, type TipRoleReader } from '@/lib/pricing/tip-roles'
import { hydrateDayRates } from '@/app/pricing-grid/lib/hydrate-rates'
import { calculateDay } from '@/app/pricing-grid/lib/calculator'
import type { AllRates, GridConfig, GridDay } from '@/app/pricing-grid/types'

// ============================================================================
// Switching the guide off is meant to drop the guide's tips. The rule looked
// for "guide" in the tip's id — but a grid tip's id is its tipping_rates
// row's UUID, so no real tip ever matched: a trip sold without a guide still
// priced and saved the guide's tips. The tip's role (role_type) decides now.
// ============================================================================

const GUIDE_TIP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DRIVER_TIP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

describe('isGuideTip', () => {
  it.each([
    ['guide', true], ['Guide', true], ['tour_guide', true], ['cruise_guide', true],
    ['driver', false], ['boat_crew', false], ['other', false], ['guidebook_seller', false],
  ])('role %s → %s', (tipRole, expected) => {
    expect(isGuideTip({ rateId: GUIDE_TIP, tipRole })).toBe(expected)
  })
  it('a real tip’s UUID says nothing: without a role it is not the guide’s', () => {
    expect(isGuideTip({ rateId: GUIDE_TIP })).toBe(false)
  })
  it('a legacy item with no role still answers by its id', () => {
    expect(isGuideTip({ rateId: 'tip_guide' })).toBe(true)
    expect(isGuideTip({ rateId: 'tip_driver' })).toBe(false)
  })
})

describe('guide off drops the guide’s tips — real tipping rows', () => {
  const tips = { slotId: 'tipping', selectedItems: [
    { rateId: GUIDE_TIP, tipRole: 'guide', name: 'Tour guide - full day', rateEur: 10, rateNonEur: 10 },
    { rateId: DRIVER_TIP, tipRole: 'driver', name: 'Driver - full day', rateEur: 5, rateNonEur: 5 },
  ] }
  it('only the driver’s tip is sold', () => {
    expect(soldItems(tips, false).map(i => i.rateId)).toEqual([DRIVER_TIP])
    expect(soldItems(tips, true)).toHaveLength(2)
  })
  it('the price leaves it out too', () => {
    const day = { id: 'd', dayNumber: 1, title: '', city: '', description: '', isExpanded: false, slots: [{ ...tips, customAmount: 0 }] } as GridDay
    const cfg = (withGuide: boolean) => ({ pax: 2, passport: 'eu', withGuide, marginPercent: 0 }) as unknown as GridConfig
    expect(calculateDay(day, cfg(false)).groupTotal).toBe(5)
    expect(calculateDay(day, cfg(true)).groupTotal).toBe(15)
  })
})

describe('a tip picked before tips carried a role gets it', () => {
  it('on reload or a restored draft, from the rate list', () => {
    const rates = { tipping: [{ id: GUIDE_TIP, name: 'Tour guide - full day', rateEur: 10, rateNonEur: 10, tip_role: 'guide' }] } as unknown as AllRates
    const day = { id: 'd', dayNumber: 1, title: '', city: '', description: '', isExpanded: false,
      slots: [{ slotId: 'tipping', selectedItems: [{ rateId: GUIDE_TIP, name: 'Tip', rateEur: 10, rateNonEur: 10 }], customAmount: 0 }] } as GridDay
    const { days } = hydrateDayRates([day], rates, 'missing')
    expect(days[0].slots[0].selectedItems[0].tipRole).toBe('guide')
  })

  it('at the save, from its rate row — only the tips that lack one, asked for once', async () => {
    const asked: string[][] = []
    const db: TipRoleReader = {
      from: () => ({ select: () => ({ in: (_c: string, ids: string[]) => {
        asked.push(ids)
        return Promise.resolve({ data: [{ id: GUIDE_TIP, role_type: 'guide' }, { id: DRIVER_TIP, role_type: 'driver' }] })
      } }) }),
    }
    const days = [
      { slots: [{ slotId: 'tipping', selectedItems: [
        { rateId: GUIDE_TIP }, { rateId: DRIVER_TIP, tipRole: 'driver' }, { rateId: 'tip_legacy' },
      ] }, { slotId: 'guide', selectedItems: [{ rateId: GUIDE_TIP }] }] },
      { slots: [{ slotId: 'tipping', selectedItems: [{ rateId: GUIDE_TIP }] }] },
    ]
    await fillTipRoles(db, days)
    expect(asked).toEqual([[GUIDE_TIP]])
    expect(days[0].slots[0].selectedItems.map(i => (i as { tipRole?: string }).tipRole)).toEqual(['guide', 'driver', undefined])
    expect((days[0].slots[1].selectedItems[0] as { tipRole?: string }).tipRole).toBeUndefined() // not a tip
    expect((days[1].slots[0].selectedItems[0] as { tipRole?: string }).tipRole).toBe('guide')
  })

  it('nothing to look up: no query', async () => {
    let queried = false
    const db = { from: () => { queried = true; throw new Error('no') } } as unknown as TipRoleReader
    await fillTipRoles(db, [{ slots: [{ slotId: 'tipping', selectedItems: [{ rateId: GUIDE_TIP, tipRole: 'guide' }] }] }])
    expect(queried).toBe(false)
  })
})
