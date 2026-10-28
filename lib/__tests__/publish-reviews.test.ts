import { describe, it, expect, vi } from 'vitest'
import { placeReviews, reviewsSettingsOf, searchPlaces, toPlaceReviews, CACHE_MS } from '@/lib/publish/reviews'

// ============================================================================
// The agency's Google reviews (operator, 2026-10-27). Real reviews only:
//   · Google's answer is shown as given — at most five, each with its author
//     and link; a translated one says so and keeps its original;
//   · no key, no business picked, or Google down → no reviews at all, never a
//     broken page and never anything invented;
//   · fetched content is held only briefly (CACHE_MS), never stored.
// ============================================================================

const review = (over: Record<string, unknown> = {}) => ({
  rating: 5, relativePublishTimeDescription: '2 weeks ago', googleMapsUri: 'https://maps.google.com/r/1',
  text: { text: 'Wonderful guide.', languageCode: 'en' }, originalText: { text: 'Wonderful guide.', languageCode: 'en' },
  authorAttribution: { displayName: 'Lena F.', uri: 'https://maps.google.com/u/1', photoUri: 'https://lh3.googleusercontent.com/a' },
  ...over,
})

describe('Google\'s answer, as the page shows it', () => {
  it('rating, count, link and the reviews — at most five', () => {
    const r = toPlaceReviews({ displayName: { text: 'Sunrise Travel' }, rating: 4.8, userRatingCount: 213, googleMapsUri: 'https://maps.google.com/p', reviews: Array.from({ length: 7 }, () => review()) }, 'en')
    expect(r).toMatchObject({ name: 'Sunrise Travel', rating: 4.8, count: 213, url: 'https://maps.google.com/p' })
    expect(r.reviews).toHaveLength(5)
    expect(r.reviews[0]).toEqual({ author: 'Lena F.', authorUrl: 'https://maps.google.com/u/1', authorPhoto: 'https://lh3.googleusercontent.com/a',
      rating: 5, text: 'Wonderful guide.', translated: false, original: null, when: '2 weeks ago', url: 'https://maps.google.com/r/1' })
  })
  it('a translated review says so and keeps its original', () => {
    const r = toPlaceReviews({ reviews: [review({ text: { text: 'Guide formidable.', languageCode: 'fr' }, originalText: { text: 'Wonderful guide.', languageCode: 'en' } })] }, 'fr')
    expect(r.reviews[0]).toMatchObject({ text: 'Guide formidable.', translated: true, original: 'Wonderful guide.' })
  })
  it('a review without text, rating or author is left out — never filled in', () => {
    const r = toPlaceReviews({ reviews: [review({ text: undefined, originalText: undefined }), review({ rating: undefined }), review({ authorAttribution: {} })] }, 'en')
    expect(r.reviews).toEqual([])
  })
})

describe('fetching', () => {
  it('asks Google for exactly the fields shown, in the page language', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ rating: 4.6, userRatingCount: 10, reviews: [review()] })))
    const r = await placeReviews('ChIJ-place-0001', 'fr', { apiKey: 'k', fetchImpl: fetchImpl as never, now: 1 })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://places.googleapis.com/v1/places/ChIJ-place-0001?languageCode=fr')
    expect(init.headers).toMatchObject({ 'X-Goog-Api-Key': 'k', 'X-Goog-FieldMask': 'displayName,rating,userRatingCount,googleMapsUri,reviews' })
    expect(r?.rating).toBe(4.6)
  })
  it('holds an answer briefly, then asks again', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ rating: 4.1, reviews: [] })))
    await placeReviews('ChIJ-place-0002', 'en', { apiKey: 'k', fetchImpl: fetchImpl as never, now: 1000 })
    await placeReviews('ChIJ-place-0002', 'en', { apiKey: 'k', fetchImpl: fetchImpl as never, now: 1000 + CACHE_MS - 1 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await placeReviews('ChIJ-place-0002', 'en', { apiKey: 'k', fetchImpl: fetchImpl as never, now: 1000 + CACHE_MS + 1 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
  it('no key, Google refusing or unreachable → nothing, and no error', async () => {
    expect(await placeReviews('ChIJ-place-0003', 'en', { apiKey: '' })).toBeNull()
    expect(await placeReviews('ChIJ-place-0004', 'en', { apiKey: 'k', fetchImpl: (async () => new Response('no', { status: 403 })) as never, now: 1 })).toBeNull()
    expect(await placeReviews('ChIJ-place-0005', 'en', { apiKey: 'k', fetchImpl: (async () => { throw new Error('down') }) as never, now: 1 })).toBeNull()
  })
  it('finds the agency\'s business by name', async () => {
    const fetchImpl = vi.fn(async (_u: unknown, init?: RequestInit) => {
      expect(JSON.parse(String(init!.body))).toEqual({ textQuery: 'Sunrise Travel Cairo' })
      return new Response(JSON.stringify({ places: [{ id: 'ChIJ-sunrise-01', displayName: { text: 'Sunrise Travel' }, formattedAddress: 'Zamalek, Cairo' }] }))
    })
    expect(await searchPlaces('Sunrise Travel Cairo', { apiKey: 'k', fetchImpl: fetchImpl as never })).toEqual([{ placeId: 'ChIJ-sunrise-01', name: 'Sunrise Travel', address: 'Zamalek, Cairo' }])
    await expect(searchPlaces('x', { apiKey: '' })).rejects.toThrow(/not switched on/)
  })
  it('the stored setting is read defensively; showing is on unless turned off', () => {
    expect(reviewsSettingsOf({ reviews: { placeId: 'ChIJ-sunrise-01' } })).toEqual({ placeId: 'ChIJ-sunrise-01', show: true })
    expect(reviewsSettingsOf({ reviews: { placeId: 'ChIJ-sunrise-01', show: false } })).toEqual({ placeId: 'ChIJ-sunrise-01', show: false })
    expect(reviewsSettingsOf({ reviews: { placeId: '<script>' } })).toEqual({ placeId: null, show: false })
  })
})
