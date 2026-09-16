// Turns /api/pricing-grid/parse's days into the grid's GridDay[].
//
// The parse route returns each day's `slots` as an ARRAY of
// { slotId, selectedItems, customAmount } (buildSlotsFromAI). The page was
// ported from travel-ops-pro, whose route returns an OBJECT keyed by slotId,
// and it read `pd.slots?.[def.slotId]` — an array indexed by a slot name is
// always undefined. So every service the AI matched was dropped and a parsed
// itinerary priced $0.00 on every line, water included (2026-09-16).
// Kept here, pure, so the contract is tested against the route's real output.

import type { GridDay, SelectedItem } from '../types'
import { SLOT_DEFINITIONS } from '../types'

interface ParsedSlot {
  slotId: string
  selectedItems?: Array<Partial<SelectedItem>>
  customAmount?: number
}

export interface ParsedDay {
  dayNumber?: number
  title?: string
  city?: string
  description?: string
  slots?: ParsedSlot[]
}

export function parsedDaysToGrid(parsed: ParsedDay[], newId: () => string): GridDay[] {
  return parsed.map((pd, idx) => {
    const byId = new Map((pd.slots ?? []).map(s => [s.slotId, s]))
    return {
      id: newId(),
      dayNumber: pd.dayNumber || idx + 1,
      title: pd.title || `Day ${idx + 1}`,
      city: pd.city || '',
      description: pd.description || '',
      isExpanded: false,
      slots: SLOT_DEFINITIONS.map(def => {
        const slot = byId.get(def.slotId)
        return {
          slotId: def.slotId,
          selectedItems: (slot?.selectedItems ?? []).map(item => ({
            rateId: item.rateId ?? '',
            name: item.name ?? '',
            rateEur: item.rateEur || 0,
            rateNonEur: item.rateNonEur || 0,
          })),
          customAmount: slot?.customAmount || 0,
        }
      }),
    }
  })
}
