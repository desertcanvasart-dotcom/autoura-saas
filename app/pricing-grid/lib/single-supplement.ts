// ============================================
// The accommodation single supplement — when it is sold
// ============================================
// Picking a hotel with a single supplement puts TWO items in the
// accommodation row: the per-person double rate, then a "Single Supplement"
// add-on (SlotRow). The grid keeps the add-on whatever the group size — the
// B2B rate sheet prices the tour leader's single room from it — but the
// quote only CHARGES it to a party of one. The save used to write it for
// every party, × pax, so a 2-pax trip stored a supplement line the quote
// never charged and its services added up to more than its total.
//
// One rule for the calculator and the save: items after the first are the
// supplement, sold only when pax is 1.

import type { RateOption, SelectedItem } from '../types'

export function supplementSold(pax: number): boolean {
  return pax === 1
}

/** The accommodation items the quote charges for a party of `pax`. */
export function soldAccommodationItems<T>(items: T[], pax: number): T[] {
  return supplementSold(pax) ? items : items.slice(0, 1)
}

/** The supplement item a hotel option adds when picked (none if it has no rate). */
export function supplementItem(opt: RateOption): SelectedItem | null {
  if (!opt.single_supp_eur) return null
  return {
    rateId: `${opt.id}_supp`,
    name: 'Single Supplement',
    rateEur: opt.single_supp_eur || 0,
    rateNonEur: opt.single_supp_non_eur || 0,
  }
}
