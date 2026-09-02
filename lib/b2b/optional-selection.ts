// ============================================
// Which optional services the customer actually wants
// ============================================
// Ported verbatim from travel-ops-pro (lib/b2b/optional-selection.ts).
//
// A programme's optional services used to be an all-or-nothing switch:
// `include_optionals: true` priced every one of them, so a customer who wanted
// the balloon ride but not the second Abu Simbel day could not be quoted at
// all.
//
// The selection is now a list of service ids. The old boolean still works —
// older callers and saved quotes replay the same way — but an explicit list
// always wins over it.
//
// EMPTY IS A DECISION, not a missing value. `selected_optional_ids: []` means
// "the customer chose none", which must price differently from a request that
// never mentioned optionals at all only in that it is explicit; both come to
// the same total, and neither is ever read as "all".

export type OptionalSelectionMode = 'all' | 'none' | 'some'

export interface OptionalSelection {
  mode: OptionalSelectionMode
  /** Service ids, when mode is 'some'. */
  ids: string[]
}

export function parseOptionalSelection(body: {
  include_optionals?: unknown
  selected_optional_ids?: unknown
}): OptionalSelection {
  const raw = body?.selected_optional_ids

  if (Array.isArray(raw)) {
    // An explicit list beats the legacy flag, including when it is empty.
    const ids = Array.from(
      new Set(raw.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map(v => v.trim()))
    )
    return ids.length ? { mode: 'some', ids } : { mode: 'none', ids: [] }
  }

  // Only a literal true turns everything on: 'false', 0 and '' are not consent.
  return body?.include_optionals === true ? { mode: 'all', ids: [] } : { mode: 'none', ids: [] }
}

/** Is this optional service one the customer is buying? */
export function isOptionalSelected(
  serviceId: unknown,
  selection: OptionalSelection
): boolean {
  if (selection.mode === 'all') return true
  if (selection.mode === 'none') return false
  return typeof serviceId === 'string' && selection.ids.includes(serviceId)
}
