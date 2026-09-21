// ============================================
// Attraction alias resolution (A-item 13)
// ============================================
// Free-text day wording ("the citadel", "Giza plateau") resolves to the
// name on the agency's OWN entrance-fee sheet through the attraction_aliases
// table BEFORE the fee lookup. The rules:
//
//   - matching is a case-insensitive EXACT match on the alias — substring
//     guessing is the defect this mechanism replaces;
//   - AN ALIAS BELONGS TO ONE AGENCY. It points at a name on that agency's
//     fee sheet, so it means nothing to anybody else. There used to be global
//     rows every agency read (migration 323); nine of the 27 pointed at names
//     on nobody's sheet and turned right wording into a miss, and a global row
//     is one agency's wording imposed on the rest. Migration 370 handed each
//     agency the ones that worked for it and made the column NOT NULL;
//   - a canonical may join several fees with ' + ' (a combo ticket): one
//     worded attraction becomes several priced lines;
//   - a name no alias knows passes through unchanged, so the fee lookup
//     still gets its turn.

import { memoRead } from './query-memo'

export interface AttractionAliasRow {
  alias: string
  canonical: string
  tenant_id?: string | null
}

/** alias(lowercased) → canonical. A row with no tenant is not an alias any
 *  more, and is ignored even if one is handed in. (Migration 370 must be
 *  applied BEFORE this code deploys: it is what hands each agency the global
 *  rows that worked for it. The old code reads tenant rows perfectly well, so
 *  that order has no gap; the other order loses them until it runs.) */
export function buildAliasIndex(rows: AttractionAliasRow[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const row of rows) {
    if (!row.tenant_id) continue
    const key = row.alias.trim().toLowerCase()
    const canonical = row.canonical.trim()
    if (key && canonical) index.set(key, canonical)
  }
  return index
}

/**
 * Resolve one worded attraction into its canonical fee name(s).
 * Unknown names come back as themselves, single-element.
 */
export function resolveAttractionAlias(name: string, index: Map<string, string>): string[] {
  const canonical = index.get(name.trim().toLowerCase())
  if (!canonical) return [name]
  return canonical
    .split(' + ')
    .map(part => part.trim())
    .filter(Boolean)
}

interface AliasDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: boolean): {
        eq(col: string, v: string): PromiseLike<{ data: AttractionAliasRow[] | null; error: unknown }>
      }
    }
  }
}

/**
 * Load the alias index for a tenant — its own rows, and nobody else's.
 * Failures degrade to an empty index — the engine's historical fallbacks
 * still apply, so a missing table never breaks pricing.
 */
export async function loadAttractionAliasIndex(
  db: object,
  tenantId: string
): Promise<Map<string, string>> {
  // The same table, unchanged by tier — read once per calculation.
  return memoRead(`aliases|${tenantId}`, async () => {
  try {
    const { data, error } = await (db as AliasDb)
      .from('attraction_aliases')
      .select('alias, canonical, tenant_id')
      .eq('is_active', true)
      .eq('tenant_id', tenantId)
    if (error || !data) return new Map()
    return buildAliasIndex(data)
  } catch {
    return new Map()
  }
  })
}
