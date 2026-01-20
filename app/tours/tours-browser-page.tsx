'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

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
  category: {
    id: string
    category_name: string
    category_code: string
  } | null
  variations_count: number
  available_tiers: string[]
  min_pax: number
  max_pax: number
  starting_from: number
  starting_from_tier: string
  currency: string
  uses_day_builder: boolean
  pricing_mode: string
}

export default function ToursBrowsePage() {
  const [tours, setTours] = useState<TourTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterTier, setFilterTier] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchTours()
  }, [])

  const fetchTours = async () => {
    try {
      const response = await fetch('/api/tours/browse')
      const data = await response.json()

      if (data.success) {
        // API now returns { data: { templates: [...], pagination: {...} } }
        setTours(data.data?.templates || [])
      } else {
        setError(data.error || 'Failed to load tours')
      }
    } catch (err) {
      setError('Error loading tours')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const filteredTours = tours.filter(tour => {
    // Filter by tier - check if the tour has the selected tier available
    const matchesTier = filterTier === 'all' || tour.available_tiers?.includes(filterTier)
    
    // Filter by category
    const matchesCategory = filterCategory === 'all' || tour.category?.category_name === filterCategory
    
    // Search by name, description, or cities
    const searchLower = searchQuery.toLowerCase()
    const matchesSearch = 
      tour.template_name.toLowerCase().includes(searchLower) ||
      (tour.short_description?.toLowerCase().includes(searchLower)) ||
      (tour.cities_covered?.some(city => city.toLowerCase().includes(searchLower)))
    
    return matchesTier && matchesCategory && matchesSearch
  })

  // Get unique categories from the tours
  const uniqueCategories = [...new Set(tours.map(t => t.category?.category_name).filter(Boolean))]

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
            <h1 className="text-xl font-semibold text-gray-900">Ready Made Packages</h1>
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
          <p className="text-xs text-gray-500 mb-1">With Auto-Pricing</p>
          <p className="text-2xl font-semibold text-gray-900">
            {tours.filter(t => t.uses_day_builder || t.pricing_mode === 'auto').length}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🏷️</span>
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">Categories</p>
          <p className="text-2xl font-semibold text-gray-900">{uniqueCategories.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">💶</span>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">Starting From</p>
          <p className="text-2xl font-semibold text-gray-900">
            €{tours.length > 0 ? Math.min(...tours.map(t => t.starting_from || 9999)).toLocaleString() : '—'}
          </p>
        </div>
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
                {tour.category && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">🏷️</span>
                    <span className="text-gray-500 text-xs">{tour.category.category_name}</span>
                  </div>
                )}
                {tour.uses_day_builder && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">⚡</span>
                    <span className="text-[#647C47] text-xs font-medium">Auto-Pricing</span>
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
                  <p className="text-xl font-semibold text-[#647C47]">
                    €{tour.starting_from ? tour.starting_from.toLocaleString() : 'N/A'}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    per person • {tour.starting_from_tier || 'standard'}
                  </p>
                </div>
                <Link 
                  href={`/tours/${tour.id}`}
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
        <p className="text-xs text-gray-400">© 2026 Autoura Operations System</p>
      </div>
    </div>
  )
}