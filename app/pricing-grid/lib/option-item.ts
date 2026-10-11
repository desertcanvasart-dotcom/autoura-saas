// ============================================
// A rate option as the slot's selected items
// ============================================
// What picking an option puts in its slot: the item itself, with its pricing
// basis, and — for a hotel — its single supplement. SlotRow built this inline
// and the tier swap built a bare copy, so a hotel swapped by a tier change
// lost its supplement (a party of one then paid none).

import type { RateOption, SelectedItem } from '../types'
import { supplementItem } from './single-supplement'

export function optionItems(slotId: string, opt: RateOption): SelectedItem[] {
  const item: SelectedItem = {
    rateId: opt.id,
    name: opt.name,
    rateEur: opt.rateEur,
    rateNonEur: opt.rateNonEur,
    serviceType: opt.service_type,
    pricingClass: opt.pricing_class,
    ...(opt.pricing_basis ? { pricingBasis: opt.pricing_basis, unitCapacity: opt.unit_capacity ?? null } : {}),
  }
  const items: SelectedItem[] = [item]
  if (slotId === 'accommodation') {
    const supp = supplementItem(opt)
    if (supp) items.push(supp)
  }
  return items
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()

/** The new tier's stand-in for a picked cruise: the same ship if the tier has
 *  it, else one sailing from the day's city, else the tier's first. It used to
 *  be the tier's first cruise, whatever was picked. */
export function cruiseForTier(picked: { name?: string } | undefined, dayCity: string | undefined, options: RateOption[]): RateOption | undefined {
  const ship = norm(picked?.name).split(' - ')[0]
  return options.find(o => ship && norm(o.name).startsWith(ship))
    ?? options.find(o => norm((o as { city?: string }).city) === norm(dayCity) && norm(dayCity) !== '')
    ?? options[0]
}
