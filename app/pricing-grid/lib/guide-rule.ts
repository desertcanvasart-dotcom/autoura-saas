// ============================================
// The "with guide" switch — which of a slot's items are actually sold
// ============================================
// One rule for the calculator (what the grid prices) and the save route (what
// the itinerary stores). They used to disagree: with the guide switched off
// the calculator left the guide out, but the save still wrote the guide rows,
// so the saved itinerary carried a cost the quote never charged (live
// ITN-S-2026-6386: 3 guide rows, 143.71, on a trip sold without a guide).
//
// Guide off → the guide slot sells nothing, and tipping sells only its
// non-guide tips (driver etc.), no custom amount. Every other slot is
// unaffected.

interface RuleItem {
  rateId: string
}

export function soldItems<T extends RuleItem>(
  slot: { slotId: string; selectedItems?: T[] | null },
  withGuide: boolean,
): T[] {
  const items = slot.selectedItems ?? []
  if (withGuide) return items
  if (slot.slotId === 'guide') return []
  if (slot.slotId === 'tipping') return items.filter(item => !String(item.rateId).includes('guide'))
  return items
}

/** Whether a slot's typed custom amount is sold: guide off drops it from the
 *  guide and tipping slots, exactly as the calculator always has. */
export function customAmountSold(slotId: string, withGuide: boolean): boolean {
  return withGuide || (slotId !== 'guide' && slotId !== 'tipping')
}
