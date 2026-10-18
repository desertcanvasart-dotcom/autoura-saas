// ============================================================================
// A grid save prices from the rates, not from the browser
// ============================================================================
// Every selected item arrives carrying its own price (rateEur / rateNonEur),
// and the save used to store it — and the browser's totals — as sent. The save
// now reads the grid's rate lists again (lib/pricing/grid-rates) and each item
// takes its rate's price as it is in the database at that moment: a rate
// edited since the line was picked prices the trip at the new figure
// (operator decision, 2026-10-11).
//
// An item is found by the id the grid gave it: the option id, a transport
// vehicle's own row id (the AI parser's), or a hotel's single supplement
// (`<hotel id>_supp`). Water typed as an amount is the operator's figure, like
// any typed amount. An item whose rate is no longer in the lists (withdrawn,
// or a line reloaded from before its rate id was stored) keeps the price it
// carries, and the save says so — it is never silently priced at 0.

import type { GridDay, RateOption, SelectedItem } from '@/app/pricing-grid/types'
import { WATER_CUSTOM_ID } from '@/app/pricing-grid/lib/hydrate-rates'

export interface RepricedLine {
  dayNumber: number
  slotId: string
  name: string
  from: { eur: number; nonEur: number }
  to: { eur: number; nonEur: number }
}

export interface KeptLine {
  dayNumber: number
  slotId: string
  name: string
}

const SUPP_SUFFIX = '_supp'

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** The rate an item is priced from, as an item, or null when it has none. */
function rateFor(slotId: string, item: SelectedItem, options: RateOption[]): SelectedItem | null {
  const id = String(item.rateId ?? '')
  const byId = options.find(o => o.id === id)
    ?? (slotId === 'route' ? options.find(o => o.row_id === id) : undefined)
  if (byId) {
    return {
      ...item,
      rateId: byId.id,
      rateEur: num(byId.rateEur),
      rateNonEur: num(byId.rateNonEur),
      // How the rate applies to the group, and whose tip it is: the rate's.
      ...(byId.pricing_basis ? { pricingBasis: byId.pricing_basis, unitCapacity: byId.unit_capacity ?? null } : {}),
      ...(byId.tip_role ? { tipRole: byId.tip_role } : {}),
    }
  }
  if (slotId === 'accommodation' && id.endsWith(SUPP_SUFFIX)) {
    const hotel = options.find(o => o.id === id.slice(0, -SUPP_SUFFIX.length))
    if (hotel) {
      // The same figures single-supplement.ts supplementItem() puts in the grid.
      return { ...item, rateEur: num(hotel.single_supp_eur), rateNonEur: num(hotel.single_supp_non_eur) }
    }
  }
  return null
}

export function repriceGridDays(
  days: GridDay[],
  rates: Record<string, RateOption[] | undefined>,
): { days: GridDay[]; repriced: RepricedLine[]; kept: KeptLine[] } {
  const repriced: RepricedLine[] = []
  const kept: KeptLine[] = []
  const out = days.map(day => ({
    ...day,
    slots: (day.slots ?? []).map(slot => {
      const options = rates[slot.slotId] ?? []
      const selectedItems = (slot.selectedItems ?? []).map(item => {
        // A typed water amount is the operator's own figure.
        if (slot.slotId === 'water' && item.rateId === WATER_CUSTOM_ID) return item
        const priced = rateFor(slot.slotId, item, options)
        if (!priced) {
          kept.push({ dayNumber: day.dayNumber, slotId: slot.slotId, name: item.name || slot.slotId })
          return { ...item, rateEur: num(item.rateEur), rateNonEur: num(item.rateNonEur) }
        }
        if (priced.rateEur !== num(item.rateEur) || priced.rateNonEur !== num(item.rateNonEur)) {
          repriced.push({
            dayNumber: day.dayNumber,
            slotId: slot.slotId,
            name: item.name || slot.slotId,
            from: { eur: num(item.rateEur), nonEur: num(item.rateNonEur) },
            to: { eur: priced.rateEur, nonEur: priced.rateNonEur },
          })
        }
        return priced
      })
      return { ...slot, selectedItems }
    }),
  }))
  return { days: out, repriced, kept }
}

/** What the save tells the operator about the prices it changed or kept. */
export function repriceWarnings(repriced: RepricedLine[], kept: KeptLine[], passport: 'eu' | 'non_eu'): string[] {
  const warnings: string[] = []
  const rate = (r: { eur: number; nonEur: number }) => (passport === 'eu' ? r.eur : r.nonEur)
  const moved = repriced.filter(r => rate(r.from) !== rate(r.to))
  if (moved.length > 0) {
    const list = moved.slice(0, 5).map(r => `${r.name} (day ${r.dayNumber}): ${rate(r.from)} → ${rate(r.to)}`).join('; ')
    warnings.push(
      `${moved.length} rate${moved.length === 1 ? ' has' : 's have'} changed since ${moved.length === 1 ? 'it was' : 'they were'} picked, and the trip was saved at today's ${moved.length === 1 ? 'rate' : 'rates'}: ${list}${moved.length > 5 ? ' …' : ''}`
    )
  }
  if (kept.length > 0) {
    const list = kept.slice(0, 5).map(k => `${k.name} (day ${k.dayNumber})`).join('; ')
    warnings.push(
      `${kept.length} line${kept.length === 1 ? ' was' : 's were'} saved at the price ${kept.length === 1 ? 'it' : 'they'} already had — ${kept.length === 1 ? 'its rate is' : 'their rates are'} not in your current rates: ${list}${kept.length > 5 ? ' …' : ''}. Pick ${kept.length === 1 ? 'it' : 'them'} again to price from your rates.`
    )
  }
  return warnings
}
