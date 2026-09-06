'use client'

// ============================================
// The agency's vocabulary, in every dropdown
// ============================================
// One fetch per session for all kinds (tiers, supplier types, board basis,
// vehicle types, cabins, meals, accommodation types), shared by every form.
// Rate rows store KEYS; this hook turns them into the agency's LABELS and
// offers the active entries in the agency's order.
//
// FALLBACK: until migration 334 is applied — or if the fetch fails — a kind
// comes back empty and callers keep their built-in lists (step 2 of the
// vocabulary work swaps those in one by one).

import { useEffect, useMemo, useState } from 'react'
import {
  activeInOrder,
  groupByKind,
  labelFor as labelForItems,
  type VocabularyItem,
  type VocabularyKind,
} from '@/lib/vocabulary'

export type { VocabularyItem, VocabularyKind } from '@/lib/vocabulary'

let cache: VocabularyItem[] | null = null
let inflight: Promise<VocabularyItem[]> | null = null

async function load(): Promise<VocabularyItem[]> {
  if (cache) return cache
  if (!inflight) {
    inflight = fetch('/api/vocabulary')
      .then(r => r.json())
      .then(j => {
        cache = (j?.success && Array.isArray(j.data)) ? j.data : []
        return cache!
      })
      .catch(() => {
        inflight = null // a network blip must not poison the whole session
        return []
      })
  }
  return inflight
}

/** Settings screen / logout seam: forget the cached vocabulary so the next
 *  dropdown re-reads what the admin just changed. */
export function clearVocabularyCache() {
  cache = null
  inflight = null
}

export interface UseVocabularyResult {
  /** Active entries of this kind, in the agency's order. */
  items: VocabularyItem[]
  /** Every entry of this kind, hidden ones included (for reading old rows). */
  all: VocabularyItem[]
  /** The agency's word for a stored key; the key itself when unknown. */
  labelFor: (key: string | null | undefined) => string
  loading: boolean
}

export function useVocabulary(kind: VocabularyKind): UseVocabularyResult {
  const [rows, setRows] = useState<VocabularyItem[]>(cache ?? [])
  const [loading, setLoading] = useState(cache === null)

  useEffect(() => {
    let alive = true
    load().then(d => {
      if (!alive) return
      setRows(d)
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  // Memoised so callers can put `items` in an effect's dependency list.
  const grouped = useMemo(() => groupByKind(rows), [rows])
  const all = grouped[kind]
  const items = useMemo(() => activeInOrder(all), [all])
  return {
    items,
    all,
    labelFor: key => labelForItems(all, key),
    loading,
  }
}

/** Every kind at once — the settings screen. */
export function useAllVocabularies(): { byKind: Record<VocabularyKind, VocabularyItem[]>; loading: boolean; reload: () => Promise<void> } {
  const [rows, setRows] = useState<VocabularyItem[]>(cache ?? [])
  const [loading, setLoading] = useState(cache === null)

  const reload = async () => {
    clearVocabularyCache()
    setLoading(true)
    const d = await load()
    setRows(d)
    setLoading(false)
  }

  useEffect(() => {
    let alive = true
    load().then(d => { if (alive) { setRows(d); setLoading(false) } })
    return () => { alive = false }
  }, [])

  const byKind = useMemo(() => groupByKind(rows), [rows])
  return { byKind, loading, reload }
}
