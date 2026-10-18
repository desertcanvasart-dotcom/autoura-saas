// ============================================
// A package change applied to the days already on the grid
// ============================================
// The package only steered the parser: switching Full Package → Tours Only
// after a parse left every hotel and airport transfer in place, priced. This
// removes what the new package does not sell — hotels and hotel services,
// airport services and airport-transfer routes, overnight moves to another
// city for a one-base product — and says what it removed. Nothing is added:
// a leaner product never invents services.

import type { PackageTypeConfig } from '@/lib/package-types'
import type { GridDay } from '../types'

const AIRPORT_ROUTE = new Set(['airport_transfer'])
const OVERNIGHT_MOVE = new Set(['intercity_dropoff', 'intercity_overnight', 'intercity_transfer'])

export interface PackageApplyResult {
  days: GridDay[]
  removed: { hotels: number; airport: number; overnightMoves: number; cruises: number }
}

export function applyPackageToDays(days: GridDay[], pkg: PackageTypeConfig): PackageApplyResult {
  const removed = { hotels: 0, airport: 0, overnightMoves: 0, cruises: 0 }
  const next = days.map(day => {
    let changed = false
    const slots = day.slots.map(slot => {
      const n = slot.selectedItems.length
      if (n === 0) return slot
      if (!pkg.includes.accommodation && (slot.slotId === 'accommodation' || slot.slotId === 'hotel_services')) {
        if (slot.slotId === 'accommodation') removed.hotels++
        changed = true
        return { ...slot, selectedItems: [] }
      }
      if (!pkg.includes.accommodation && slot.slotId === 'cruise') {
        removed.cruises++
        changed = true
        return { ...slot, selectedItems: [] }
      }
      if (!pkg.includes.airportTransfers && slot.slotId === 'airport_services') {
        removed.airport += n
        changed = true
        return { ...slot, selectedItems: [] }
      }
      if (slot.slotId === 'route') {
        const kept = slot.selectedItems.filter(item => {
          const type = String(item.serviceType ?? '')
          if (!pkg.includes.airportTransfers && AIRPORT_ROUTE.has(type)) { removed.airport++; return false }
          if (!pkg.includes.overnightMoves && OVERNIGHT_MOVE.has(type)) { removed.overnightMoves++; return false }
          return true
        })
        if (kept.length !== n) {
          changed = true
          return { ...slot, selectedItems: kept }
        }
      }
      return slot
    })
    return changed ? { ...day, slots } : day
  })
  return { days: next, removed }
}

/** "3 hotel nights and 2 airport transfers" — or '' when nothing went. */
export function describeRemoved(r: PackageApplyResult['removed']): string {
  const parts = [
    r.hotels ? `${r.hotels} hotel night${r.hotels === 1 ? '' : 's'}` : '',
    r.cruises ? `${r.cruises} cruise night${r.cruises === 1 ? '' : 's'}` : '',
    r.airport ? `${r.airport} airport service${r.airport === 1 ? '' : 's'}` : '',
    r.overnightMoves ? `${r.overnightMoves} overnight transfer${r.overnightMoves === 1 ? '' : 's'} to another city` : '',
  ].filter(Boolean)
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
