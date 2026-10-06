// ============================================
// Prices a grid selection carries vs the grid's own rate list
// ============================================
// A selected item carries its own price (rateEur / rateNonEur), and that price
// is what the calculator adds up. The dropdowns show the price from the grid's
// rate list. Two sources put items in the grid with prices that do not match
// that list (live 2026-09-30: Marriott Mena House selected, the dropdown
// showing 175.89, the day adding 0.00):
//
//   - the AI parser prices from its own rate map, which reads the legacy
//     accommodation columns (empty for a hotel priced by seasons), so a
//     parsed hotel arrived at 0;
//   - a reloaded line whose rate_eur is the column default 0.
//
// And the parser added water to every day as a hidden custom amount of 1:
// the Water row showed "— Select —", yet the calculator counted the 1 — and
// preferred it over any water picked in the row, so picking or removing water
// changed nothing.
//
// hydrateDayRates brings the items in line with the grid's rate list:
//   - 'all'     (a fresh AI parse): every item found in the list takes the
//               list's price — the grid's rates are the authority;
//   - 'missing' (a reload or a restored draft): only an item with no price
//               takes it, so a saved quote's prices are never silently moved.
// Water held as a hidden amount becomes a visible Water item: at the
// company's water rate after a parse, at its own amount otherwise. An item
// with no pricing basis takes its rate's (per group / person / unit). A hotel
// without its single supplement takes it back: the save writes the supplement
// only for a party of one (single-supplement.ts), but the grid keeps it for
// any party — the B2B sheet's tour leader and a later switch to 1 pax use it.

import type { AllRates, GridDay, RateOption, SelectedItem, SlotValue } from '../types'
import { supplementItem } from './single-supplement'

export type HydrateMode = 'all' | 'missing'

/** The id water held at its own amount is shown under in the Water row. */
export const WATER_CUSTOM_ID = 'water-custom'
const WATER_STANDARD_ID = 'water-standard'

function priced(item: SelectedItem): boolean {
  return (Number(item.rateEur) || 0) > 0 || (Number(item.rateNonEur) || 0) > 0
}

function waterSlot(slot: SlotValue, options: RateOption[], mode: HydrateMode): SlotValue {
  if (!(slot.customAmount > 0) || slot.selectedItems.length > 0) return slot
  const standard = options.find(o => o.id === WATER_STANDARD_ID)
  const item: SelectedItem = mode === 'all' && standard
    ? { rateId: standard.id, name: standard.name, rateEur: standard.rateEur, rateNonEur: standard.rateNonEur }
    : { rateId: WATER_CUSTOM_ID, name: 'Water Bottles', rateEur: slot.customAmount, rateNonEur: slot.customAmount }
  return { ...slot, customAmount: 0, selectedItems: [item] }
}

export function hydrateDayRates(
  days: GridDay[],
  rates: Partial<AllRates>,
  mode: HydrateMode,
): { days: GridDay[]; changed: number } {
  let changed = 0
  const next = days.map(day => {
    let dayChanged = false
    const slots = day.slots.map(slot => {
      const options: RateOption[] = (rates as Record<string, RateOption[] | undefined>)[slot.slotId] ?? []
      let out = slot
      if (slot.slotId === 'water') {
        out = waterSlot(slot, options, mode)
        if (out !== slot) changed++
      }
      if (options.length === 0 || out.selectedItems.length === 0) return out
      const byId = new Map(options.map(o => [o.id, o]))
      let itemsChanged = false
      const items = out.selectedItems.map(item => {
        const opt = byId.get(item.rateId)
        if (!opt) return item
        let next = item
        // How the rate applies to the group (per group / person / unit) is
        // the rate's, not the saved line's: a reloaded or parsed item takes it.
        if (opt.pricing_basis && !item.pricingBasis) {
          next = { ...next, pricingBasis: opt.pricing_basis, unitCapacity: opt.unit_capacity ?? null }
        }
        // Whose tip it is, likewise the rate's (guide-rule.ts).
        if (opt.tip_role && !item.tipRole) next = { ...next, tipRole: opt.tip_role }
        const repriced = !(mode === 'missing' && priced(item)) &&
          (opt.rateEur !== item.rateEur || opt.rateNonEur !== item.rateNonEur)
        if (repriced) next = { ...next, rateEur: opt.rateEur, rateNonEur: opt.rateNonEur }
        if (next === item) return item
        itemsChanged = true
        changed++
        return next
      })
      if (out.slotId === 'accommodation' && items.length === 1) {
        const hotel = byId.get(items[0].rateId)
        const supp = hotel ? supplementItem(hotel) : null
        if (supp) {
          items.push(supp)
          itemsChanged = true
          changed++
        }
      }
      return itemsChanged ? { ...out, selectedItems: items } : out
    })
    dayChanged = slots.some((s, i) => s !== day.slots[i])
    return dayChanged ? { ...day, slots } : day
  })
  return { days: changed > 0 ? next : days, changed }
}
