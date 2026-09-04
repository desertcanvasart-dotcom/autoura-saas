// ============================================
// Attraction alias resolution (A-item 13)
// ============================================
// Free-text day wording ("the citadel", "Giza plateau") resolves to
// canonical entrance-fee names through the attraction_aliases table
// (migration 323) BEFORE the catalogue lookup. The rules:
//
//   - matching is a case-insensitive EXACT match on the alias — substring
//     guessing is the defect this mechanism replaces;
//   - a tenant's own alias beats a global one with the same spelling;
//   - a canonical may join several fees with ' + ' (a combo ticket): one
//     worded attraction becomes several priced lines;
//   - a name no alias knows passes through unchanged, so the engine's
//     historical map and ilike fallback still get their turn.

export interface AttractionAliasRow {
  alias: string
  canonical: string
  tenant_id?: string | null
}

/** alias(lowercased) → canonical, tenant rows winning over global. */
export function buildAliasIndex(rows: AttractionAliasRow[]): Map<string, string> {
  const index = new Map<string, string>()
  // Global rows first, tenant rows after — later set() wins.
  const ordered = [...rows].sort((a, b) => Number(Boolean(a.tenant_id)) - Number(Boolean(b.tenant_id)))
  for (const row of ordered) {
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
        or(expr: string): PromiseLike<{ data: AttractionAliasRow[] | null; error: unknown }>
      }
    }
  }
}

/**
 * Load the alias index for a tenant (tenant rows + global catalogue rows).
 * Failures degrade to an empty index — the engine's historical fallbacks
 * still apply, so a missing table never breaks pricing.
 */
export async function loadAttractionAliasIndex(
  db: object,
  tenantId: string
): Promise<Map<string, string>> {
  try {
    const { data, error } = await (db as AliasDb)
      .from('attraction_aliases')
      .select('alias, canonical, tenant_id')
      .eq('is_active', true)
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    if (error || !data) return new Map()
    return buildAliasIndex(data)
  } catch {
    return new Map()
  }
}
