// ============================================
// The cost mode a new itinerary starts in
// ============================================
// Settings → Preferences → Cost Calculation Mode is each person's default:
// "auto" (costs come from the rates) or "manual" (costs are editable, the
// rates' figures pre-filled). It was saved but nothing read it, so every new
// itinerary started in auto. The routes that create an itinerary for a
// person now start it in that person's mode; the itinerary page's toggle
// still switches one trip.

export type CostMode = 'auto' | 'manual'

/** A stored preference as a mode: anything but "manual" is auto. Pure. */
export function costModeOf(value: unknown): CostMode {
  return value === 'manual' ? 'manual' : 'auto'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** The person's default; auto when they have none or it cannot be read. */
export async function defaultCostMode(db: Db, userId: string | null | undefined): Promise<CostMode> {
  if (!userId) return 'auto'
  try {
    const { data } = await db.from('user_preferences').select('default_cost_mode').eq('user_id', userId).maybeSingle()
    return costModeOf((data as { default_cost_mode?: unknown } | null)?.default_cost_mode)
  } catch {
    return 'auto'
  }
}
