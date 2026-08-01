'use client'

// ============================================
// TOUR DETAIL PAGE WITH DYNAMIC PRICING
// File: app/tours/[code]/page.tsx
// ============================================

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Calendar,
  Users,
  Tag,
  Check,
  X,
  Plus,
  Star,
  Globe,
  Loader2,
  ChevronDown,
  ChevronUp,
  Phone,
  Mail,
  ExternalLink,
  Calculator,
  TrendingUp,
  AlertCircle
} from 'lucide-react'

interface TourDetail {
  variation_id: string
  template_name: string
  template_code: string
  category_name: string
  destination_name: string
  duration_days: number
  duration_nights: number
  short_description: string
  long_description: string
  highlights: string[]
  variation_name: string
  variation_code: string
  tier: string
  group_type: string
  min_pax: number
  max_pax: number
  inclusions: string[]
  exclusions: string[]
  optional_extras: string[]
  guide_type: string
  guide_languages: string[]
  vehicle_type: string
  daily_itinerary: Array<{
    day_number: number
    day_title: string
    day_description: string
    city: string
    overnight_city: string
    breakfast_included: boolean
    lunch_included: boolean
    dinner_included: boolean
  }>
}

interface PricingResult {
  variation_id: string
  variation_name: string
  template_name: string
  num_pax: number
  travel_date: string
  season: string
  is_eur_passport: boolean
  services: Array<{
    service_id: string
    service_name: string
    service_category: string
    rate_type: string | null
    rate_source: string
    quantity_mode: string
    quantity: number
    unit_cost: number
    line_total: number
  }>
  optional_services: Array<{
    service_id: string
    service_name: string
    service_category: string
    line_total: number
  }>
  subtotal_cost: number
  optional_total: number
  total_cost: number
  margin_percent: number
  margin_amount: number
  selling_price: number
  price_per_person: number
  currency: string
}

export default function TourDetailPage() {
  const params = useParams()
  const [tour, setTour] = useState<TourDetail | null>(null)
  const [operator, setOperator] = useState<{ company_name?: string; contact_email?: string; company_phone?: string; company_website?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDays, setExpandedDays] = useState<number[]>([1])
  
  // Pricing state
  const [selectedPax, setSelectedPax] = useState(2)
  const [travelDate, setTravelDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() + 14) // Default 2 weeks from now
    return date.toISOString().split('T')[0]
  })
  const [isEurPassport, setIsEurPassport] = useState(true)
  const [pricing, setPricing] = useState<PricingResult | null>(null)
  const [pricingLoading, setPricingLoading] = useState(false)
  const [pricingError, setPricingError] = useState<string | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)

  useEffect(() => {
    if (params.code) {
      fetchTourDetail(params.code as string)
    }
  }, [params.code])

  // Calculate price when tour loads or params change
  useEffect(() => {
    if (tour?.variation_id) {
      calculatePrice()
    }
  }, [tour?.variation_id, selectedPax, travelDate, isEurPassport])

  const fetchTourDetail = async (code: string) => {
    try {
      const response = await fetch(`/api/tours/${code}`)
      const data = await response.json()

      if (data.success) {
        setTour(data.data)
        setOperator(data.operator || null)
      } else {
        setError('Tour not found')
      }
    } catch (err) {
      setError('Error loading tour details')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const calculatePrice = async () => {
    if (!tour?.variation_id) return
    
    setPricingLoading(true)
    setPricingError(null)
    
    try {
      const response = await fetch('/api/b2b/calculate-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variation_id: tour.variation_id,
          num_pax: selectedPax,
          travel_date: travelDate,
          is_eur_passport: isEurPassport,
          margin_percent: 0, // Show net price to customers, margin handled elsewhere
          include_optionals: false
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setPricing(data.data)
      } else {
        setPricingError(data.error || 'Failed to calculate price')
      }
    } catch (err) {
      setPricingError('Error calculating price')
      console.error(err)
    } finally {
      setPricingLoading(false)
    }
  }

  const toggleDay = (dayNumber: number) => {
    setExpandedDays(prev => 
      prev.includes(dayNumber) 
        ? prev.filter(d => d !== dayNumber)
        : [...prev, dayNumber]
    )
  }

  const getTierStyle = (tier: string) => {
    const styles: Record<string, { bg: string; text: string; icon: string }> = {
      budget: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: '💰' },
      standard: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', icon: '💎' },
      deluxe: { bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700', icon: '✨' },
      luxury: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: '👑' }
    }
    return styles[tier] || styles.standard
  }

  const getGroupTypeStyle = (type: string) => {
    return type === 'private' 
      ? { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-700', icon: '🔒', label: 'Private' }
      : { bg: 'bg-sky-50 border-sky-200', text: 'text-sky-700', icon: '👥', label: 'Shared' }
  }

  const getSeasonBadge = (season: string) => {
    const styles: Record<string, string> = {
      low: 'bg-green-100 text-green-700',
      high: 'bg-amber-100 text-amber-700',
      peak: 'bg-red-100 text-red-700'
    }
    return styles[season] || 'bg-gray-100 text-gray-700'
  }

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      transportation: '🚗',
      guide: '👨‍🏫',
      activity: '🎫',
      meal: '🍽️',
      accommodation: '🏨',
      cruise: '🚢',
      entrance: '🎟️',
      transfer: '✈️'
    }
    return icons[category] || '📋'
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-[#647C47] animate-spin mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Loading tour details...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !tour) {
    return (
      <div className="p-6">
        <Link 
          href="/tours" 
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Tours</span>
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <p className="text-sm font-medium text-red-800 mb-1">Tour Not Found</p>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  const tierStyle = getTierStyle(tour.tier)
  const groupStyle = getGroupTypeStyle(tour.group_type)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link 
            href="/tours" 
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{tour.template_name}</h1>
            <p className="text-sm text-gray-500">{tour.destination_name} • {tour.duration_days} {tour.duration_days === 1 ? 'day' : 'days'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${tierStyle.bg} ${tierStyle.text}`}>
            {tierStyle.icon} {tour.tier.charAt(0).toUpperCase() + tour.tier.slice(1)}
          </span>
          <span className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${groupStyle.bg} ${groupStyle.text}`}>
            {groupStyle.icon} {groupStyle.label}
          </span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-[#647C47]" />
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">Duration</p>
          <p className="text-lg font-semibold text-gray-900">
            {tour.duration_days}D{tour.duration_nights > 0 && `/${tour.duration_nights}N`}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-[#647C47]" />
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">Group Size</p>
          <p className="text-lg font-semibold text-gray-900">{tour.min_pax}-{tour.max_pax} pax</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="h-4 w-4 text-[#647C47]" />
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">Category</p>
          <p className="text-lg font-semibold text-gray-900 truncate">{tour.category_name || 'Uncategorized'}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="h-4 w-4 text-[#647C47]" />
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">Languages</p>
          <p className="text-lg font-semibold text-gray-900 truncate">
            {tour.guide_languages?.length > 0 ? tour.guide_languages.join(', ') : 'English, Arabic'}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[#647C47]">€</span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">From</p>
          <p className="text-lg font-semibold text-[#647C47]">
            {pricingLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : pricing ? (
              `€${pricing.price_per_person.toFixed(0)}`
            ) : (
              '€N/A'
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">About This Tour</h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              {tour.long_description || tour.short_description}
            </p>
            
            {tour.highlights && tour.highlights.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" />
                  Highlights
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {tour.highlights.map((highlight, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-[#647C47] mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-600">{highlight}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Daily Itinerary */}
          {tour.daily_itinerary && tour.daily_itinerary.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#647C47]" />
                Daily Itinerary
              </h2>
              <div className="space-y-3">
                {tour.daily_itinerary.map((day) => (
                  <div 
                    key={day.day_number} 
                    className="border border-gray-200 rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => toggleDay(day.day_number)}
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#647C47]/10 rounded-lg flex items-center justify-center">
                          <span className="text-sm font-bold text-[#647C47]">{day.day_number}</span>
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-gray-900">{day.day_title}</p>
                          <p className="text-xs text-gray-500">{day.city}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400">
                          {day.breakfast_included && <span>🍳</span>}
                          {day.lunch_included && <span>🍽️</span>}
                          {day.dinner_included && <span>🌙</span>}
                        </div>
                        {expandedDays.includes(day.day_number) ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    </button>
                    {expandedDays.includes(day.day_number) && (
                      <div className="px-4 pb-4 pt-0">
                        <div className="pl-13 ml-[52px] border-l-2 border-[#647C47]/20 pl-4">
                          <p className="text-sm text-gray-600">{day.day_description}</p>
                          <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
                            {day.breakfast_included && (
                              <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded">🍳 Breakfast</span>
                            )}
                            {day.lunch_included && (
                              <span className="px-2 py-1 bg-orange-50 text-orange-700 rounded">🍽️ Lunch</span>
                            )}
                            {day.dinner_included && (
                              <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded">🌙 Dinner</span>
                            )}
                            {day.overnight_city && (
                              <span className="px-2 py-1 bg-slate-50 text-slate-700 rounded">🏨 {day.overnight_city}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inclusions & Exclusions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tour.inclusions && tour.inclusions.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  </div>
                  What's Included
                </h3>
                <ul className="space-y-2">
                  {tour.inclusions.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                      <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tour.exclusions && tour.exclusions.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
                    <X className="h-3.5 w-3.5 text-red-600" />
                  </div>
                  Not Included
                </h3>
                <ul className="space-y-2">
                  {tour.exclusions.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                      <X className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Optional Extras */}
          {tour.optional_extras && tour.optional_extras.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-6 h-6 bg-[#647C47]/10 rounded-full flex items-center justify-center">
                  <Plus className="h-3.5 w-3.5 text-[#647C47]" />
                </div>
                Optional Extras
              </h3>
              <ul className="space-y-2">
                {tour.optional_extras.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                    <Plus className="h-4 w-4 text-[#647C47] mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Sidebar - Dynamic Pricing Calculator */}
        <div className="space-y-6 sticky top-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Calculator className="h-5 w-5 text-[#647C47]" />
              Calculate Your Price
            </h3>
            
            {/* Number of Travelers */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Number of Travelers
              </label>
              <select
                value={selectedPax}
                onChange={(e) => setSelectedPax(Number(e.target.value))}
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] outline-none bg-white"
              >
                {Array.from({ length: tour.max_pax }, (_, i) => i + 1).map(num => (
                  <option key={num} value={num}>
                    {num} {num === 1 ? 'person' : 'people'}
                  </option>
                ))}
              </select>
            </div>

            {/* Travel Date */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Travel Date
              </label>
              <input
                type="date"
                value={travelDate}
                onChange={(e) => setTravelDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] outline-none"
              />
            </div>

            {/* Passport Type */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Passport Type
              </label>
              <select
                value={isEurPassport ? 'eur' : 'non-eur'}
                onChange={(e) => setIsEurPassport(e.target.value === 'eur')}
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] outline-none bg-white"
              >
                <option value="eur">European Passport</option>
                <option value="non-eur">Non-European Passport</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">Affects entrance fees at some sites</p>
            </div>

            {/* Pricing Result */}
            {pricingLoading ? (
              <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg mb-4 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[#647C47] mr-2" />
                <span className="text-sm text-gray-600">Calculating...</span>
              </div>
            ) : pricingError ? (
              <div className="bg-red-50 border border-red-200 p-4 rounded-lg mb-4">
                <div className="flex items-center gap-2 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {pricingError}
                </div>
              </div>
            ) : pricing ? (
              <>
                <div className="bg-[#647C47]/5 border border-[#647C47]/20 p-4 rounded-lg mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-500">Price per person</p>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeasonBadge(pricing.season)}`}>
                      {pricing.season.charAt(0).toUpperCase() + pricing.season.slice(1)} Season
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-[#647C47]">
                    €{pricing.price_per_person.toFixed(0)}
                  </p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#647C47]/20">
                    <span className="text-sm text-gray-600">Total for {selectedPax} {selectedPax === 1 ? 'person' : 'people'}</span>
                    <span className="text-lg font-semibold text-gray-900">€{pricing.selling_price.toFixed(0)}</span>
                  </div>
                </div>

                {/* Toggle Breakdown */}
                <button
                  onClick={() => setShowBreakdown(!showBreakdown)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg mb-4"
                >
                  <span className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    View Price Breakdown
                  </span>
                  {showBreakdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {/* Price Breakdown */}
                {showBreakdown && pricing.services.length > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                    <h4 className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Services Included</h4>
                    <div className="space-y-2">
                      {pricing.services.map((service, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 text-gray-600">
                            <span>{getCategoryIcon(service.service_category)}</span>
                            <span className="truncate max-w-[180px]">{service.service_name}</span>
                          </span>
                          <span className="text-gray-900 font-medium">€{service.line_total.toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between text-sm font-medium">
                      <span className="text-gray-700">Subtotal</span>
                      <span className="text-gray-900">€{pricing.subtotal_cost.toFixed(0)}</span>
                    </div>
                  </div>
                )}

                {/* Optional Services */}
                {showBreakdown && pricing.optional_services && pricing.optional_services.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                    <h4 className="text-xs font-semibold text-amber-700 mb-3 uppercase tracking-wide">Available Add-ons</h4>
                    <div className="space-y-2">
                      {pricing.optional_services.map((service, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-amber-800">{service.service_name}</span>
                          <span className="text-amber-900 font-medium">+€{service.line_total.toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg mb-4 text-center">
                <p className="text-sm text-gray-500">Select options above to calculate price</p>
              </div>
            )}

            <button className="w-full bg-[#647C47] text-white py-3 rounded-lg hover:bg-[#4a5c35] transition-colors font-medium text-sm">
              Request This Tour
            </button>
            
            <p className="text-xs text-gray-400 text-center mt-3">
              Prices calculated dynamically based on current rates
            </p>
          </div>

          {/* Tour Info */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Tour Information</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Code</span>
                <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{tour.variation_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Category</span>
                <span className="text-gray-900">{tour.category_name || 'Uncategorized'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Duration</span>
                <span className="text-gray-900">
                  {tour.duration_days} days
                  {tour.duration_nights > 0 && ` / ${tour.duration_nights} nights`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <span className="text-gray-900">
                  {tour.group_type === 'private' ? '🔒 Private' : '👥 Shared'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Guide</span>
                <span className="text-gray-900 capitalize">{tour.guide_type?.replace('_', ' ') || 'Specialist'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Languages</span>
                <span className="text-gray-900">{tour.guide_languages?.join(', ') || 'English, Arabic'}</span>
              </div>
            </div>
          </div>

          {/* Contact Card */}
          <div className="bg-[#647C47]/5 border border-[#647C47]/20 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Need Help?</h3>
            <p className="text-xs text-gray-500 mb-4">
              Contact us for custom arrangements or questions
            </p>
            {/* The OPERATOR who owns this tour — this block hardcoded one
                company's contact details on every tenant's public tour pages. */}
            <div className="space-y-2 text-sm">
              {operator?.contact_email && (
                <a href={`mailto:${operator.contact_email}`} className="flex items-center gap-2 text-gray-600 hover:text-[#647C47]">
                  <Mail className="h-4 w-4" />
                  {operator.contact_email}
                </a>
              )}
              {operator?.company_phone && (
                <a href={`tel:${operator.company_phone.replace(/\s+/g, '')}`} className="flex items-center gap-2 text-gray-600 hover:text-[#647C47]">
                  <Phone className="h-4 w-4" />
                  {operator.company_phone}
                </a>
              )}
              {operator?.company_website && (
                <a href={operator.company_website.startsWith('http') ? operator.company_website : `https://${operator.company_website}`} target="_blank" className="flex items-center gap-2 text-gray-600 hover:text-[#647C47]">
                  <ExternalLink className="h-4 w-4" />
                  {operator.company_website}
                </a>
              )}
              {!operator?.contact_email && !operator?.company_phone && !operator?.company_website && (
                <p className="text-xs text-gray-400">Contact details coming soon.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}