// ============================================
// Publish — the agency's Google reviews on its website
// ============================================
// Operator, 2026-10-27: "import the agency's Google reviews". Real reviews
// only, never invented: they come from Google's Places API (New) for the
// business the agency picks (publish_sites.settings.reviews { placeId, show }).
//
// Google's rules (Places API policies, read 2026-10-28) shape this file:
//   · only the place ID may be stored; other content is fetched, and held
//     here in memory for CACHE_MS only — no copy is kept;
//   · at most 5 reviews come back (Google's limit), shown unedited, each with
//     its author (photo, name, link) and a link to it on Google Maps;
//   · a translated review is marked so, with the original reachable;
//   · "Google Maps" attribution, and a note that Google does not verify
//     reviews (the renderer's Reviews block).
// Env: GOOGLE_MAPS_API_KEY (web service). Without it, nothing shows.

const API = 'https://places.googleapis.com/v1'
/** How long fetched reviews are held (memory only). Google's Maps Service
 *  Terms govern caching; one constant to change if they say otherwise. */
export const CACHE_MS = 60 * 60 * 1000

export interface PlaceReviews {
  name: string
  rating: number | null
  count: number | null
  url: string | null
  reviews: Array<{
    author: string
    authorUrl: string | null
    authorPhoto: string | null
    rating: number
    text: string
    /** Google translated it into the page language. */
    translated: boolean
    original: string | null
    when: string
    url: string | null
  }>
}

export interface PlaceHit { placeId: string; name: string; address: string }

export function reviewsSettingsOf(settings: unknown): { placeId: string | null; show: boolean } {
  const r = (settings && typeof settings === 'object' ? (settings as Record<string, unknown>).reviews : null) as Record<string, unknown> | null | undefined
  const placeId = typeof r?.placeId === 'string' && /^[A-Za-z0-9_-]{10,300}$/.test(r.placeId) ? r.placeId : null
  return { placeId, show: placeId !== null && r?.show !== false }
}

type RawReview = {
  rating?: number; relativePublishTimeDescription?: string; googleMapsUri?: string
  text?: { text?: string; languageCode?: string }; originalText?: { text?: string; languageCode?: string }
  authorAttribution?: { displayName?: string; uri?: string; photoUri?: string }
}

/** Google's answer as the page shows it. Pure — tested on its own. */
export function toPlaceReviews(raw: { displayName?: { text?: string }; rating?: number; userRatingCount?: number; googleMapsUri?: string; reviews?: RawReview[] }, language: string): PlaceReviews {
  return {
    name: raw.displayName?.text ?? '',
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    count: typeof raw.userRatingCount === 'number' ? raw.userRatingCount : null,
    url: raw.googleMapsUri ?? null,
    reviews: (raw.reviews ?? [])
      .filter(r => typeof r.rating === 'number' && (r.text?.text || r.originalText?.text) && r.authorAttribution?.displayName)
      .slice(0, 5)
      .map(r => {
        const text = r.text?.text ?? r.originalText!.text!
        const translated = !!r.originalText?.languageCode && r.originalText.languageCode.slice(0, 2) !== (r.text?.languageCode ?? language).slice(0, 2)
        return {
          author: r.authorAttribution!.displayName!,
          authorUrl: r.authorAttribution?.uri ?? null,
          authorPhoto: r.authorAttribution?.photoUri ?? null,
          rating: r.rating!,
          text,
          translated,
          original: translated ? r.originalText?.text ?? null : null,
          when: r.relativePublishTimeDescription ?? '',
          url: r.googleMapsUri ?? null,
        }
      }),
  }
}

const cache: Map<string, { at: number; value: PlaceReviews | null }> =
  ((globalThis as { __placeReviewsCache?: Map<string, { at: number; value: PlaceReviews | null }> }).__placeReviewsCache ??= new Map())

/** The place's rating and reviews in a language; null when there is no key,
 *  Google refuses, or the place has none. Never throws — a page must render. */
export async function placeReviews(placeId: string, language: string, opts: { apiKey?: string; fetchImpl?: typeof fetch; now?: number } = {}): Promise<PlaceReviews | null> {
  const apiKey = opts.apiKey ?? process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return null
  const now = opts.now ?? Date.now()
  const k = `${placeId}|${language}`
  const hit = cache.get(k)
  if (hit && now - hit.at < CACHE_MS) return hit.value
  let value: PlaceReviews | null = null
  try {
    const res = await (opts.fetchImpl ?? fetch)(`${API}/places/${encodeURIComponent(placeId)}?languageCode=${encodeURIComponent(language)}`, {
      headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'displayName,rating,userRatingCount,googleMapsUri,reviews' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const p = toPlaceReviews(await res.json(), language)
      value = p.reviews.length || p.rating !== null ? p : null
    } else {
      console.error('[publish reviews] Google answered', res.status)
    }
  } catch (e) {
    console.error('[publish reviews] Google unreachable:', e instanceof Error ? e.message : e)
  }
  cache.set(k, { at: now, value })
  return value
}

/** Find the agency's business on Google, to pick its place. */
export async function searchPlaces(query: string, opts: { apiKey?: string; fetchImpl?: typeof fetch } = {}): Promise<PlaceHit[]> {
  const apiKey = opts.apiKey ?? process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) throw new Error('Google reviews are not switched on yet — contact Autoura.')
  const res = await (opts.fetchImpl ?? fetch)(`${API}/places:searchText`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress' },
    body: JSON.stringify({ textQuery: query }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Google could not search just now (HTTP ${res.status}).`)
  const json = await res.json() as { places?: Array<{ id?: string; displayName?: { text?: string }; formattedAddress?: string }> }
  return (json.places ?? []).filter(p => p.id).slice(0, 8).map(p => ({ placeId: p.id!, name: p.displayName?.text ?? '', address: p.formattedAddress ?? '' }))
}
