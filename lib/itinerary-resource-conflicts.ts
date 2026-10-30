// ============================================
// Resource clashes — the same person or car on two trips at once
// ============================================
// Shared by the itinerary's conflict check (/api/itinerary-resources/
// conflicts) and a service booking covered by one of the agency's own
// people or cars (/api/bookings/[id]/suppliers/[lineId]/cover).

// Minimal shape the overlap logic needs. The DB row carries more columns;
// only these participate in conflict detection.
export interface ResourceRow {
  resource_type: string
  resource_id: string
  resource_name?: string | null
  start_date: string
  end_date: string | null
  itinerary_id?: string
  itineraries?: { itinerary_code?: string | null } | null
}

export interface ConflictRow {
  resource_id: string
  resource_name: string | null | undefined
  conflicting_itinerary: string
  dates: string
}

/**
 * Match this itinerary's confirmed resources against every candidate
 * assignment on OTHER itineraries, in memory.
 *
 * Pure, so the overlap rule is unit-tested without a database. `candidates`
 * must already be scoped to confirmed assignments on other itineraries (the
 * caller does that in one query); this only decides overlap and shapes output.
 *
 * Overlap rule, kept byte-for-byte identical to the previous per-resource SQL:
 *   candidate.start_date <= (resource.end_date || resource.start_date)
 *   AND candidate.end_date >= resource.start_date
 * A candidate with a null end_date is excluded, exactly as `.gte('end_date',…)`
 * dropped it in SQL (`null >= x` is null → filtered). ISO date strings compare
 * correctly with `<=`/`>=`, so no Date parsing is needed.
 */
export function computeConflicts(
  resources: ResourceRow[],
  candidates: ResourceRow[]
): ConflictRow[] {
  // Group candidates by resource identity so each resource scans only its own,
  // turning an O(resources × candidates) scan into O(resources + candidates).
  const byKey = new Map<string, ResourceRow[]>()
  const key = (r: ResourceRow) => `${r.resource_type} ${r.resource_id}`
  for (const c of candidates) {
    const k = key(c)
    const list = byKey.get(k)
    if (list) list.push(c)
    else byKey.set(k, [c])
  }

  const conflicts: ConflictRow[] = []
  // Outer loop over resources, inner over matching candidates — the same order
  // the previous implementation produced, so the response is unchanged.
  for (const resource of resources) {
    const resourceEnd = resource.end_date || resource.start_date
    for (const c of byKey.get(key(resource)) ?? []) {
      if (
        c.end_date != null &&
        c.start_date <= resourceEnd &&
        c.end_date >= resource.start_date
      ) {
        conflicts.push({
          resource_id: resource.resource_id,
          resource_name: resource.resource_name,
          conflicting_itinerary: c.itineraries?.itinerary_code || c.itinerary_id || '',
          dates: `${c.start_date} - ${c.end_date || c.start_date}`,
        })
      }
    }
  }
  return conflicts
}
