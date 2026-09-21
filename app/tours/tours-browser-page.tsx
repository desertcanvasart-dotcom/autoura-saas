'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { loadPricesInBatches, type PriceState, type StartingFrom } from '@/lib/tours/price-loader'

// Updated interface to match the new API response structure
interface TourTemplate {
  id: string
  template_code: string
  template_name: string
  tour_type: string
  duration_days: number
  cities_covered: string[]
  highlights: string[]
  short_description: string | null
  is_featured: boolean
  cover_image_url: string | null
  tour_theme: string | null
  theme_name: string | null
  default_variation_code: string | null
  variations_count: number
  available_tiers: string[]
  min_pax: number
  max_pax: number
  /** tier → variation code, so a card can link to the variation its price describes. */
  variation_code_by_tier?: Record<string, string>
  currency: string
  /** Days in the programme. Every tour with days is priced; 0 = nothing to price from. */
  day_count: number
}

export default function ToursBrowsePage() {
  const [tours, setTours] = useState<TourTemplate[]>([])
  // THE LIST FIRST, THE PRICES AFTER. The page used to wait for the pricing
  // engine before showing anything — 5–8 seconds on production data. The list
  // is cheap; each price arrives on its own and fills its card in.
  const [prices, setPrices] = useState<Record<string, PriceState>>({})
  const pricing = useRef<AbortController | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterTier, setFilterTier] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchPriceBatch = useCallback(async (ids: string[], signal?: AbortSignal): Promise<Record<string, StartingFrom>> => {
    const res = await fetch(`/api/tours/browse/prices?ids=${ids.join(',')}`, { signal })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.success) throw new Error(json?.error || 'prices failed')
    return json.data.prices as Record<string, StartingFrom>
  }, [])

  const fetchTours = useCallback(async () => {
    // A reload must not be answered by the previous load's prices.
    pricing.current?.abort()
    const controller = new AbortController()
    pricing.current = controller
    try {
      // The whole list. This page has no pager, and used to send no limit —
      // so it only ever showed the first 12 tours an agency had.
      const all: TourTemplate[] = []
      for (let page = 1; page <= 20; page++) {
        const response = await fetch(`/api/tours/browse?limit=200&page=${page}`, { signal: controller.signal })
        const data = await response.json()
        if (!data.success) { setError(data.error || 'Failed to load tours'); return }
        all.push(...(data.data?.templates || []))
        if (page >= (data.data?.pagination?.total_pages ?? 1)) break
      }
      setTours(all)
      setLoading(false)

      // A tour with no days and no variations has nothing to price from; every
      // other card says "pricing…" until its own answer arrives.
      const toPrice = all.filter(t => t.day_count > 0 || t.variations_count > 0).map(t => t.id)
      setPrices(Object.fromEntries(all.map(t => [t.id, toPrice.includes(t.id)
        ? { status: 'pending' } as PriceState
        : { status: 'done', starting_from: null, starting_from_tier: null } as PriceState])))
      await loadPricesInBatches(toPrice, fetchPriceBatch, update => setPrices(prev => ({ ...prev, ...update })), { signal: controller.signal })
    } catch (err) {
      if (controller.signal.aborted) return
      setError('Error loading tours')
      console.error(err)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [fetchPriceBatch])

  useEffect(() => {
    fetchTours()
    return () => pricing.current?.abort()
  }, [fetchTours])

  const priceOf = (id: string): PriceState => prices[id] ?? { status: 'pending' }
  const priced = useMemo(
    () => tours.map(t => prices[t.id]).filter((p): p is Extract<PriceState, { status: 'done' }> => p?.status === 'done' && p.starting_from != null),
    [tours, prices]
  )
  const stillPricing = tours.filter(t => (prices[t.id]?.status ?? 'pending') === 'pending').length

  const filteredTours = tours.filter(tour => {
    // Filter by tier - check if the tour has the selected tier available
    const matchesTier = filterTier === 'all' || tour.available_tiers?.includes(filterTier)
    
    // Filter by category
    const matchesCategory = filterCategory === 'all' || tour.theme_name === filterCategory
    
    // Search by name, description, or cities
    const searchLower = searchQuery.toLowerCase()
    const matchesSearch = 
      tour.template_name.toLowerCase().includes(searchLower) ||
      (tour.short_description?.toLowerCase().includes(searchLower)) ||
      (tour.cities_covered?.some(city => city.toLowerCase().includes(searchLower)))
    
    return matchesTier && matchesCategory && matchesSearch
  })

  // Get unique categories from the tours
  // Predicate filter, not filter(Boolean): the latter does not narrow away the
  // null, and an <option value={null}> is a type error.
  const uniqueCategories = [...new Set(
    tours.map(t => t.theme_name).filter((n): n is string => Boolean(n))
  )]

  const getTierBadge = (tier: string) => {
    const styles: Record<string, string> = {
      budget: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      standard: 'bg-blue-50 text-blue-700 border border-blue-200',
      deluxe: 'bg-purple-50 text-purple-700 border border-purple-200',
      luxury: 'bg-amber-50 text-amber-700 border border-amber-200'
    }
    return styles[tier] || 'bg-gray-50 text-gray-700 border border-gray-200'
  }

  const getTierIcon = (tier: string) => {
    const icons: Record<string, string> = {
      budget: '💰',
      standard: '💎',
      deluxe: '✨',
      luxury: '👑'
    }
    return icons[tier] || '📋'
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-[#647C47] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-500 text-sm">Loading tours...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-md">
          <p className="text-sm font-medium text-red-800 mb-1">Error Loading Tours</p>
          <p className="text-sm text-red-600">{error}</p>
          <button 
            onClick={() => { setError(null); fetchTours(); }}
            className="mt-3 text-sm text-red-700 underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-lg">
            🗺️
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Tour Inventory</h1>
            <p className="text-sm text-gray-500">Browse available tours and pricing</p>
          </div>
        </div>
        <Link 
          href="/tours/manage"
          className="px-4 py-2 text-sm bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] transition-colors font-medium"
        >
          Manage Tours
        </Link>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🎯</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">Tour Packages</p>
          <p className="text-2xl font-semibold text-gray-900">{tours.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">📋</span>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
          </div>
          {/* This tile used to count a flag (uses_day_builder). Every tour with
              days is priced now, so the number worth a tile is how many HAVE a price. */}
          <p className="text-xs text-gray-500 mb-1">With a price</p>
          <p className="text-2xl font-semibold text-gray-900">
            {priced.length}
            <span className="text-sm font-normal text-gray-400"> of {tours.length}</span>
          </p>
          {stillPricing > 0 && <p className="text-[11px] text-gray-400 mt-0.5">pricing {stillPricing} more…</p>}
        </div>
        {/* Optional-metadata tiles appear once the data exists — headline
            "Categories 0" / "Starting From —" above a populated list reads
            as a broken page (ported from travel-ops-pro, AUT-L03). Also
            fixes the || 9999 fallback: a list with no starting_from used to
            show 9,999 as its cheapest trip. */}
        {uniqueCategories.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🏷️</span>
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">Categories</p>
            <p className="text-2xl font-semibold text-gray-900">{uniqueCategories.length}</p>
          </div>
        )}
        {priced.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">💰</span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">Starting From</p>
            <p className="text-2xl font-semibold text-gray-900">
              €{Math.min(...priced.map(p => p.starting_from as number)).toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <div className="flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, description, or city..."
            className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] outline-none"
          />
        </div>
        <select
          value={filterTier}
          onChange={(e) => setFilterTier(e.target.value)}
          className="px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] outline-none bg-white min-w-[150px]"
        >
          <option value="all">All Tiers</option>
          <option value="budget">💰 Budget</option>
          <option value="standard">💎 Standard</option>
          <option value="deluxe">✨ Deluxe</option>
          <option value="luxury">👑 Luxury</option>
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] outline-none bg-white min-w-[180px]"
        >
          <option value="all">All Categories</option>
          {uniqueCategories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Results Info */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Showing <span className="font-medium text-gray-900">{filteredTours.length}</span> of {tours.length} tours
        </p>
        <button
          onClick={() => {
            setSearchQuery('')
            setFilterTier('all')
            setFilterCategory('all')
          }}
          className="text-sm text-[#647C47] hover:text-[#4a5c35] font-medium"
        >
          Clear Filters
        </button>
      </div>

      {/* Tour Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTours.map((tour) => (
          <div 
            key={tour.id} 
            className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-[#647C47] transition-colors"
          >
            {/* Card Header */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="text-sm font-semibold text-gray-900 leading-tight">{tour.template_name}</h3>
                {tour.is_featured && (
                  <span className="text-amber-500 text-xs">⭐</span>
                )}
              </div>
              <p className="text-xs text-gray-500">
                {tour.cities_covered?.join(', ') || 'Egypt'}
              </p>
            </div>

            {/* Card Body */}
            <div className="p-4">
              {/* Available Tiers */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {tour.available_tiers?.length > 0 ? (
                  tour.available_tiers.map(tier => (
                    <span 
                      key={tier}
                      className={`px-2 py-1 rounded text-xs font-medium ${getTierBadge(tier)}`}
                    >
                      {getTierIcon(tier)} {tier.charAt(0).toUpperCase() + tier.slice(1)}
                    </span>
                  ))
                ) : (
                  <span className="px-2 py-1 bg-gray-50 text-gray-600 border border-gray-200 rounded text-xs">
                    No variations yet
                  </span>
                )}
              </div>

              {/* Tour Details */}
              <div className="space-y-2 text-sm text-gray-600 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">📅</span>
                  <span>{tour.duration_days} {tour.duration_days === 1 ? 'day' : 'days'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">👥</span>
                  <span>{tour.min_pax || 1}-{tour.max_pax || 15} passengers</span>
                </div>
                {tour.theme_name && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">🏷️</span>
                    <span className="text-gray-500 text-xs">{tour.theme_name}</span>
                  </div>
                )}
                {/* Every tour with days is priced, so a badge saying so would be on
                    every card. The exception is what is worth saying. */}
                {tour.day_count === 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">📋</span>
                    <span className="text-amber-700 text-xs font-medium">No day-by-day programme yet — add its days in Tour Manager to price it</span>
                  </div>
                )}
              </div>

              {/* Short Description */}
              {tour.short_description && (
                <p className="text-xs text-gray-500 mb-4 line-clamp-2">
                  {tour.short_description}
                </p>
              )}

              {/* Price & Action */}
              <div className="flex items-end justify-between pt-3 border-t border-gray-100">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Starting from</p>
                  {/* No price is said plainly. It used to read as a euro sign
                      followed by N/A, and before that the card showed a
                      made-up duration x 150 estimate. */}
                  {(() => {
                    const price = priceOf(tour.id)
                    // Three different things, said three different ways: still
                    // working it out, could not ask, and asked — no price.
                    if (price.status === 'pending') return (
                      <p className="text-sm text-gray-400 flex items-center gap-2" aria-live="polite">
                        <span className="inline-block w-16 h-5 rounded bg-gray-100 animate-pulse" /> pricing…
                      </p>
                    )
                    if (price.status === 'failed') return (
                      <p className="text-xs text-amber-700">Price could not be loaded — <button type="button" onClick={fetchTours} className="underline">try again</button></p>
                    )
                    return (
                      <>
                        <p className="text-xl font-semibold text-[#647C47]">
                          {price.starting_from ? `€${price.starting_from.toLocaleString()}` : 'Price on request'}
                        </p>
                        {price.starting_from && (
                          <p className="text-[10px] text-gray-400">
                            per person{price.starting_from_tier ? ` • ${price.starting_from_tier}` : ''}
                          </p>
                        )}
                      </>
                    )
                  })()}
                </div>
                <Link
                  href={`/tours/${(() => {
                    // The variation the PRICE describes, once it is known.
                    const p = priceOf(tour.id)
                    const tier = p.status === 'done' ? p.starting_from_tier : null
                    return (tier && tour.variation_code_by_tier?.[tier]) || tour.default_variation_code || tour.id
                  })()}`}
                  className="bg-[#647C47] text-white px-4 py-2 rounded-lg hover:bg-[#4a5c35] transition-colors text-xs font-medium"
                >
                  View Details
                </Link>
              </div>
            </div>

            {/* Card Footer */}
            <div className="bg-gray-50 px-4 py-2 border-t border-gray-100 flex items-center justify-between">
              <p className="text-[10px] text-gray-400 font-mono uppercase">{tour.template_code}</p>
              <p className="text-[10px] text-gray-400">
                {tour.variations_count || 0} variation{tour.variations_count !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredTours.length === 0 && (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="text-sm font-medium text-gray-900 mb-1">No tours found</h3>
          <p className="text-xs text-gray-500 mb-4">Try adjusting your filters or search terms</p>
          <Link 
            href="/tours/manage"
            className="text-sm text-[#647C47] hover:text-[#4a5c35] font-medium"
          >
            Create a new tour →
          </Link>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-xs text-gray-400">© {new Date().getFullYear()} Autoura Operations System</p>
      </div>
    </div>
  )
}