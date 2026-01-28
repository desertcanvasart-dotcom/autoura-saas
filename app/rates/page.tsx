'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useCurrency } from '@/hooks/useCurrency'

// ============================================
// INTERFACES
// ============================================

interface BaseRate {
  id?: string
  service_code?: string
  city?: string
  eur_rate?: number
  non_eur_rate?: number
  base_rate_eur?: number
  base_rate_non_eur?: number
  supplier_name?: string
  notes?: string
  season?: string
  description?: string
  is_active?: boolean
}

interface TransportationRate extends BaseRate {
  service_type?: string
  vehicle_type?: string
  capacity_min?: number
  capacity_max?: number
}

interface GuideRate extends BaseRate {
  guide_language?: string
  guide_type?: string
  tour_duration?: string
}

interface EntranceRate extends BaseRate {
  attraction_name?: string
  fee_type?: string
  category?: string
  child_discount_percent?: number
}

interface AccommodationRate extends BaseRate {
  property_name?: string
  property_type?: string
  star_rating?: number
  room_type?: string
  board_basis?: string
  tier?: string
  single_supplement_eur?: number
  single_supplement_non_eur?: number  
  high_season_rate_eur?: number
  high_season_rate_non_eur?: number
  low_season_rate_eur?: number
  low_season_rate_non_eur?: number
  base_rate_eur: number
  base_rate_non_eur: number
}

interface MealRate extends BaseRate {
  restaurant_name?: string
  meal_type?: string
  cuisine_type?: string
  restaurant_type?: string
  tier?: string
  meal_category?: string
  dietary_options?: string[]
  base_rate_eur?: number
  base_rate_non_eur?: number
}

interface AirportStaffRate {
  id: string
  service_code: string
  airport_code: string
  airport_name: string
  service_type: string
  direction: string
  rate_eur: number
  rate_non_eur?: number
  description?: string
  notes?: string
  is_active: boolean
}

interface HotelStaffRate {
  id: string
  service_code: string
  service_type: string
  hotel_category: string
  rate_eur: number
  rate_non_eur?: number
  description?: string
  notes?: string
  is_active: boolean
}

interface CruiseRate {
  id: string
  cruise_code: string
  ship_name: string
  ship_category: string
  route_name: string
  embark_city: string
  disembark_city: string
  duration_nights: number
  cabin_type: string
  rate_single_eur: number
  rate_double_eur: number
  rate_triple_eur?: number
  meals_included: string
  sightseeing_included: boolean
  description?: string
  notes?: string
  is_active: boolean
}

interface SleepingTrainRate {
  id: string
  service_code: string
  operator_name: string
  origin_city: string
  destination_city: string
  cabin_type: string
  rate_oneway_eur: number
  rate_roundtrip_eur?: number
  departure_time?: string
  arrival_time?: string
  meals_included?: string
  description?: string
  notes?: string
  is_active: boolean
}

interface TrainRate {
  id: string
  service_code: string
  operator_name: string
  origin_city: string
  destination_city: string
  class_type: string
  rate_eur: number
  duration_hours?: number
  departure_times?: string
  description?: string
  notes?: string
  is_active: boolean
}

interface TippingRate {
  id: string
  service_code: string
  role_type: string
  context?: string
  rate_unit: string
  rate_eur: number
  description?: string
  notes?: string
  is_active: boolean
}

interface RatesData {
  transportation: TransportationRate[]
  guides: GuideRate[]
  entrances: EntranceRate[]
  accommodation: AccommodationRate[]
  meals: MealRate[]
  airportStaff: AirportStaffRate[]
  hotelStaff: HotelStaffRate[]
  cruises: CruiseRate[]
  sleepingTrains: SleepingTrainRate[]
  trains: TrainRate[]
  tipping: TippingRate[]
}

type TabType = 'transportation' | 'guides' | 'entrances' | 'accommodation' | 'meals' | 'cruises' | 'sleepingTrains' | 'trains' | 'airportStaff' | 'hotelStaff' | 'tipping'

export default function RatesPage() {
  const [rates, setRates] = useState<RatesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCity, setSelectedCity] = useState('all')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [activeTab, setActiveTab] = useState<TabType>('transportation')

  const [selectedTier, setSelectedTier] = useState('all')
  const [selectedPropertyType, setSelectedPropertyType] = useState('all')
  const [showSeasonalPricing, setShowSeasonalPricing] = useState(false)

  // Currency hook for user's preferred currency
  const { display, symbol, userCurrency, loading: currencyLoading } = useCurrency()

  // Helper to get the correct rate based on user currency (EUR vs non-EUR)
  const getRate = (eurRate: number | undefined, nonEurRate: number | undefined): number => {
    const rate = userCurrency === 'EUR' ? (eurRate || 0) : (nonEurRate || eurRate || 0)
    return rate
  }

  // Display rate in user's currency
  const displayRate = (eurRate: number | undefined, nonEurRate?: number | undefined): string => {
    const rate = getRate(eurRate, nonEurRate)
    return display(rate, 'EUR')
  }

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)
  
  // Reset page when tab or filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, searchTerm, selectedCity, selectedCategory, selectedTier, selectedPropertyType])

  useEffect(() => {
    const fetchAllRates = async () => {
      try {
        const [
          transportationRes,
          guidesRes,
          entrancesRes,
          accommodationRes,
          mealsRes,
          airportStaffRes,
          hotelStaffRes,
          cruisesRes,
          sleepingTrainsRes,
          trainsRes,
          tippingRes
        ] = await Promise.all([
          fetch('/api/rates?type=transportation'),
          fetch('/api/rates?type=guide'),
          fetch('/api/rates?type=entrance'),
          fetch('/api/rates?type=accommodation'),
          fetch('/api/rates?type=meal'),
          fetch('/api/rates?type=airport_staff'),
          fetch('/api/rates?type=hotel_staff'),
          fetch('/api/rates?type=cruises'),
          fetch('/api/rates?type=sleeping_trains'),
          fetch('/api/rates?type=trains'),
          fetch('/api/rates?type=tipping')
        ])

        const [
          transportationData,
          guidesData,
          entrancesData,
          accommodationData,
          mealsData,
          airportStaffData,
          hotelStaffData,
          cruisesData,
          sleepingTrainsData,
          trainsData,
          tippingData
        ] = await Promise.all([
          transportationRes.json(),
          guidesRes.json(),
          entrancesRes.json(),
          accommodationRes.json(),
          mealsRes.json(),
          airportStaffRes.json(),
          hotelStaffRes.json(),
          cruisesRes.json(),
          sleepingTrainsRes.json(),
          trainsRes.json(),
          tippingRes.json()
        ])

        const combinedData: RatesData = {
          transportation: transportationData.success ? transportationData.data : [],
          guides: guidesData.success ? guidesData.data : [],
          entrances: entrancesData.success ? entrancesData.data : [],
          accommodation: accommodationData.success ? accommodationData.data : [],
          meals: mealsData.success ? mealsData.data : [],
          airportStaff: airportStaffData.success ? airportStaffData.data : [],
          hotelStaff: hotelStaffData.success ? hotelStaffData.data : [],
          cruises: cruisesData.success ? cruisesData.data : [],
          sleepingTrains: sleepingTrainsData.success ? sleepingTrainsData.data : [],
          trains: trainsData.success ? trainsData.data : [],
          tipping: tippingData.success ? tippingData.data : []
        }

        setRates(combinedData)
        setLoading(false)
      } catch (err) {
        console.error('Error loading rates:', err)
        setError('Error loading rates')
        setLoading(false)
      }
    }

    fetchAllRates()
  }, [])

  const getUniqueCategoriesFromEntrances = () => {
    if (!rates) return []
    return Array.from(new Set(rates.entrances.map(r => r.category).filter(Boolean))).sort()
  }

  const getUniqueTiersFromAccommodation = () => {
    if (!rates) return []
    return Array.from(new Set(rates.accommodation.map(r => r.tier).filter(Boolean))).sort()
  }

  const getUniquePropertyTypes = () => {
    if (!rates) return []
    return Array.from(new Set(rates.accommodation.map(r => r.property_type).filter(Boolean))).sort()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading rates...</p>
        </div>
      </div>
    )
  }

  if (error || !rates) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center bg-white p-6 rounded-lg shadow-md">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-red-500 text-xl">⚠️</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Oops! Something went wrong</h2>
          <p className="text-sm text-red-600 mb-3">{error || 'Failed to load rates'}</p>
          <Link href="/" className="inline-block px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
            ← Back to Home
          </Link>
        </div>
      </div>
    )
  }

  const allCities = Array.from(new Set([
    ...rates.transportation.map(r => r.city),
    ...rates.guides.map(r => r.city),
    ...rates.entrances.map(r => r.city),
    ...rates.accommodation.map(r => r.city),
    ...rates.meals.map(r => r.city),
    ...rates.cruises.map(r => r.embark_city),
    ...rates.cruises.map(r => r.disembark_city),
    ...rates.sleepingTrains.map(r => r.origin_city),
    ...rates.sleepingTrains.map(r => r.destination_city),
    ...rates.trains.map(r => r.origin_city),
    ...rates.trains.map(r => r.destination_city)
  ].filter(Boolean))).sort()

  const filterRates = <T extends BaseRate>(rateArray: T[]): T[] => {
    return rateArray.filter(rate => {
      const matchesSearch = searchTerm === '' || 
        Object.values(rate).some(value => 
          value && value.toString().toLowerCase().includes(searchTerm.toLowerCase())
        )
      
      const matchesCity = selectedCity === 'all' || rate.city === selectedCity
      
      const matchesCategory = activeTab !== 'entrances' || 
        selectedCategory === 'all' || 
        (rate as any).category === selectedCategory

      const matchesTier = activeTab !== 'accommodation' || 
        selectedTier === 'all' || 
        (rate as any).tier === selectedTier

      const matchesPropertyType = activeTab !== 'accommodation' ||
        selectedPropertyType === 'all' ||
        (rate as any).property_type === selectedPropertyType
      
      return matchesSearch && matchesCity && matchesCategory && matchesTier && matchesPropertyType
    })
  }

  // Generic filter for new rate types
  const filterGeneric = <T,>(rateArray: T[]): T[] => {
    return rateArray.filter(rate => {
      const matchesSearch = searchTerm === '' || 
        Object.values(rate as object).some(value => 
          value && value.toString().toLowerCase().includes(searchTerm.toLowerCase())
        )
      return matchesSearch
    })
  }

  const filteredRates = {
    transportation: filterRates(rates.transportation),
    guides: filterRates(rates.guides),
    entrances: filterRates(rates.entrances),
    accommodation: filterRates(rates.accommodation),
    meals: filterRates(rates.meals),
    airportStaff: filterGeneric(rates.airportStaff),
    hotelStaff: filterGeneric(rates.hotelStaff),
    cruises: filterGeneric(rates.cruises),
    sleepingTrains: filterGeneric(rates.sleepingTrains),
    trains: filterGeneric(rates.trains),
    tipping: filterGeneric(rates.tipping)
  }

  // Pagination logic
  const getCurrentFilteredRates = () => filteredRates[activeTab] as any[]
  const totalItems = getCurrentFilteredRates().length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  
  const paginatedRates = {
    transportation: filteredRates.transportation.slice(startIndex, endIndex),
    guides: filteredRates.guides.slice(startIndex, endIndex),
    entrances: filteredRates.entrances.slice(startIndex, endIndex),
    accommodation: filteredRates.accommodation.slice(startIndex, endIndex),
    meals: filteredRates.meals.slice(startIndex, endIndex),
    airportStaff: filteredRates.airportStaff.slice(startIndex, endIndex),
    hotelStaff: filteredRates.hotelStaff.slice(startIndex, endIndex),
    cruises: filteredRates.cruises.slice(startIndex, endIndex),
    sleepingTrains: filteredRates.sleepingTrains.slice(startIndex, endIndex),
    trains: filteredRates.trains.slice(startIndex, endIndex),
    tipping: filteredRates.tipping.slice(startIndex, endIndex)
  }

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }

  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages)
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages)
      }
    }
    return pages
  }

  const exportToCSV = () => {
    const currentRates = filteredRates[activeTab] as any[]
    if (!currentRates.length) return
    
    const headers = Object.keys(currentRates[0]).join(',')
    const rows = currentRates.map(rate => 
      Object.values(rate).map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    
    const csvContent = `${headers}\n${rows}`
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `autoura_${activeTab}_rates_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const printPage = () => {
    window.print()
  }

  const totalServices = rates.transportation.length + rates.guides.length + rates.entrances.length + 
                        rates.accommodation.length + rates.meals.length + rates.airportStaff.length +
                        rates.hotelStaff.length + rates.cruises.length + rates.sleepingTrains.length +
                        rates.trains.length + rates.tipping.length

  // Get current tab count
  const getCurrentCount = () => {
    return (paginatedRates[activeTab] as any[]).length
  }

  const getTotalForTab = () => {
    return (filteredRates[activeTab] as any[]).length
  }

  const getTotalUnfilteredForTab = () => {
    return (rates[activeTab] as any[]).length
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 print:shadow-none">
        <div className="container mx-auto px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-primary-600 text-sm font-bold">💰</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Rate Management</h1>
                <p className="text-xs text-gray-600">Autoura • {new Date().toLocaleDateString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={exportToCSV}
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors print:hidden font-medium"
              >
                📊 Export
              </button>
              <button 
                onClick={printPage}
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors print:hidden font-medium"
              >
                🖨️ Print
              </button>
              <Link 
                href="/rates" 
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors print:hidden font-medium"
              >
                ← Resources
              </Link>
              <Link 
                href="/" 
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors print:hidden font-medium"
              >
                🏠 Home
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Statistics Dashboard */}
      <div className="container mx-auto px-4 lg:px-6 py-6 print:hidden">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">🎯</span>
              <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
            </div>
            <p className="text-xs text-gray-600">Total Services</p>
            <p className="text-2xl font-bold text-gray-900">{totalServices}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">📂</span>
              <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
            </div>
            <p className="text-xs text-gray-600">Categories</p>
            <p className="text-2xl font-bold text-gray-900">11</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">🏙️</span>
              <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
            </div>
            <p className="text-xs text-gray-600">Cities</p>
            <p className="text-2xl font-bold text-gray-900">{allCities.length}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">👁️</span>
              <div className="w-1.5 h-1.5 rounded-full bg-orange-600" />
            </div>
            <p className="text-xs text-gray-600">Current View</p>
            <p className="text-2xl font-bold text-gray-900">{getCurrentCount()}</p>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="container mx-auto px-4 lg:px-6 print:hidden">
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by any field..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              />
            </div>
            {['transportation', 'guides', 'entrances', 'accommodation', 'meals'].includes(activeTab) && (
              <div className="md:w-40">
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                >
                  <option value="all">All Cities</option>
                  {allCities.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>
            )}
            {activeTab === 'entrances' && (
              <div className="md:w-40">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                >
                  <option value="all">All Categories</option>
                  {getUniqueCategoriesFromEntrances().map(cat => (
                    <option key={cat} value={cat}>
                      {cat && cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {activeTab === 'accommodation' && (
              <>
                <div className="md:w-40">
                  <select
                    value={selectedTier}
                    onChange={(e) => setSelectedTier(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  >
                    <option value="all">All Tiers</option>
                    {getUniqueTiersFromAccommodation().map(tier => (
                      <option key={tier} value={tier}>
                        {tier && tier.charAt(0).toUpperCase() + tier.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:w-40">
                  <select
                    value={selectedPropertyType}
                    onChange={(e) => setSelectedPropertyType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  >
                    <option value="all">All Types</option>
                    {getUniquePropertyTypes().map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
          
          <div className="mt-3 pt-3 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-4">
              <div className="text-xs text-gray-600">
                {totalItems > 0 ? (
                  <>
                    Showing <span className="font-bold text-gray-900">{startIndex + 1}-{Math.min(endIndex, totalItems)}</span> of <span className="font-bold text-gray-900">{totalItems}</span> rates
                    {totalItems !== getTotalUnfilteredForTab() && (
                      <span className="text-gray-400"> (filtered from {getTotalUnfilteredForTab()})</span>
                    )}
                  </>
                ) : (
                  <span>No rates found</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Per page:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setSearchTerm('')
                  setSelectedCity('all')
                  setSelectedCategory('all')
                  setSelectedTier('all')
                  setSelectedPropertyType('all')
                }}
                className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors font-medium"
              >
                🔄 Clear
              </button>

              {activeTab === 'accommodation' && (
                <button
                  onClick={() => setShowSeasonalPricing(!showSeasonalPricing)}
                  className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors font-medium"
                >
                  {showSeasonalPricing ? '📅 Base' : '🔄 Seasonal'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="container mx-auto px-4 lg:px-6 mt-4 print:hidden">
        <div className="bg-white rounded-t-lg shadow-md border border-gray-200">
          <div className="flex overflow-x-auto py-1 px-2 gap-1">
            {/* Original Tabs */}
            <button
              onClick={() => setActiveTab('transportation')}
              className={`px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                activeTab === 'transportation'
                  ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                  : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
              }`}
            >
              🚗 Transport ({rates.transportation.length})
            </button>
            <button
              onClick={() => setActiveTab('guides')}
              className={`px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                activeTab === 'guides'
                  ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                  : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
              }`}
            >
              👨‍🏫 Guides ({rates.guides.length})
            </button>
            <button
              onClick={() => setActiveTab('entrances')}
              className={`px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                activeTab === 'entrances'
                  ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                  : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
              }`}
            >
              🎫 Entrances ({rates.entrances.length})
            </button>
            <button
              onClick={() => setActiveTab('accommodation')}
              className={`px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                activeTab === 'accommodation'
                  ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                  : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
              }`}
            >
              🏨 Hotels ({rates.accommodation.length})
            </button>
            <button
              onClick={() => setActiveTab('meals')}
              className={`px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                activeTab === 'meals'
                  ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                  : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
              }`}
            >
              🍽️ Meals ({rates.meals.length})
            </button>
            
            {/* Divider */}
            <div className="border-l border-gray-300 mx-1" />
            
            {/* New Tabs */}
            <button
              onClick={() => setActiveTab('cruises')}
              className={`px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                activeTab === 'cruises'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              🚢 Cruises ({rates.cruises.length})
            </button>
            <button
              onClick={() => setActiveTab('sleepingTrains')}
              className={`px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                activeTab === 'sleepingTrains'
                  ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                  : 'text-gray-600 hover:text-purple-600 hover:bg-gray-50'
              }`}
            >
              🛏️ Sleep Train ({rates.sleepingTrains.length})
            </button>
            <button
              onClick={() => setActiveTab('trains')}
              className={`px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                activeTab === 'trains'
                  ? 'text-orange-600 border-b-2 border-orange-600 bg-orange-50'
                  : 'text-gray-600 hover:text-orange-600 hover:bg-gray-50'
              }`}
            >
              🚂 Trains ({rates.trains.length})
            </button>
            <button
              onClick={() => setActiveTab('airportStaff')}
              className={`px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                activeTab === 'airportStaff'
                  ? 'text-cyan-600 border-b-2 border-cyan-600 bg-cyan-50'
                  : 'text-gray-600 hover:text-cyan-600 hover:bg-gray-50'
              }`}
            >
              ✈️ Airport ({rates.airportStaff.length})
            </button>
            <button
              onClick={() => setActiveTab('hotelStaff')}
              className={`px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                activeTab === 'hotelStaff'
                  ? 'text-pink-600 border-b-2 border-pink-600 bg-pink-50'
                  : 'text-gray-600 hover:text-pink-600 hover:bg-gray-50'
              }`}
            >
              🛎️ Hotel Svc ({rates.hotelStaff.length})
            </button>
            <button
              onClick={() => setActiveTab('tipping')}
              className={`px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                activeTab === 'tipping'
                  ? 'text-green-600 border-b-2 border-green-600 bg-green-50'
                  : 'text-gray-600 hover:text-green-600 hover:bg-gray-50'
              }`}
            >
              💵 Tips ({rates.tipping.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Tables */}
      <main className="container mx-auto px-4 lg:px-6 pb-6">
        <div className="bg-white rounded-b-lg shadow-md border border-gray-200 border-t-0 overflow-hidden print:shadow-none print:rounded-none">
          {/* Currency indicator */}
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Showing rates in <span className="font-semibold text-gray-700">{userCurrency}</span>
            </span>
            {currencyLoading && (
              <span className="text-xs text-gray-400">Loading currency...</span>
            )}
          </div>
          <div className="overflow-x-auto">
            
            {/* Transportation Table */}
            {activeTab === 'transportation' && (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Service</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Vehicle</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">City</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Capacity</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Rate</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Supplier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedRates.transportation.map((rate, index) => (
                    <tr key={rate.service_code || rate.id || index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500">{rate.service_code || rate.id?.slice(0, 8) || '-'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{rate.service_type}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{rate.vehicle_type}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {rate.city}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {rate.capacity_min && rate.capacity_max ?
                          <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-700">{rate.capacity_min}-{rate.capacity_max}</span> :
                          <span className="text-gray-400">-</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                        {displayRate(rate.base_rate_eur || rate.eur_rate, rate.base_rate_non_eur || rate.non_eur_rate)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{rate.supplier_name || '-'}</td>
                    </tr>
                  ))}
                  {paginatedRates.transportation.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                        <span className="text-3xl">🚗</span>
                        <p className="text-sm font-medium mt-2">No transportation rates found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Guides Table */}
            {activeTab === 'guides' && (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Language</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">City</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Duration</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedRates.guides.map((rate, index) => (
                    <tr key={rate.service_code || rate.id || index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500">{rate.service_code || rate.id?.slice(0, 8) || '-'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{rate.guide_language}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{rate.guide_type}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {rate.city}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-700">
                          {rate.tour_duration?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                        {displayRate(rate.base_rate_eur || rate.eur_rate, rate.base_rate_non_eur || rate.non_eur_rate)}
                      </td>
                    </tr>
                  ))}
                  {paginatedRates.guides.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                        <span className="text-3xl">👨‍🏫</span>
                        <p className="text-sm font-medium mt-2">No guide rates found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Entrances Table */}
            {activeTab === 'entrances' && (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Attraction</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">City</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedRates.entrances.map((rate, index) => (
                    <tr key={rate.service_code || rate.id || index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500">{rate.service_code || rate.id?.slice(0, 8) || '-'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{rate.attraction_name}</td>
                      <td className="px-4 py-3">
                        {rate.category && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                            {rate.category}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {rate.city}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                        {displayRate(rate.base_rate_eur || rate.eur_rate, rate.base_rate_non_eur || rate.non_eur_rate)}
                      </td>
                    </tr>
                  ))}
                  {paginatedRates.entrances.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                        <span className="text-3xl">🎫</span>
                        <p className="text-sm font-medium mt-2">No entrance fees found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Accommodation Table */}
            {activeTab === 'accommodation' && (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Property</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Tier</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Stars</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">City</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedRates.accommodation.map((rate, index) => (
                    <tr key={rate.service_code || rate.id || index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500">{rate.service_code || rate.id?.slice(0, 8) || '-'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{rate.property_name}</td>
                      <td className="px-4 py-3">
                        {rate.tier && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                            {rate.tier}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        <span className="text-yellow-500">{'⭐'.repeat(rate.star_rating || 0)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {rate.city}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                        {displayRate(rate.base_rate_eur, rate.base_rate_non_eur)}
                      </td>
                    </tr>
                  ))}
                  {paginatedRates.accommodation.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                        <span className="text-3xl">🏨</span>
                        <p className="text-sm font-medium mt-2">No accommodation found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Meals Table */}
            {activeTab === 'meals' && (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Restaurant</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Meal Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">City</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedRates.meals.map((rate, index) => (
                    <tr key={rate.service_code || rate.id || index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500">{rate.service_code || rate.id?.slice(0, 8) || '-'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{rate.restaurant_name}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">{rate.meal_type}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {rate.city}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                        {displayRate(rate.base_rate_eur || rate.eur_rate, rate.base_rate_non_eur || rate.non_eur_rate)}
                      </td>
                    </tr>
                  ))}
                  {paginatedRates.meals.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                        <span className="text-3xl">🍽️</span>
                        <p className="text-sm font-medium mt-2">No meal rates found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* ============================================ */}
            {/* NEW TABLES */}
            {/* ============================================ */}

            {/* Nile Cruises Table */}
            {activeTab === 'cruises' && (
              <table className="w-full">
                <thead className="bg-blue-50 border-b border-blue-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-blue-800">Ship</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">Category</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-blue-800">Route</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">Nights</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">Cabin</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-blue-800">Single</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-blue-800">Double</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-blue-800">Triple</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedRates.cruises.map((rate, index) => (
                    <tr key={rate.cruise_code} className={`${index % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'} hover:bg-blue-50 transition-colors`}>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{rate.ship_name}</p>
                          <p className="text-xs text-gray-500">{rate.cruise_code}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          rate.ship_category === 'luxury' ? 'bg-amber-100 text-amber-800' :
                          rate.ship_category === 'deluxe' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {rate.ship_category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {rate.embark_city} → {rate.disembark_city}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                          {rate.duration_nights}N
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          rate.cabin_type === 'suite' ? 'bg-purple-100 text-purple-800' :
                          rate.cabin_type === 'deluxe' ? 'bg-indigo-100 text-indigo-800' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {rate.cabin_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                        {display(rate.rate_single_eur, 'EUR')}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-blue-600">
                        {display(rate.rate_double_eur, 'EUR')}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-purple-600">
                        {rate.rate_triple_eur ? display(rate.rate_triple_eur, 'EUR') : '-'}
                      </td>
                    </tr>
                  ))}
                  {paginatedRates.cruises.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                        <span className="text-3xl">🚢</span>
                        <p className="text-sm font-medium mt-2">No cruise rates found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Sleeping Train Table */}
            {activeTab === 'sleepingTrains' && (
              <table className="w-full">
                <thead className="bg-purple-50 border-b border-purple-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-purple-800">Route</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-purple-800">Cabin</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-purple-800">Departure</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-purple-800">Arrival</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-purple-800">One-Way</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-purple-800">Round-Trip</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-purple-800">Includes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedRates.sleepingTrains.map((rate, index) => (
                    <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-white' : 'bg-purple-50/30'} hover:bg-purple-50 transition-colors`}>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{rate.origin_city} → {rate.destination_city}</p>
                          <p className="text-xs text-gray-500">{rate.operator_name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          rate.cabin_type === 'single' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {rate.cabin_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-700">
                        {rate.departure_time || '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-700">
                        {rate.arrival_time || '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                        {display(rate.rate_oneway_eur, 'EUR')}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-purple-600">
                        {rate.rate_roundtrip_eur ? display(rate.rate_roundtrip_eur, 'EUR') : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {rate.meals_included || 'Dinner & Breakfast'}
                      </td>
                    </tr>
                  ))}
                  {paginatedRates.sleepingTrains.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                        <span className="text-3xl">🛏️</span>
                        <p className="text-sm font-medium mt-2">No sleeping train rates found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Regular Train Table */}
            {activeTab === 'trains' && (
              <table className="w-full">
                <thead className="bg-orange-50 border-b border-orange-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-orange-800">Route</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-orange-800">Class</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-orange-800">Duration</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-orange-800">Departures</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-orange-800">Rate/Person</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedRates.trains.map((rate, index) => (
                    <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-white' : 'bg-orange-50/30'} hover:bg-orange-50 transition-colors`}>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{rate.origin_city} → {rate.destination_city}</p>
                          <p className="text-xs text-gray-500">{rate.operator_name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          rate.class_type === 'first_class' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {rate.class_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-700">
                        {rate.duration_hours ? `${rate.duration_hours}h` : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {rate.departure_times || '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                        {display(rate.rate_eur, 'EUR')}
                      </td>
                    </tr>
                  ))}
                  {paginatedRates.trains.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                        <span className="text-3xl">🚂</span>
                        <p className="text-sm font-medium mt-2">No train rates found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Airport Staff Table */}
            {activeTab === 'airportStaff' && (
              <table className="w-full">
                <thead className="bg-cyan-50 border-b border-cyan-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-cyan-800">Airport</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-cyan-800">Service</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-cyan-800">Direction</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-cyan-800">Description</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-cyan-800">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedRates.airportStaff.map((rate, index) => (
                    <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-white' : 'bg-cyan-50/30'} hover:bg-cyan-50 transition-colors`}>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{rate.airport_name}</p>
                          <p className="text-xs text-gray-500">{rate.airport_code}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          rate.service_type === 'full_service' ? 'bg-green-100 text-green-800' :
                          rate.service_type === 'customs_assist' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {rate.service_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          rate.direction === 'arrival' ? 'bg-green-100 text-green-800' :
                          rate.direction === 'departure' ? 'bg-orange-100 text-orange-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {rate.direction}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {rate.description || '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                        {displayRate(rate.rate_eur, rate.rate_non_eur)}
                      </td>
                    </tr>
                  ))}
                  {paginatedRates.airportStaff.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                        <span className="text-3xl">✈️</span>
                        <p className="text-sm font-medium mt-2">No airport staff rates found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Hotel Staff Table */}
            {activeTab === 'hotelStaff' && (
              <table className="w-full">
                <thead className="bg-pink-50 border-b border-pink-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-pink-800">Service Code</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-pink-800">Service Type</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-pink-800">Hotel Category</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-pink-800">Description</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-pink-800">Rate/Stay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedRates.hotelStaff.map((rate, index) => (
                    <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-white' : 'bg-pink-50/30'} hover:bg-pink-50 transition-colors`}>
                      <td className="px-4 py-3 text-sm font-mono text-gray-700">
                        {rate.service_code}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          rate.service_type === 'full_service' ? 'bg-green-100 text-green-800' :
                          rate.service_type === 'porter' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {rate.service_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          rate.hotel_category === 'luxury' ? 'bg-amber-100 text-amber-800' :
                          rate.hotel_category === 'standard' ? 'bg-blue-100 text-blue-800' :
                          rate.hotel_category === 'all' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {rate.hotel_category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {rate.description || '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                        {displayRate(rate.rate_eur, rate.rate_non_eur)}
                      </td>
                    </tr>
                  ))}
                  {paginatedRates.hotelStaff.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                        <span className="text-3xl">🛎️</span>
                        <p className="text-sm font-medium mt-2">No hotel staff rates found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Tipping Table */}
            {activeTab === 'tipping' && (
              <table className="w-full">
                <thead className="bg-green-50 border-b border-green-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-green-800">Role</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-green-800">Context</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-green-800">Rate Unit</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-green-800">Description</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-green-800">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedRates.tipping.map((rate, index) => (
                    <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-white' : 'bg-green-50/30'} hover:bg-green-50 transition-colors`}>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          rate.role_type === 'guide' ? 'bg-blue-100 text-blue-800' :
                          rate.role_type === 'driver' ? 'bg-orange-100 text-orange-800' :
                          rate.role_type === 'boat_crew' ? 'bg-cyan-100 text-cyan-800' :
                          rate.role_type === 'porter' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {rate.role_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {rate.context ? (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                            {rate.context.replace('_', ' ')}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-medium">
                          {rate.rate_unit.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {rate.description || '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                        {display(rate.rate_eur, 'EUR')}
                      </td>
                    </tr>
                  ))}
                  {paginatedRates.tipping.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                        <span className="text-3xl">💵</span>
                        <p className="text-sm font-medium mt-2">No tipping rates found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

          </div>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-3 mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-gray-600">
              Page <span className="font-bold text-gray-900">{currentPage}</span> of <span className="font-bold text-gray-900">{totalPages}</span>
            </div>
            
            <div className="flex items-center gap-1">
              {/* First & Previous */}
              <button
                onClick={() => goToPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="First page"
              >
                ««
              </button>
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Previous page"
              >
                ‹ Prev
              </button>
              
              {/* Page Numbers */}
              <div className="flex items-center gap-1 mx-2">
                {getPageNumbers().map((page, index) => (
                  typeof page === 'number' ? (
                    <button
                      key={index}
                      onClick={() => goToPage(page)}
                      className={`w-8 h-8 text-xs rounded transition-colors ${
                        currentPage === page
                          ? 'bg-primary-600 text-white font-bold'
                          : 'border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  ) : (
                    <span key={index} className="px-1 text-gray-400">...</span>
                  )
                ))}
              </div>
              
              {/* Next & Last */}
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Next page"
              >
                Next ›
              </button>
              <button
                onClick={() => goToPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Last page"
              >
                »»
              </button>
            </div>
            
            {/* Quick Jump */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Go to:</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => {
                  const page = parseInt(e.target.value)
                  if (page >= 1 && page <= totalPages) {
                    goToPage(page)
                  }
                }}
                className="w-14 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-600 focus:border-transparent text-center"
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-gray-500 print:hidden">
          <p>© 2024 Autoura Operations System</p>
        </div>
      </main>
    </div>
  )
}