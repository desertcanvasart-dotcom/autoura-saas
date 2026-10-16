// ============================================
// The parser's transport picks, as the grid's own options
// ============================================
// The AI parser picks a transportation_rates ROW id. The grid lists each
// route once, as options `${routeId}__${vehicle}` that carry the row they
// came from (row_id). A parsed line was never matched to them: it kept the
// parser's label ("day_tour sedan Cairo") and price, the dropdown showed no
// selection, and changing the number of travellers did not move it to the
// vehicle that seats them. Linked here: the option for that row's route, at
// the vehicle for the party.
//
// And the check the operator needs: a rate whose route is an airport but
// whose type is not an airport transfer ("Cairo Airport · Full Day") is
// almost always a rate saved under the wrong type — said, not silently priced.

import type { GridDay, RateOption } from '../types'
import { optionItems } from './option-item'
import { vehicleForPax } from './option-filters'

const routeIdOf = (optionId: string) => {
  const sep = optionId.indexOf('__')
  return sep === -1 ? optionId : optionId.slice(0, sep)
}

export function linkParsedTransport(days: GridDay[], routeOptions: RateOption[], pax: number): GridDay[] {
  const byRow = new Map<string, RateOption>()
  const byRoute = new Map<string, RateOption[]>()
  for (const o of routeOptions) {
    const row = (o as RateOption & { row_id?: string }).row_id
    if (row) byRow.set(row, o)
    const k = routeIdOf(o.id)
    byRoute.set(k, [...(byRoute.get(k) ?? []), o])
  }
  const ids = new Set(routeOptions.map(o => o.id))
  return days.map(day => {
    let changed = false
    const slots = day.slots.map(slot => {
      if (slot.slotId !== 'route' || slot.selectedItems.length === 0) return slot
      const selectedItems = slot.selectedItems.map(item => {
        if (ids.has(item.rateId)) return item
        const opt = byRow.get(item.rateId)
        if (!opt) return item
        const pick = vehicleForPax(byRoute.get(routeIdOf(opt.id)) ?? [opt], pax)
        changed = true
        return optionItems('route', pick)[0]
      })
      return changed ? { ...slot, selectedItems } : slot
    })
    return changed ? { ...day, slots } : day
  })
}

const AIRPORT = /\bairport\b|\b(cai|hbe|lxr|asw|hrg|ssh|rmf|spx)\b/i

/** Transport picked on these days whose route is an airport but whose type is not an airport transfer. */
export function transportTypeWarnings(days: GridDay[], routeOptions: RateOption[]): string[] {
  const byId = new Map(routeOptions.map(o => [o.id, o]))
  const out: string[] = []
  for (const day of days) {
    const route = day.slots.find(s => s.slotId === 'route')
    for (const item of route?.selectedItems ?? []) {
      const o = byId.get(item.rateId) as (RateOption & { origin_city?: string | null; destination_city?: string | null }) | undefined
      if (!o?.service_type || o.service_type === 'airport_transfer') continue
      const where = [o.origin_city, o.destination_city].filter(Boolean).join(' ')
      if (AIRPORT.test(where)) {
        out.push(`Day ${day.dayNumber}: "${o.name}" is an airport route saved as "${String(o.service_type).replace(/_/g, ' ')}", not an airport transfer — check its type in Rates → Transport.`)
      }
    }
  }
  return out
}
