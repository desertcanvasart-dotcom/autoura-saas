// ============================================
// What the parser understood — read back, day by day
// ============================================
// A parse used to land straight in the grid: a wrong transfer or a hotel on
// the wrong tier showed only once someone opened each day's dropdowns. This
// writes the grid back as plain lines — "Transport: Cairo Airport Transfer
// (sedan)", "Hotel: Marriott Mena House (luxury | BB)" — so a misreading is
// seen in seconds, before pricing. Built from the grid as it stands, so it
// follows the day-block match and every edit after the parse.

import { SLOT_DEFINITIONS, type GridDay, type SelectedItem } from '../types'

export interface ReadbackDay {
  title: string
  lines: string[]
}

export interface ReadbackHeader {
  packageName?: string | null
  tier?: string | null
  pax?: number | null
  startDate?: string | null
}

/** The slot names a person writes in an itinerary, not the grid's column titles. */
const WORD: Record<string, string> = {
  route: 'Transport',
  accommodation: 'Hotel',
  entrance_fees: 'Entrances',
}

const vehicleOf = (rateId: string) => {
  const sep = rateId.indexOf('__')
  return sep === -1 ? '' : rateId.slice(sep + 2).replace(/[-_]+/g, ' ')
}

const itemText = (slotId: string, it: SelectedItem) => {
  const vehicle = slotId === 'route' ? vehicleOf(it.rateId) : ''
  return vehicle && !it.name.toLowerCase().includes(vehicle) ? `${it.name} (${vehicle})` : it.name
}

export function readbackDays(days: GridDay[]): ReadbackDay[] {
  return days.map(day => {
    const lines: string[] = []
    for (const def of SLOT_DEFINITIONS) {
      const slot = day.slots.find(s => s.slotId === def.slotId)
      if (!slot || def.slotId === 'water') continue
      const word = WORD[def.slotId] ?? def.label
      // The single supplement rides with the hotel; it is not a second hotel.
      const items = slot.selectedItems.filter(it => !it.rateId.endsWith('_supp'))
      if (items.length > 0) lines.push(`${word}: ${items.map(it => itemText(def.slotId, it)).join('; ')}`)
      else if (def.selectionMode === 'custom' && slot.customAmount > 0) lines.push(`${word}: amount entered (${slot.customAmount})`)
    }
    const city = day.city ? ` — ${day.city}` : ''
    return {
      title: `Day ${day.dayNumber}${city}`,
      lines: lines.length > 0 ? lines : ['Nothing selected'],
    }
  })
}

export function readbackText(days: GridDay[], header: ReadbackHeader = {}): string {
  const top = [
    header.packageName && `Package: ${header.packageName}`,
    header.tier && `Tier: ${header.tier}`,
    header.pax && `Travellers: ${header.pax}`,
    header.startDate && `Start: ${header.startDate}`,
  ].filter(Boolean).join('\n')
  const body = readbackDays(days).map(d => [d.title, ...d.lines].join('\n')).join('\n\n')
  return top ? `${top}\n\n${body}` : body
}
