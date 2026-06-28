// AI fence for the pricing-grid parser (harness Layer 3).
//
// The AI may SELECT validated rate IDs (resolved against the rate map), but it
// must NEVER emit a price NUMBER that becomes a real cost. Catch-all slots
// (other_group / other_pp) where the AI returned a raw number are zeroed and
// flagged needsHumanInput — the AI's figure is kept only as a non-binding hint.
//
// Extracted from app/api/pricing-grid/parse/route.ts so it can be unit-tested
// without importing the route's AI/supabase graph. See PRICING-HARNESS-PLAN.md.

export interface EnrichedSlot {
  selectedItems: any[]
  customAmount: number
  needsHumanInput?: boolean
  aiSuggested?: number | null
}

export function enrichSlots(
  slots: Record<string, any>,
  rateMap: Map<string, any>
): Record<string, EnrichedSlot> {
  const enriched: Record<string, EnrichedSlot> = {}

  for (const [slotId, value] of Object.entries(slots)) {
    if (typeof value === 'number') {
      // CATCH-ALL slots (other_group, other_pp): the AI emitted a raw number.
      // AI FENCE: never turn an AI-emitted number into a price. Keep it only as
      // a non-binding suggestion; a human must confirm/enter the real amount.
      enriched[slotId] = {
        selectedItems: [],
        customAmount: 0,
        needsHumanInput: value > 0,
        aiSuggested: value > 0 ? value : null,
      }
      continue
    }

    const ids = Array.isArray(value) ? value : value ? [value] : []
    const selectedItems = ids.map((id: string) => rateMap.get(id)).filter(Boolean)

    enriched[slotId] = { selectedItems, customAmount: 0 }
  }

  return enriched
}
