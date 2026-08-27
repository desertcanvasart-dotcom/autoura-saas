'use client'

// ============================================
// The city vocabulary, as data
// ============================================
// Every city dropdown used to read a hardcoded Egypt list duplicated across
// the rate pages. This hook reads the shared destination catalog through the
// tenant's selections (P1, docs/plans/productization-from-reference.md), so a
// tenant operating Jordan sees Jordan's cities in every form the moment its
// data exists — no deploy.
//
// FALLBACK: until migration 294 is applied — or if the fetch fails — the
// dropdowns serve the built-in Egypt list, byte-identical to the pre-catalog
// behaviour (citiesForDropdown in lib/destination-catalog.ts, where the
// logic is unit tested).

import { useEffect, useState } from 'react'
import {
  citiesForDropdown,
  type CatalogDestination,
} from '@/lib/destination-catalog'

export type { CatalogCity, CatalogDestination } from '@/lib/destination-catalog'

// One fetch per session, shared by every dropdown on every page.
let cache: CatalogDestination[] | null = null
let inflight: Promise<CatalogDestination[]> | null = null

async function loadCatalog(): Promise<CatalogDestination[]> {
  if (cache) return cache
  if (!inflight) {
    inflight = fetch('/api/destination-catalog')
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

/** Test/logout seam: forget the cached vocabulary. */
export function clearDestinationCache() {
  cache = null
  inflight = null
}

export interface UseDestinationCitiesResult {
  /** City names of the tenant's SELECTED destinations, in catalog order —
   *  the values stored on rate rows. Egypt fallback when the catalog is
   *  empty or the migration is not applied yet. */
  cities: string[]
  /** The tenant's selected destinations (for grouped dropdowns etc.). */
  destinations: CatalogDestination[]
  /** The full catalog, selected or not (for the settings page). */
  catalog: CatalogDestination[]
  loading: boolean
}

export function useDestinationCities(): UseDestinationCitiesResult {
  const [catalog, setCatalog] = useState<CatalogDestination[]>(cache ?? [])
  const [loading, setLoading] = useState(cache === null)

  useEffect(() => {
    let alive = true
    loadCatalog().then(d => {
      if (!alive) return
      setCatalog(d)
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  return {
    cities: citiesForDropdown(catalog),
    destinations: catalog.filter(d => d.selected),
    catalog,
    loading,
  }
}
