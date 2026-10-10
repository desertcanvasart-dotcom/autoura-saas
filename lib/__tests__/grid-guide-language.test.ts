import { describe, it, expect } from 'vitest'
import { alignGuideLanguage, guideLanguages, majorityGuideLanguage } from '@/app/pricing-grid/lib/guide-language'
import { SLOT_DEFINITIONS, type GridDay, type RateOption } from '@/app/pricing-grid/types'

const g = (id: string, city: string, language: string, category = 'Egyptologist', rate = 50): RateOption =>
  ({ id, name: `${language} (${category})`, rateEur: rate, rateNonEur: rate, city, language, category } as RateOption)
const guides = [
  g('cai-en', 'Cairo', 'English'), g('cai-es', 'Cairo', 'Spanish', 'Egyptologist', 55),
  g('cai-es-a', 'Cairo', 'Spanish', 'Assistant', 20), g('cai-en-a', 'Cairo', 'English', 'Assistant', 18),
  g('lxr-en', 'Luxor', 'English'), g('lxr-es', 'Luxor', 'Spanish'),
  g('asw-en', 'Aswan', 'English'),
]
const day = (n: number, guideId: string | null): GridDay => ({
  id: `d${n}`, dayNumber: n, title: `Day ${n}`, city: '', description: '', isExpanded: false,
  slots: SLOT_DEFINITIONS.map(def => ({
    slotId: def.slotId,
    selectedItems: def.slotId === 'guide' && guideId ? [{ rateId: guideId, name: guideId, rateEur: 1, rateNonEur: 1 }] : [],
    customAmount: 0,
  })),
})
const guideOn = (d: GridDay) => d.slots.find(s => s.slotId === 'guide')!.selectedItems[0]?.rateId

describe('one guide language for the trip', () => {
  // The reported trip: Spanish on some days, English on others.
  const mixed = [day(1, null), day(2, 'cai-es'), day(3, 'cai-en'), day(4, 'lxr-es'), day(5, 'asw-en')]

  it('the languages on offer, and the one most days have', () => {
    expect(guideLanguages(guides)).toEqual(['English', 'Spanish'])
    expect(majorityGuideLanguage(mixed, guides)).toBe('Spanish')
    expect(majorityGuideLanguage([day(1, null)], guides)).toBeNull()
  })

  it('moves every day to the language, same city and kind; a city without one keeps its guide', () => {
    const r = alignGuideLanguage(mixed, guides, 'Spanish')
    expect(r.days.map(guideOn)).toEqual([undefined, 'cai-es', 'cai-es', 'lxr-es', 'asw-en'])
    expect(r.changed).toEqual([3])
    expect(r.unmatched).toEqual([5])
    expect(r.days[2].slots.find(s => s.slotId === 'guide')!.selectedItems[0]).toMatchObject({ rateId: 'cai-es', rateEur: 55 })
  })

  it('an assistant stays an assistant', () => {
    const r = alignGuideLanguage([day(1, 'cai-es-a')], guides, 'English')
    expect(r.days.map(guideOn)).toEqual(['cai-en-a'])
  })

  it('nothing to move: the same days back', () => {
    const days = [day(1, 'cai-en')]
    expect(alignGuideLanguage(days, guides, 'English').days).toBe(days)
  })
})
