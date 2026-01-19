'use client'

// ============================================
// DAY BUILDER COMPONENT
// File: app/tours/manage/DayBuilder.tsx
//
// Visual day-by-day builder for B2B tours
// - Browse/search Content Library
// - Add activities to days
// - Auto-calculate pricing
// ============================================

import { useState, useEffect, useCallback } from 'react'
import {
  Calendar,
  Plus,
  Trash2,
  GripVertical,
  Search,
  X,
  Landmark,
  Hotel,
  Car,
  UtensilsCrossed,
  Ship,
  Plane,
  Clock,
  MapPin,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Users,
  RefreshCw
} from 'lucide-react'

// ============================================
// TYPES
// ============================================

interface ContentItem {
  id: string
  name: string
  slug: string
  short_description: string | null
  location: string | null
  duration: string | null
  category: {
    id: string
    name: string
    slug: string
    icon: string | null
  } | null
}

interface DayActivity {
  id: string
  day_number: number
  sequence_order: number
  content_id: string | null
  activity_type: string
  activity_name: string
  city: string | null
  duration_hours: number | null
  is_optional: boolean
  is_included: boolean
  requires_guide: boolean
  notes: string | null
  content_library?: ContentItem | null
}

interface DayData {
  day_number: number
  activities: DayActivity[]
}

interface PricingResult {
  tier: string
  sellingPrice: number
  pricePerPerson: number
  subtotalCost: number
  marginPercent: number
  servicesCount: number
}

interface DayBuilderProps {
  templateId: string
  templateName: string
  durationDays: number
  onClose?: () => void
  onSave?: () => void
}

// ============================================
// CONSTANTS
// ============================================

const ACTIVITY_TYPES = [
  { value: 'attraction', label: 'Attraction', icon: Landmark },
  { value: 'activity', label: 'Activity', icon: Landmark },
  { value: 'transfer', label: 'Transfer', icon: Car },
  { value: 'accommodation', label: 'Hotel', icon: Hotel },
  { value: 'meal', label: 'Meal', icon: UtensilsCrossed },
  { value: 'cruise', label: 'Cruise', icon: Ship },
  { value: 'flight', label: 'Flight', icon: Plane },
  { value: 'free_time', label: 'Free Time', icon: Clock },
]

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'attractions': Landmark,
  'hotels': Hotel,
  'restaurants': UtensilsCrossed,
  'transportation': Car,
  'cruises': Ship,
}

const TIER_OPTIONS = [
  { value: 'budget', label: 'Budget', color: 'emerald' },
  { value: 'standard', label: 'Standard', color: 'blue' },
  { value: 'deluxe', label: 'Deluxe', color: 'purple' },
  { value: 'luxury', label: 'Luxury', color: 'amber' },
]

// ============================================
// MAIN COMPONENT
// ============================================

export default function DayBuilder({
  templateId,
  templateName,
  durationDays,
  onClose,
  onSave
}: DayBuilderProps) {
  // State
  const [days, setDays] = useState<DayData[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Content Library search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ContentItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [targetDay, setTargetDay] = useState<number | null>(null)

  // Pricing
  const [selectedTier, setSelectedTier] = useState<string>('standard')
  const [numPax, setNumPax] = useState(2)
  const [pricing, setPricing] = useState<PricingResult | null>(null)
  const [pricingLoading, setPricingLoading] = useState(false)

  // Expanded days
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]))

  // ============================================
  // DATA FETCHING
  // ============================================

  // Load existing days/activities
  useEffect(() => {
    loadDays()
  }, [templateId])

  async function loadDays() {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/tours/templates/${templateId}/days`)
      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to load days')
      }

      // Initialize empty days if none exist
      if (data.data.days.length === 0) {
        const emptyDays: DayData[] = []
        for (let i = 1; i <= durationDays; i++) {
          emptyDays.push({ day_number: i, activities: [] })
        }
        setDays(emptyDays)
      } else {
        setDays(data.data.days)
      }

      // Expand all days that have activities
        const dayNumbers: number[] = []
        data.data.days.forEach((d: DayData) => {
        if (d.activities.length > 0) {
          dayNumbers.push(d.day_number)
        }
       })
          if (dayNumbers.length > 0) {
            setExpandedDays(new Set<number>(dayNumbers))
        }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Search Content Library
  const searchContent = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    setSearchLoading(true)
    try {
      const response = await fetch(`/api/content-library?search=${encodeURIComponent(query)}`)
      const data = await response.json()
      setSearchResults(data.data || [])
    } catch (err) {
      console.error('Search error:', err)
    } finally {
      setSearchLoading(false)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (showSearch) {
        searchContent(searchQuery)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, showSearch, searchContent])

  // Calculate pricing when days change
  useEffect(() => {
    if (days.some(d => d.activities.length > 0)) {
      calculatePricing()
    }
  }, [days, selectedTier, numPax])

  async function calculatePricing() {
    setPricingLoading(true)
    try {
      const response = await fetch(`/api/tours/templates/${templateId}/auto-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: selectedTier,
          num_pax: numPax,
          is_eur_passport: true,
          margin_percent: 25
        })
      })
      const data = await response.json()

      if (data.success) {
        setPricing({
          tier: selectedTier,
          sellingPrice: data.data.sellingPrice,
          pricePerPerson: data.data.pricePerPerson,
          subtotalCost: data.data.subtotalCost,
          marginPercent: data.data.marginPercent,
          servicesCount: data.data.services.length
        })
      }
    } catch (err) {
      console.error('Pricing error:', err)
    } finally {
      setPricingLoading(false)
    }
  }

  // ============================================
  // ACTIONS
  // ============================================

  function openSearchForDay(dayNumber: number) {
    setTargetDay(dayNumber)
    setShowSearch(true)
    setSearchQuery('')
    setSearchResults([])
  }

  async function addActivityFromContent(content: ContentItem) {
    if (!targetDay) return

    setSaving(true)
    try {
      // Map content category to activity type
      let activityType = 'activity'
      const categorySlug = content.category?.slug?.toLowerCase() || ''
      if (categorySlug.includes('attraction')) activityType = 'attraction'
      else if (categorySlug.includes('hotel')) activityType = 'accommodation'
      else if (categorySlug.includes('restaurant') || categorySlug.includes('meal')) activityType = 'meal'
      else if (categorySlug.includes('cruise')) activityType = 'cruise'
      else if (categorySlug.includes('transport')) activityType = 'transfer'

      const response = await fetch(`/api/tours/templates/${templateId}/days`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day_number: targetDay,
          content_id: content.id,
          activity_type: activityType,
          activity_name: content.name,
          city: content.location,
          requires_guide: activityType === 'attraction' || activityType === 'activity'
        })
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error)
      }

      // Update local state
      setDays(prev => prev.map(day => {
        if (day.day_number === targetDay) {
          return {
            ...day,
            activities: [...day.activities, data.data]
          }
        }
        return day
      }))

      // Close search and expand day
      setShowSearch(false)
      setTargetDay(null)
      setExpandedDays(prev => new Set([...prev, targetDay]))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function addManualActivity(dayNumber: number, type: string, name: string) {
    setSaving(true)
    try {
      const response = await fetch(`/api/tours/templates/${templateId}/days`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day_number: dayNumber,
          activity_type: type,
          activity_name: name,
          requires_guide: type === 'attraction' || type === 'activity'
        })
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error)
      }

      setDays(prev => prev.map(day => {
        if (day.day_number === dayNumber) {
          return {
            ...day,
            activities: [...day.activities, data.data]
          }
        }
        return day
      }))

      setExpandedDays(prev => new Set([...prev, dayNumber]))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function removeActivity(activityId: string, dayNumber: number) {
    setSaving(true)
    try {
      const response = await fetch(
        `/api/tours/templates/${templateId}/days?activity_id=${activityId}`,
        { method: 'DELETE' }
      )

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error)
      }

      setDays(prev => prev.map(day => {
        if (day.day_number === dayNumber) {
          return {
            ...day,
            activities: day.activities.filter(a => a.id !== activityId)
          }
        }
        return day
      }))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function toggleDay(dayNumber: number) {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(dayNumber)) {
        next.delete(dayNumber)
      } else {
        next.add(dayNumber)
      }
      return next
    })
  }

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-[#647C47]" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Day-by-Day Builder</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {templateName} • {durationDays} days
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Pax selector */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
              <Users className="w-4 h-4 text-gray-500" />
              <input
                type="number"
                min={1}
                max={50}
                value={numPax}
                onChange={(e) => setNumPax(parseInt(e.target.value) || 2)}
                className="w-12 text-sm bg-transparent border-none focus:outline-none"
              />
              <span className="text-sm text-gray-500">pax</span>
            </div>

            {/* Tier selector */}
            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/20"
            >
              {TIER_OPTIONS.map(tier => (
                <option key={tier.value} value={tier.value}>
                  {tier.label}
                </option>
              ))}
            </select>

            {/* Refresh pricing */}
            <button
              onClick={calculatePricing}
              disabled={pricingLoading}
              className="p-2 text-gray-500 hover:text-[#647C47] hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${pricingLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Pricing summary */}
        {pricing && (
          <div className="mt-4 flex items-center gap-6 p-3 bg-[#647C47]/5 rounded-lg">
            <div>
              <p className="text-xs text-gray-500">Total Price</p>
              <p className="text-lg font-semibold text-gray-900">
                €{pricing.sellingPrice.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Per Person</p>
              <p className="text-lg font-semibold text-[#647C47]">
                €{pricing.pricePerPerson.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Cost</p>
              <p className="text-sm text-gray-600">
                €{pricing.subtotalCost.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Margin</p>
              <p className="text-sm text-gray-600">
                {pricing.marginPercent}%
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Services</p>
              <p className="text-sm text-gray-600">
                {pricing.servicesCount} items
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Days list */}
      <div className="p-6 space-y-4">
        {days.map(day => {
          const isExpanded = expandedDays.has(day.day_number)
          const hasActivities = day.activities.length > 0

          return (
            <div
              key={day.day_number}
              className={`border rounded-lg transition-colors ${
                isExpanded ? 'border-[#647C47]/30 bg-[#647C47]/5' : 'border-gray-200'
              }`}
            >
              {/* Day header */}
              <button
                onClick={() => toggleDay(day.day_number)}
                className="w-full px-4 py-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    hasActivities ? 'bg-[#647C47]/10 text-[#647C47]' : 'bg-gray-100 text-gray-400'
                  }`}>
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-medium text-gray-900">Day {day.day_number}</h3>
                    <p className="text-xs text-gray-500">
                      {day.activities.length} {day.activities.length === 1 ? 'activity' : 'activities'}
                    </p>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {/* Day content */}
              {isExpanded && (
                <div className="px-4 pb-4">
                  {/* Activities list */}
                  {day.activities.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {day.activities.map((activity, index) => {
                        const TypeIcon = ACTIVITY_TYPES.find(t => t.value === activity.activity_type)?.icon || Landmark

                        return (
                          <div
                            key={activity.id}
                            className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg group"
                          >
                            <GripVertical className="w-4 h-4 text-gray-300 cursor-grab" />
                            
                            <div className="p-1.5 bg-gray-100 rounded">
                              <TypeIcon className="w-4 h-4 text-gray-600" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 truncate">
                                {activity.activity_name}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span className="capitalize">{activity.activity_type}</span>
                                {activity.city && (
                                  <>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      {activity.city}
                                    </span>
                                  </>
                                )}
                                {activity.content_id && (
                                  <>
                                    <span>•</span>
                                    <span className="text-[#647C47]">From Content Library</span>
                                  </>
                                )}
                              </div>
                            </div>

                            {activity.is_optional && (
                              <span className="px-2 py-0.5 text-xs bg-amber-50 text-amber-700 rounded-full">
                                Optional
                              </span>
                            )}

                            <button
                              onClick={() => removeActivity(activity.id, day.day_number)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Add activity button */}
                  <button
                    onClick={() => openSearchForDay(day.day_number)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-[#647C47] hover:text-[#647C47] transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Activity from Content Library
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Search Modal */}
      {showSearch && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[70vh] flex flex-col">
            {/* Search header */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">
                  Add Activity to Day {targetDay}
                </h3>
                <button
                  onClick={() => {
                    setShowSearch(false)
                    setTargetDay(null)
                  }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search Content Library..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                />
                {searchLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 animate-spin" />
                )}
              </div>
            </div>

            {/* Search results */}
            <div className="flex-1 overflow-y-auto p-4">
              {searchResults.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {searchQuery ? 'No results found' : 'Type to search the Content Library'}
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults.map(item => {
                    const CategoryIcon = CATEGORY_ICONS[item.category?.slug || ''] || Landmark

                    return (
                      <button
                        key={item.id}
                        onClick={() => addActivityFromContent(item)}
                        disabled={saving}
                        className="w-full flex items-start gap-3 p-3 text-left border border-gray-200 rounded-lg hover:border-[#647C47] hover:bg-[#647C47]/5 transition-colors disabled:opacity-50"
                      >
                        <div className="p-2 bg-gray-100 rounded-lg">
                          <CategoryIcon className="w-5 h-5 text-gray-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900">{item.name}</p>
                          <p className="text-sm text-gray-500 truncate">
                            {item.short_description || item.category?.name}
                          </p>
                          {item.location && (
                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                              <MapPin className="w-3 h-3" />
                              {item.location}
                            </p>
                          )}
                        </div>
                        <span className="text-xs px-2 py-1 bg-gray-100 rounded-full text-gray-600">
                          {item.category?.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Quick add manual */}
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <p className="text-xs text-gray-500 mb-2">Or add manually:</p>
              <div className="flex flex-wrap gap-2">
                {ACTIVITY_TYPES.slice(0, 4).map(type => (
                  <button
                    key={type.value}
                    onClick={() => {
                      const name = prompt(`Enter ${type.label} name:`)
                      if (name && targetDay) {
                        addManualActivity(targetDay, type.value, name)
                        setShowSearch(false)
                        setTargetDay(null)
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:border-[#647C47] transition-colors"
                  >
                    <type.icon className="w-3.5 h-3.5" />
                    {type.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
