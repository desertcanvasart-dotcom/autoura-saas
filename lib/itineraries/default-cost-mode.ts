// ============================================
// The cost mode a new itinerary starts in
// ============================================
// Settings › Pricing defaults › Cost calculation is the COMPANY's default
// (tenants.default_cost_mode, migration 456; it was each person's until then):
// "auto" (costs come from the rates) or "manual" (costs are editable, the
// rates' figures pre-filled). The routes that create an itinerary start it in
// that mode; the itinerary page's toggle still switches one trip.

export type CostMode = 'auto' | 'manual'

/** A stored preference as a mode: anything but "manual" is auto. Pure. */
export function costModeOf(value: unknown): CostMode {
  return value === 'manual' ? 'manual' : 'auto'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** The company's default; auto when it cannot be read. */
export async function defaultCostMode(db: Db, tenantId: string | null | undefined): Promise<CostMode> {
  if (!tenantId) return 'auto'
  try {
    const { data } = await db.from('tenants').select('default_cost_mode').eq('id', tenantId).maybeSingle()
    return costModeOf((data as { default_cost_mode?: unknown } | null)?.default_cost_mode)
  } catch {
    return 'auto'
  }
}
