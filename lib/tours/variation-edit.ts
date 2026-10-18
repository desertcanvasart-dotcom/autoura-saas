// ============================================================================
// What an edit to a tour variation may change, and how it is checked.
// ============================================================================
// Lives here, not in the route, so it can be tested: a Next route file may
// only export its handlers. The tier is not editable — a tour has one
// variation per tier, and changing it would be a different variation.

export interface VariationEdit {
  variation_name?: string
  group_type?: 'private' | 'shared'
  min_pax?: number
  max_pax?: number
  is_active?: boolean
}

/** The fields an edit body may set, checked; or the reason it is refused. */
export function parseVariationEdit(body: unknown): { update: VariationEdit } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Nothing to save' }
  const b = body as Record<string, unknown>
  const update: VariationEdit = {}

  if (b.variation_name !== undefined) {
    const name = typeof b.variation_name === 'string' ? b.variation_name.trim() : ''
    if (!name) return { error: 'The variation needs a name' }
    update.variation_name = name
  }
  if (b.group_type !== undefined) {
    if (b.group_type !== 'private' && b.group_type !== 'shared') return { error: 'Group type is private or shared' }
    update.group_type = b.group_type
  }
  for (const key of ['min_pax', 'max_pax'] as const) {
    if (b[key] === undefined) continue
    const n = Number(b[key])
    if (!Number.isInteger(n) || n < 1) return { error: `${key === 'min_pax' ? 'Minimum' : 'Maximum'} travellers must be a whole number of 1 or more` }
    update[key] = n
  }
  if (update.min_pax !== undefined && update.max_pax !== undefined && update.min_pax > update.max_pax) {
    return { error: 'Minimum travellers cannot be more than the maximum' }
  }
  if (b.is_active !== undefined) {
    if (typeof b.is_active !== 'boolean') return { error: 'Active is true or false' }
    update.is_active = b.is_active
  }
  if (Object.keys(update).length === 0) return { error: 'Nothing to save' }
  return { update }
}
