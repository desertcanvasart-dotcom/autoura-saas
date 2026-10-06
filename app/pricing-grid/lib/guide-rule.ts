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
  /** tipping_rates.role_type, carried from the rate (types.ts SelectedItem). */
  tipRole?: string | null
}

/**
 * A tip for the guide. Decided by the tip's role (tipping_rates.role_type:
 * 'guide' for the full-day, half-day and cruise guide tips). It used to look
 * for "guide" in the item's id — but a tipping option's id is its row's UUID,
 * so no real tip ever matched and switching the guide off still sold the
 * guide's tips. The id check stays only for an item that carries no role.
 */
export function isGuideTip(item: RuleItem): boolean {
  const role = String(item.tipRole ?? '').trim().toLowerCase()
  if (role) return /(^|_)guide($|_)/.test(role)
  return String(item.rateId).toLowerCase().includes('guide')
}

export function soldItems<T extends RuleItem>(
  slot: { slotId: string; selectedItems?: T[] | null },
  withGuide: boolean,
): T[] {
  const items = slot.selectedItems ?? []
  if (withGuide) return items
  if (slot.slotId === 'guide') return []
  if (slot.slotId === 'tipping') return items.filter(item => !isGuideTip(item))
  return items
}

/** Whether a slot's typed custom amount is sold: guide off drops it from the
 *  guide and tipping slots, exactly as the calculator always has. */
export function customAmountSold(slotId: string, withGuide: boolean): boolean {
  return withGuide || (slotId !== 'guide' && slotId !== 'tipping')
}
