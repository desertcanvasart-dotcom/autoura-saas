'use client'
// @bulk-import
import BulkRateImportExport from '@/app/components/BulkRateImportExport'

import { useState, useEffect, useCallback } from 'react'
import { Search, Plus, Edit2, Trash2, X, Car, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Building2, Copy } from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useCurrency } from '@/hooks/useCurrency'

interface TransportationRate {
  id: string
  route_name: string | null
  service_type: string
  vehicle_type: string | null
  capacity_min: number
  capacity_max: number | null
  city: string
  destination_city?: string | null
  base_rate_eur: number | null
  base_rate_non: number
  base_rate_non_eur?: number | null
  is_active: boolean
  created_at: string
  updated_at: string
  // WIDE columns — one row per route, per-class rates (matches the bulk
  // importer and what the engine/grid expand)
  sedan_rate_eur?: number | null
  sedan_rate_non_eur?: number | null
  sedan_capacity_min?: number | null
  sedan_capacity_max?: number | null
  minivan_rate_eur?: number | null
  minivan_rate_non_eur?: number | null
  minivan_capacity_min?: number | null
  minivan_capacity_max?: number | null
  van_rate_eur?: number | null
  van_rate_non_eur?: number | null
  van_capacity_min?: number | null
  van_capacity_max?: number | null
  minibus_rate_eur?: number | null
  minibus_rate_non_eur?: number | null
  minibus_capacity_min?: number | null
  minibus_capacity_max?: number | null
  bus_rate_eur?: number | null
  bus_rate_non_eur?: number | null
  bus_capacity_min?: number | null
  bus_capacity_max?: number | null
  [key: string]: unknown
}

// One entry per vehicle class in the route-first form. Strings because they
// are text-input bound; blank rate = vehicle not offered on this route.
interface VehicleRateEntry {
  rate_eur: string
  rate_non_eur: string
  capacity_min: string
  capacity_max: string
}
type VehicleClassKey = 'sedan' | 'minivan' | 'van' | 'minibus' | 'bus'
// Capacity defaults mirror the engine's VEHICLE_CAPACITY ladder.
const WIDE_CLASSES: { key: VehicleClassKey; label: string; defMin: number; defMax: number }[] = [
  { key: 'sedan', label: 'Sedan', defMin: 1, defMax: 2 },
  { key: 'minivan', label: 'Minivan', defMin: 3, defMax: 7 },
  { key: 'van', label: 'Van', defMin: 8, defMax: 14 },
  { key: 'minibus', label: 'Minibus', defMin: 15, defMax: 20 },
  { key: 'bus', label: 'Bus', defMin: 21, defMax: 45 },
]
const emptyVehicles = (): Record<VehicleClassKey, VehicleRateEntry> =>
  Object.fromEntries(
    WIDE_CLASSES.map((c) => [c.key, { rate_eur: '', rate_non_eur: '', capacity_min: String(c.defMin), capacity_max: String(c.defMax) }])
  ) as Record<VehicleClassKey, VehicleRateEntry>

interface FormData {
  route_name: string
  service_type: string
  city: string
  destination_city: string
  vehicles: Record<VehicleClassKey, VehicleRateEntry>
  is_active: boolean
}

const initialFormData: FormData = {
  route_name: '',
  service_type: 'airport_transfer',
  city: '',
  destination_city: '',
  vehicles: emptyVehicles(),
  is_active: true
}

const SERVICE_TYPES = [
  { value: 'airport_transfer', label: 'Airport Transfer', needsDestination: false },
  { value: 'city_transfer', label: 'City Transfer', needsDestination: true },
  { value: 'day_tour', label: 'Day Tour', needsDestination: false },
  { value: 'half_day', label: 'Half Day', needsDestination: false },
  { value: 'intercity_day_trip', label: 'Intercity Day Trip', needsDestination: true },
  { value: 'intercity_dropoff', label: 'Intercity Drop-off', needsDestination: true },
  { value: 'intercity_overnight', label: 'Intercity Overnight', needsDestination: true },
  { value: 'long_day_tour', label: 'Long Day Tour', needsDestination: false },
  { value: 'multi_day', label: 'Multi-Day', needsDestination: false },
  { value: 'outside_dinner', label: 'Outside Dinner Transfer', needsDestination: false },
  { value: 'sound_light', label: 'Sound & Light Transfer', needsDestination: false },
]

const VEHICLE_TYPES = [
  { value: 'Sedan', label: 'Sedan', minPax: 1, maxPax: 2 },
  { value: 'Minivan', label: 'Minivan', minPax: 3, maxPax: 8 },
  { value: 'Van', label: 'Van', minPax: 9, maxPax: 14 },
  { value: 'Minibus', label: 'Minibus', minPax: 15, maxPax: 24 },
  { value: 'Bus', label: 'Bus', minPax: 15, maxPax: 45 },
  { value: 'SUV', label: 'SUV', minPax: 1, maxPax: 4 },
  { value: '4x4', label: '4x4', minPax: 1, maxPax: 6 },
]

const CITIES = ['Cairo', 'Giza', 'Luxor', 'Aswan', 'Alexandria', 'Hurghada', 'Sharm El Sheikh', 'Dahab', 'Siwa', 'Marsa Alam']

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

export default function TransportationContent() {
  const dialog = useConfirmDialog()
  const { convert, symbol, userCurrency, loading: currencyLoading } = useCurrency()

  const [rates, setRates] = useState<TransportationRate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [serviceTypeFilter, setServiceTypeFilter] = useState('')
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRate, setEditingRate] = useState<TransportationRate | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  const fetchRates = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (cityFilter) params.append('city', cityFilter)
      if (serviceTypeFilter) params.append('serviceType', serviceTypeFilter)
      // vehicleType is filtered CLIENT-side: the API's eq('vehicle_type')
      // would exclude wide rows (vehicle_type is NULL on route-level rows).
      if (!showInactive) params.append('activeOnly', 'true')
      
      const response = await fetch(`/api/resources/transportation?${params}`)
      if (response.ok) {
        const data = await response.json()
        setRates(data)
      }
    } catch (error) {
      console.error('Error fetching transportation rates:', error)
    } finally {
      setLoading(false)
    }
  }, [cityFilter, serviceTypeFilter, vehicleTypeFilter, showInactive])

  useEffect(() => {
    fetchRates()
  }, [fetchRates])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, cityFilter, serviceTypeFilter, vehicleTypeFilter, showInactive, itemsPerPage])

  // Check if service type needs destination city
  const needsDestinationCity = (serviceType: string) => {
    const type = SERVICE_TYPES.find(t => t.value === serviceType)
    return type?.needsDestination || false
  }

  // Route-level code — one row per route now, so no vehicle suffix.
  const generateServiceCode = (city: string, serviceType: string, destinationCity?: string) => {
    if (!city) return ''
    const cityCode = city.toUpperCase().replace(/\s+/g, '-')
    const typeCode = serviceType.toUpperCase().replace(/_/g, '-')

    // For intercity, include destination
    if (needsDestinationCity(serviceType) && destinationCity) {
      const destCode = destinationCity.toUpperCase().replace(/\s+/g, '-')
      return `${cityCode}-TO-${destCode}`
    }

    return `${cityCode}-${typeCode}`
  }

  const handleVehicleFieldChange = (cls: VehicleClassKey, field: keyof VehicleRateEntry, value: string) => {
    setFormData(prev => ({
      ...prev,
      vehicles: { ...prev.vehicles, [cls]: { ...prev.vehicles[cls], [field]: value } }
    }))
  }

  const handleCityChange = (city: string) => {
    setFormData(prev => ({
      ...prev,
      city,
      route_name: prev.route_name || generateServiceCode(city, prev.service_type, prev.destination_city)
    }))
  }

  const handleDestinationCityChange = (destinationCity: string) => {
    setFormData(prev => ({
      ...prev,
      destination_city: destinationCity,
      route_name: generateServiceCode(prev.city, prev.service_type, destinationCity)
    }))
  }

  const handleServiceTypeChange = (serviceType: string) => {
    const needsDest = needsDestinationCity(serviceType)
    setFormData(prev => ({
      ...prev,
      service_type: serviceType,
      destination_city: needsDest ? prev.destination_city : '',
      route_name: generateServiceCode(prev.city, serviceType, needsDest ? prev.destination_city : '')
    }))
  }

  // Load an existing row into the vehicle grid. Wide rows fill their classes;
  // a legacy tall row (single vehicle_type + base_rate) fills just that class.
  const rowToVehicles = (rate: TransportationRate): Record<VehicleClassKey, VehicleRateEntry> => {
    const vehicles = emptyVehicles()
    let hasWide = false
    for (const c of WIDE_CLASSES) {
      const rateEur = Number(rate[`${c.key}_rate_eur`])
      if (rateEur > 0) {
        hasWide = true
        vehicles[c.key] = {
          rate_eur: String(rateEur),
          rate_non_eur: rate[`${c.key}_rate_non_eur`] != null ? String(rate[`${c.key}_rate_non_eur`]) : '',
          capacity_min: rate[`${c.key}_capacity_min`] != null ? String(rate[`${c.key}_capacity_min`]) : String(c.defMin),
          capacity_max: rate[`${c.key}_capacity_max`] != null ? String(rate[`${c.key}_capacity_max`]) : String(c.defMax),
        }
      }
    }
    if (!hasWide && rate.vehicle_type && Number(rate.base_rate_eur) > 0) {
      const cls = WIDE_CLASSES.find(c => c.label.toLowerCase() === String(rate.vehicle_type).toLowerCase())
      if (cls) {
        vehicles[cls.key] = {
          rate_eur: String(rate.base_rate_eur),
          rate_non_eur: rate.base_rate_non_eur != null ? String(rate.base_rate_non_eur) : (rate.base_rate_non ? String(rate.base_rate_non) : ''),
          capacity_min: rate.capacity_min ? String(rate.capacity_min) : String(cls.defMin),
          capacity_max: rate.capacity_max ? String(rate.capacity_max) : String(cls.defMax),
        }
      }
    }
    return vehicles
  }

  const openAddModal = () => {
    setEditingRate(null)
    setFormData(initialFormData)
    setError(null)
    setIsModalOpen(true)
  }

  const openEditModal = (rate: TransportationRate) => {
    setEditingRate(rate)
    setError(null)
    setFormData({
      route_name: rate.route_name || '',
      service_type: rate.service_type,
      city: rate.city,
      destination_city: rate.destination_city || '',
      vehicles: rowToVehicles(rate),
      is_active: rate.is_active
    })
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    // Validation
    if (!formData.city) {
      setError('Please select a departure city')
      setSaving(false)
      return
    }

    // Validate destination city for intercity services
    if (needsDestinationCity(formData.service_type) && !formData.destination_city) {
      setError('Please select a destination city for intercity/city transfer services')
      setSaving(false)
      return
    }

    if (needsDestinationCity(formData.service_type) && formData.city === formData.destination_city) {
      setError('Departure and destination cities must be different')
      setSaving(false)
      return
    }

    const offeredClasses = WIDE_CLASSES.filter(c => parseFloat(formData.vehicles[c.key].rate_eur) > 0)
    if (offeredClasses.length === 0) {
      setError('Enter a EUR rate for at least one vehicle (leave others blank if not offered)')
      setSaving(false)
      return
    }
    const badCapacity = offeredClasses.find(c => {
      const v = formData.vehicles[c.key]
      const min = parseInt(v.capacity_min)
      const max = parseInt(v.capacity_max)
      return Number.isFinite(min) && Number.isFinite(max) && min > max
    })
    if (badCapacity) {
      setError(`${badCapacity.label}: capacity min cannot exceed max`)
      setSaving(false)
      return
    }

    try {
      const url = editingRate
        ? `/api/resources/transportation/${editingRate.id}`
        : '/api/resources/transportation'

      // One WIDE row per route: rates per vehicle class.
      // Single-rate entry: mirror the EUR rate into the non-EU column so both
      // DB columns stay filled and nationality-based selection keeps working.
      const submitData = {
        ...formData,
        vehicles: Object.fromEntries(
          Object.entries(formData.vehicles).map(([key, v]) => [key, { ...v, rate_non_eur: v.rate_eur }])
        ) as Record<VehicleClassKey, VehicleRateEntry>,
      }
      
      const response = await fetch(url, {
        method: editingRate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData)
      })

      const result = await response.json()

      if (response.ok) {
        setIsModalOpen(false)
        fetchRates()
      } else {
        setError(result.error || 'Failed to save transportation rate')
      }
    } catch (error) {
      console.error('Error saving transportation rate:', error)
      setError('Failed to save transportation rate. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (rate: TransportationRate) => {
    const confirmed = await dialog.confirmDelete('Transportation Rate',
      `Are you sure you want to delete "${rate.route_name || rate.city}"? This action cannot be undone.`
    )

    if (!confirmed) return

    try {
      const response = await fetch(`/api/resources/transportation/${rate.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        fetchRates()
        await dialog.alert('Deleted', 'Transportation rate has been deleted.', 'success')
      } else {
        await dialog.alert('Error', 'Failed to delete transportation rate. Please try again.', 'warning')
      }
    } catch (error) {
      console.error('Error deleting transportation rate:', error)
      await dialog.alert('Error', 'Failed to delete transportation rate. Please try again.', 'warning')
    }
  }

  // Clone a rate - copy all fields to form and open modal for new entry
  const handleClone = (rate: TransportationRate) => {
    setEditingRate(null)
    setError(null)
    setFormData({
      route_name: (rate.route_name || '') + ' (copy)',
      service_type: rate.service_type,
      city: rate.city,
      destination_city: rate.destination_city || '',
      vehicles: rowToVehicles(rate),
      is_active: rate.is_active
    })
    setIsModalOpen(true)
  }

  // Export filtered rates to CSV
  // Import rates from CSV file
  // Filter rates
  const filteredRates = rates.filter(rate => {
    const matchesSearch =
      (rate.route_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rate.vehicle_type || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rate.destination_city && rate.destination_city.toLowerCase().includes(searchTerm.toLowerCase()))
    if (!matchesSearch) return false
    if (vehicleTypeFilter) {
      const cls = WIDE_CLASSES.find(c => c.label === vehicleTypeFilter)
      const offersWide = cls ? Number(rate[`${cls.key}_rate_eur`]) > 0 : false
      const matchesLegacy = (rate.vehicle_type || '') === vehicleTypeFilter
      if (!offersWide && !matchesLegacy) return false
    }
    return true
  })

  // Pagination calculations
  const totalItems = filteredRates.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)
  const paginatedRates = filteredRates.slice(startIndex, endIndex)

  // Pagination handlers
  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  const goToFirstPage = () => goToPage(1)
  const goToLastPage = () => goToPage(totalPages)
  const goToPrevPage = () => goToPage(currentPage - 1)
  const goToNextPage = () => goToPage(currentPage + 1)

  // Stats
  const totalRates = rates.length
  const activeRates = rates.filter(r => r.is_active).length
  const inactiveRates = totalRates - activeRates
  const uniqueCities = [...new Set(rates.map(r => r.city))].length
  const uniqueVehicleTypes = [...new Set(rates.flatMap(r => {
    const wide = WIDE_CLASSES.filter(c => Number(r[`${c.key}_rate_eur`]) > 0).map(c => c.label)
    return wide.length > 0 ? wide : (r.vehicle_type ? [r.vehicle_type] : [])
  }))].length

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Car className="h-5 w-5 text-blue-600" />
          <h1 className="text-lg font-semibold text-gray-900">Transportation Rates</h1>
        </div>
        <div className="flex items-center gap-2">
          <BulkRateImportExport tableName="transportation_rates" onImportComplete={fetchRates} />
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#647C47] text-white text-sm rounded-md hover:bg-[#4f6238] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Rate
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-xs text-gray-500">Total Rates</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{totalRates}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-xs text-gray-500">Active</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{activeRates}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gray-400"></div>
            <span className="text-xs text-gray-500">Inactive</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{inactiveRates}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-500"></div>
            <span className="text-xs text-gray-500">Cities</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{uniqueCities}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
            <span className="text-xs text-gray-500">Vehicle Types</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{uniqueVehicleTypes}</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search rates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
          />
        </div>

        <div className="relative">
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
          >
            <option value="">All Cities</option>
            {CITIES.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={serviceTypeFilter}
            onChange={(e) => setServiceTypeFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
          >
            <option value="">All Service Types</option>
            {SERVICE_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={vehicleTypeFilter}
            onChange={(e) => setVehicleTypeFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
          >
            <option value="">All Vehicles</option>
            {VEHICLE_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        <button
          onClick={() => setShowInactive(!showInactive)}
          className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
            showInactive 
              ? 'bg-gray-100 border-gray-300 text-gray-700' 
              : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          {showInactive ? 'Hide Inactive' : 'Show Inactive'}
        </button>
      </div>

      {/* Table — one row per route, vehicles as chips */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Route Name</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Service Type</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Vehicles &amp; Rates ({userCurrency})</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Route</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Status</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedRates.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                  No transportation rates found
                </td>
              </tr>
            ) : (
              paginatedRates.map((rate) => {
                const isIntercity = needsDestinationCity(rate.service_type)
                return (
                  <tr key={rate.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <span className="text-sm font-medium text-gray-900">{rate.route_name || '—'}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-sm text-gray-600">
                        {SERVICE_TYPES.find(t => t.value === rate.service_type)?.label || rate.service_type}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {/* One cell per route: every offered vehicle with its rate.
                          Legacy tall rows fall back to their single vehicle. */}
                      <div className="flex flex-wrap gap-1">
                        {(() => {
                          const chips = WIDE_CLASSES
                            .filter(c => Number(rate[`${c.key}_rate_eur`]) > 0)
                            .map(c => ({ label: c.label, eur: Number(rate[`${c.key}_rate_eur`]) }))
                          if (chips.length === 0 && rate.vehicle_type && Number(rate.base_rate_eur) > 0) {
                            chips.push({ label: rate.vehicle_type, eur: Number(rate.base_rate_eur) })
                          }
                          return chips.length > 0 ? chips.map(chip => (
                            <span key={chip.label} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-700">
                              <span className="font-medium">{chip.label}</span>
                              <span>{symbol}{convert(chip.eur).toFixed(0)}</span>
                            </span>
                          )) : <span className="text-sm text-gray-400">—</span>
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {isIntercity && rate.destination_city ? (
                        <div className="flex items-center gap-1 text-sm">
                          <span className="text-gray-900">{rate.city}</span>
                          <span className="text-gray-400">→</span>
                          <span className="text-gray-900">{rate.destination_city}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-600">{rate.city}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        rate.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {rate.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(rate)}
                          className="p-1 text-gray-400 hover:text-[#647C47] transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleClone(rate)}
                          className="p-1 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                          title="Duplicate"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(rate)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalItems > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Show</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] bg-white"
                >
                  {ITEMS_PER_PAGE_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <span className="text-sm text-gray-500">per page</span>
              </div>
              <span className="text-sm text-gray-500">
                Showing {startIndex + 1}-{endIndex} of {totalItems} rates
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={goToFirstPage}
                disabled={currentPage === 1}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                title="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                onClick={goToPrevPage}
                disabled={currentPage === 1}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                title="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {/* Page numbers */}
              <div className="flex items-center gap-1 mx-2">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number
                  if (totalPages <= 5) {
                    pageNum = i + 1
                  } else if (currentPage <= 3) {
                    pageNum = i + 1
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i
                  } else {
                    pageNum = currentPage - 2 + i
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => goToPage(pageNum)}
                      className={`min-w-[32px] h-8 px-2 text-sm rounded-md transition-colors ${
                        currentPage === pageNum
                          ? 'bg-[#647C47] text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  )
                })}
              </div>

              <button
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                title="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={goToLastPage}
                disabled={currentPage === totalPages}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                title="Last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal — route once, vehicle-rate grid */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingRate ? 'Edit Transportation Rate' : 'Add Transportation Rate'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2">Basic Information</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Service Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.service_type}
                      onChange={(e) => handleServiceTypeChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    >
                      {SERVICE_TYPES.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>

                </div>

                {/* Route - Departure & Destination */}
                <div className={`grid gap-4 ${needsDestinationCity(formData.service_type) ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      {needsDestinationCity(formData.service_type) ? 'Departure City' : 'City'} <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.city}
                      onChange={(e) => handleCityChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    >
                      <option value="">Select City</option>
                      {CITIES.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>

                  {needsDestinationCity(formData.service_type) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1.5">
                        Destination City <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.destination_city}
                        onChange={(e) => handleDestinationCityChange(e.target.value)}
                        required
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                      >
                        <option value="">Select Destination</option>
                        {CITIES.filter(city => city !== formData.city).map(city => (
                          <option key={city} value={city}>{city}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Show route preview for intercity */}
                {needsDestinationCity(formData.service_type) && formData.city && formData.destination_city && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-md">
                    <span className="text-sm text-blue-700">Route:</span>
                    <span className="text-sm font-medium text-blue-900">{formData.city}</span>
                    <span className="text-blue-400">→</span>
                    <span className="text-sm font-medium text-blue-900">{formData.destination_city}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Route Name
                    </label>
                    <input
                      type="text"
                      value={formData.route_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, route_name: e.target.value }))}
                      placeholder="Auto-generated from city & type"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    />
                  </div>

                </div>
              </div>

              {/* Vehicle rates — one row per class, the whole route in one save.
                  Blank EUR rate = vehicle not offered on this route. */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="text-sm font-medium text-gray-700">Vehicle Rates</h3>
                  <span className="text-xs text-gray-400">EUR base · leave blank if a vehicle is not offered</span>
                </div>

                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-2">Vehicle</th>
                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-2">Rate (€)</th>
                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-2">Min Pax</th>
                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-2">Max Pax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {WIDE_CLASSES.map(cls => {
                        const v = formData.vehicles[cls.key]
                        const offered = parseFloat(v.rate_eur) > 0
                        return (
                          <tr key={cls.key} className={offered ? 'bg-white' : 'bg-gray-50/50'}>
                            <td className="px-3 py-1.5">
                              <span className={`text-sm font-medium ${offered ? 'text-gray-900' : 'text-gray-400'}`}>{cls.label}</span>
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number" step="0.01" min="0" placeholder="—"
                                value={v.rate_eur}
                                onChange={(e) => handleVehicleFieldChange(cls.key, 'rate_eur', e.target.value)}
                                className="w-24 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#647C47]"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number" min="1"
                                value={v.capacity_min}
                                onChange={(e) => handleVehicleFieldChange(cls.key, 'capacity_min', e.target.value)}
                                className="w-16 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#647C47]"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number" min="1"
                                value={v.capacity_max}
                                onChange={(e) => handleVehicleFieldChange(cls.key, 'capacity_max', e.target.value)}
                                className="w-16 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#647C47]"
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Additional Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2">Additional Information</h3>
                
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="h-4 w-4 text-[#647C47] border-gray-300 rounded focus:ring-[#647C47]"
                  />
                  <label htmlFor="is_active" className="text-sm text-gray-600">
                    Active (available for booking)
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-[#647C47] text-white rounded-md hover:bg-[#4f6238] transition-colors disabled:opacity-50 min-w-[100px]"
                >
                  {saving ? 'Saving...' : editingRate ? 'Update Rate' : 'Add Rate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}