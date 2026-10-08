'use client'

// Header navigation for a page that belongs to a trip — its booking, invoice,
// contract, supplier documents. Ported from travel-ops-pro.
//
//   <BackLink>        goes back where the user came from: the trip, when the
//                     link out of it carried ?from= (lib/nav/return-to), else
//                     the page's own list, as before.
//   <TripBreadcrumb>  Itineraries › ITN-1234 · Trip name › current — the trip
//                     the record belongs to, one click away however the page
//                     was reached (list, search, email link, new tab).

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { safeReturnPath, tripIdOfPath, FROM_PARAM } from '@/lib/nav/return-to'

export interface TripSummary {
  id: string
  code?: string | null
  name?: string | null
}

// One request per trip per page load, shared by the back link and breadcrumb.
const tripCache = new Map<string, Promise<TripSummary | null>>()

function loadTrip(id: string): Promise<TripSummary | null> {
  let p = tripCache.get(id)
  if (!p) {
    p = fetch(`/api/itineraries/${encodeURIComponent(id)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(json => (json?.success && json.data
        ? { id, code: json.data.itinerary_code ?? null, name: json.data.trip_name ?? json.data.client_name ?? null }
        : null))
      .catch(() => null)
    tripCache.set(id, p)
  }
  return p
}

/** The trip's code and name: from what the page already has, else fetched. */
function useTrip(itineraryId: string | null | undefined, known?: TripSummary | null): TripSummary | null {
  const knownFits = !!itineraryId && known?.id === itineraryId && !!known.code
  const [fetched, setFetched] = useState<TripSummary | null>(null)
  useEffect(() => {
    if (!itineraryId || knownFits) return
    let live = true
    loadTrip(itineraryId).then(trip => { if (live) setFetched(trip) })
    return () => { live = false }
  }, [itineraryId, knownFits])
  if (!itineraryId) return null
  if (knownFits) return known!
  return fetched?.id === itineraryId ? fetched : null
}

/** The page's ?from=, when it is a path on this site. Read after mount. */
function useReturnPath(): string | null {
  const [from, setFrom] = useState<string | null>(null)
  useEffect(() => {
    setFrom(safeReturnPath(new URLSearchParams(window.location.search).get(FROM_PARAM)))
  }, [])
  return from
}

export function BackLink({ fallbackHref, fallbackLabel, trip }: {
  /** Where back goes when the page was not opened from a trip. */
  fallbackHref: string
  fallbackLabel: string
  /** The trip this record belongs to, when the page already has it. */
  trip?: TripSummary | null
}) {
  const from = useReturnPath()
  const fromTripId = tripIdOfPath(from)
  const fromTrip = useTrip(fromTripId, trip)

  const href = from ?? fallbackHref
  const pathOf = (h: string) => h.split(/[?#]/)[0]
  const label = !from || pathOf(from) === pathOf(fallbackHref)
    ? fallbackLabel
    : fromTripId ? (fromTrip?.code || 'Trip') : 'Back'

  return (
    <Link
      href={href}
      title={`Back to ${label}`}
      aria-label={`Back to ${label}`}
      className="inline-flex items-center gap-1.5 -ml-2 px-2 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors shrink-0"
      data-testid="back-link"
    >
      <ArrowLeft className="w-4 h-4" />
      <span className="max-w-[10rem] truncate">{label}</span>
    </Link>
  )
}

export function TripBreadcrumb({ itineraryId, trip, current }: {
  itineraryId: string | null | undefined
  trip?: TripSummary | null
  /** This page's own name (e.g. the booking code); the last, unlinked crumb. */
  current?: string | null
}) {
  const info = useTrip(itineraryId, trip)
  if (!itineraryId) return null

  const tripLabel = info?.code
    ? (info.name ? `${info.code} · ${info.name}` : info.code)
    : 'Trip'

  return (
    <nav aria-label="Breadcrumb" className="mb-2 text-xs text-gray-500" data-testid="trip-breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 min-w-0">
        <li>
          <Link href="/itineraries" className="hover:text-gray-800 hover:underline">Itineraries</Link>
        </li>
        <li aria-hidden="true"><ChevronRight className="w-3 h-3" /></li>
        <li className="min-w-0">
          <Link href={`/itineraries/${itineraryId}`} className="font-medium text-primary-700 hover:underline truncate inline-block max-w-[18rem] align-bottom">
            {tripLabel}
          </Link>
        </li>
        {current && (
          <>
            <li aria-hidden="true"><ChevronRight className="w-3 h-3" /></li>
            <li aria-current="page" className="text-gray-700 truncate max-w-[12rem]">{current}</li>
          </>
        )}
      </ol>
    </nav>
  )
}
