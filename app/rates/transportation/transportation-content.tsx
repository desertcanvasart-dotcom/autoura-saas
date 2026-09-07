'use client'
// @bulk-import
import BulkRateImportExport from '@/app/components/BulkRateImportExport'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Edit2, Trash2, X, Car, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Building2, Copy } from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { VocabSelect, VocabLabel } from '@/components/vocabulary'
import { useVocabulary } from '@/hooks/useVocabulary'
import { needsDestination } from '@/lib/vocabulary'
import { useDestinationCities } from '@/hooks/useDestinationCities'
import { useCurrency } from '@/hooks/useCurrency'
import RateCurrencyField, { rateCurrencyPatch } from '@/app/components/RateCurrencyField'
import { useRateCurrency, useRateRowFormat } from '@/hooks/useRateCurrencySymbol'

interface TransportationRate {
  // The currency this row's amounts are in; blank means the tenant's.
  rate_currency?: string | null
  id: string
  route_name: string | null
  service_type: string
  /** A vehicle key from the tenant's vocabulary ('sedan'); older rows may carry a label. */
  vehicle_type: string
  capacity_min: number | null
  capacity_max: number | null
  city: string
  origin_city?: string | null
  destination_city?: string | null
  duration?: string | null
  area?: string | null
  includes?: string | null
  /** The transport company this route is bought from (migration 355). */
  supplier_id?: string | null
  base_rate_eur: number | null
  base_rate_non: number
  base_rate_non_eur?: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/** A route as the page shows it: every vehicle priced on it (one row each,
 *  migration 337). `id` is the first row's, so selection and keys work. */
interface RouteGroup extends TransportationRate {
  rows: TransportationRate[]
  ids: string[]
  vehicles: { key: string; eur: number }[]
}

const routeKeyOf = (r: TransportationRate) =>
  [r.service_type, r.city, r.route_name ?? '', r.origin_city ?? '', r.destination_city ?? '', r.duration ?? '', r.area ?? ''].map(v => String(v).toLowerCase()).join('|')

function groupRoutes(rows: TransportationRate[]): RouteGroup[] {
  const groups = new Map<string, RouteGroup>()
  for (const r of rows) {
    const k = routeKeyOf(r)
    const g = groups.get(k)
    const chip = { key: String(r.vehicle_type || '').toLowerCase(), eur: Number(r.base_rate_eur) || 0 }
    if (g) { g.rows.push(r); g.ids.push(r.id); g.vehicles.push(chip); g.is_active = g.is_active || r.is_active }
    else groups.set(k, { ...r, rows: [r], ids: [r.id], vehicles: [chip] })
  }
  return [...groups.values()]
}

// One entry per vehicle in the route-first form. Strings because they are
// text-input bound; blank rate = vehicle not offered on this route.
interface VehicleRateEntry {
  rate_eur: string
  rate_non_eur: string
  capacity_min: string
  capacity_max: string
}
interface VehicleClass { key: string; label: string; defMin: number; defMax: number }
const emptyVehicles = (classes: VehicleClass[]): Record<string, VehicleRateEntry> =>
  Object.fromEntries(
    classes.map((c) => [c.key, { rate_eur: '', rate_non_eur: '', capacity_min: String(c.defMin), capacity_max: String(c.defMax) }])
  )

interface FormData {
  route_name: string
  service_type: string
  city: string
  destination_city: string
  vehicles: Record<string, VehicleRateEntry>
  supplier_id: string
  is_active: boolean
}

const initialFormData: FormData = {
  route_name: '',
  service_type: 'airport_transfer',
  city: '',
  destination_city: '',
  vehicles: {},
  supplier_id: '',
  is_active: true
}

interface Supplier {
  id: string
  name: string
  city?: string | null
}



const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

export default function TransportationContent() {
  const dialog = useConfirmDialog()
  const { cities: cityOptions } = useDestinationCities()
  const { loading: currencyLoading } = useCurrency()

  const { fmtRate } = useRateRowFormat()
  // The agency's vehicles (Settings → Your vocabulary), with their passenger bands.
  const { items: vehicleItems } = useVocabulary('vehicle_type')
  const vehicleClasses = useMemo<VehicleClass[]>(() => vehicleItems.map(v => ({
    key: v.key, label: v.label,
    defMin: Number(v.meta?.min_pax ?? 1) || 1, defMax: Number(v.meta?.max_pax ?? 4) || 4,
  })), [vehicleItems])
  const [rates, setRates] = useState<TransportationRate[]>([])
  const routes = useMemo(() => groupRoutes(rates), [rates])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [serviceTypeFilter, setServiceTypeFilter] = useState('')
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRate, setEditingRate] = useState<RouteGroup | null>(null)
  // Which currency this rate's amounts are entered in ('' = EUR default)
  const [rateCurrency, setRateCurrency] = useState('')
  // Labels must name the currency the amounts are actually in (C3.4b).
  const { symbol: rateSymbol } = useRateCurrency(rateCurrency)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  // Transport companies — the supplier types that behave as transport_company
  // (Settings → Your vocabulary), active only.
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const supplierName = (id?: string | null) => (id && suppliers.find(s => s.id === id)?.name) || null
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

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

  useEffect(() => {
    let cancelled = false
    fetch('/api/suppliers?type=transport_company&status=active')
      .then(r => r.json())
      .then(d => { if (!cancelled) setSuppliers(Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []) })
      .catch(err => console.error('Error fetching transport suppliers:', err))
    return () => { cancelled = true }
  }, [])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
    // A selection made under one filter must not carry into another,
    // or a bulk action hits invisible, stale rows.
    setSelectedIds(new Set())
  }, [searchTerm, cityFilter, serviceTypeFilter, vehicleTypeFilter, showInactive, itemsPerPage])

  // Check if service type needs destination city
  // The agency's journey types (Settings → Your vocabulary); each carries
  // whether it needs a destination city (meta.needs_destination).
  const { items: serviceTypeItems } = useVocabulary('transport_service_type')
  const needsDestinationCity = (serviceType: string) => needsDestination(serviceTypeItems, serviceType)

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

  const handleVehicleFieldChange = (cls: string, field: keyof VehicleRateEntry, value: string) => {
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

  // Load a route's rows into the vehicle grid: every vehicle in the agency's
  // list, filled where the route prices it. A row whose vehicle is no longer
  // in the list still shows, so editing never silently drops it.
  const rowToVehicles = (group: RouteGroup): Record<string, VehicleRateEntry> => {
    const vehicles = emptyVehicles(vehicleClasses)
    for (const r of group.rows) {
      const key = String(r.vehicle_type || '').toLowerCase()
      const cls = vehicleClasses.find(c => c.key === key)
      vehicles[key] = {
        rate_eur: Number(r.base_rate_eur) > 0 ? String(r.base_rate_eur) : '',
        rate_non_eur: r.base_rate_non_eur != null ? String(r.base_rate_non_eur) : '',
        capacity_min: r.capacity_min != null ? String(r.capacity_min) : String(cls?.defMin ?? 1),
        capacity_max: r.capacity_max != null ? String(r.capacity_max) : String(cls?.defMax ?? 4),
      }
    }
    return vehicles
  }
  /** The grid's rows: the agency's vehicles, plus any vehicle a route still carries. */
  const gridClasses = (vehicles: Record<string, VehicleRateEntry>): VehicleClass[] => [
    ...vehicleClasses,
    ...Object.keys(vehicles).filter(k => !vehicleClasses.some(c => c.key === k)).map(k => ({ key: k, label: k, defMin: 1, defMax: 4 })),
  ]

  const openAddModal = () => {
    setEditingRate(null)
    setRateCurrency('')
    setFormData({ ...initialFormData, vehicles: emptyVehicles(vehicleClasses) })
    setError(null)
    setIsModalOpen(true)
  }

  const openEditModal = (rate: RouteGroup) => {
    setEditingRate(rate)
    setRateCurrency((rate as { rate_currency?: string | null }).rate_currency || '')
    setError(null)
    setFormData({
      route_name: rate.route_name || '',
      service_type: rate.service_type,
      city: rate.city,
      destination_city: rate.destination_city || '',
      vehicles: rowToVehicles(rate),
      supplier_id: rate.supplier_id || '',
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

    const classes = gridClasses(formData.vehicles)
    const offeredClasses = classes.filter(c => parseFloat(formData.vehicles[c.key]?.rate_eur ?? '') > 0)
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
      // One row per offered vehicle. The route endpoint updates the route's
      // existing rows in place, adds new vehicles and removes the ones left
      // blank. Single-rate entry: the EUR rate is mirrored server-side.
      const submitData = {
        route_name: formData.route_name,
        service_type: formData.service_type,
        city: formData.city,
        destination_city: formData.destination_city,
        supplier_id: formData.supplier_id || null,
        is_active: formData.is_active,
        ...rateCurrencyPatch(rateCurrency, editingRate?.rate_currency),
        vehicles: offeredClasses.map(c => ({ vehicle_type: c.key, ...formData.vehicles[c.key] })),
        existing_ids: editingRate?.ids ?? [],
      }
      const response = await fetch('/api/resources/transportation', {
        method: 'POST',
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

  const handleDelete = async (rate: RouteGroup) => {
    const confirmed = await dialog.confirmDelete('Transportation Rate',
      `Are you sure you want to delete "${rate.route_name || rate.city}" (${rate.ids.length} vehicle${rate.ids.length === 1 ? '' : 's'})? This action cannot be undone.`
    )

    if (!confirmed) return

    try {
      // A route is its rows: delete every vehicle on it.
      const responses = await Promise.all(rate.ids.map(id => fetch(`/api/resources/transportation/${id}`, { method: 'DELETE' })))
      const response = responses.find(r => !r.ok) ?? responses[0]

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

  // Bulk selection handlers
  const handleSelectRate = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    if (filteredRates.length > 0 && filteredRates.every(r => selectedIds.has(r.id))) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredRates.map(r => r.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return

    const confirmed = await dialog.confirmDelete('Transportation Rates',
      `Delete ${selectedIds.size} selected rate(s)? This action cannot be undone.`
    )

    if (!confirmed) return

    setBulkDeleting(true)
    try {
      // Selection is by ROUTE; each route is its rows.
      const ids = Array.from(selectedIds)
      const rowIdsOf = (routeId: string) => routes.find(r => r.id === routeId)?.ids ?? [routeId]
      const results = await Promise.allSettled(
        ids.map(async routeId => {
          const rs = await Promise.all(rowIdsOf(routeId).map(id => fetch(`/api/resources/transportation/${id}`, { method: 'DELETE' })))
          return rs.find(r => !r.ok) ?? rs[0]
        })
      )
      const deletedIds = ids.filter((_, i) => {
        const result = results[i]
        return result.status === 'fulfilled' && result.value.ok
      })

      fetchRates()
      setSelectedIds(prev => {
        const next = new Set(prev)
        deletedIds.forEach(id => next.delete(id))
        return next
      })

      if (deletedIds.length === ids.length) {
        await dialog.alert('Deleted', `${deletedIds.length} transportation rate(s) have been deleted.`, 'success')
      } else {
        await dialog.alert('Partial Delete',
          `Deleted ${deletedIds.length} of ${ids.length} — ${ids.length - deletedIds.length} failed. Please try again.`,
          'warning'
        )
      }
    } catch (error) {
      console.error('Error bulk deleting transportation rates:', error)
      await dialog.alert('Error', 'Failed to delete transportation rates. Please try again.', 'warning')
    } finally {
      setBulkDeleting(false)
    }
  }

  // Clone a rate - copy all fields to form and open modal for new entry
  const handleClone = (rate: RouteGroup) => {
    setRateCurrency((rate as { rate_currency?: string | null }).rate_currency || '')
    setEditingRate(null)
    setError(null)
    setFormData({
      route_name: (rate.route_name || '') + ' (copy)',
      service_type: rate.service_type,
      city: rate.city,
      destination_city: rate.destination_city || '',
      vehicles: rowToVehicles(rate),
      supplier_id: rate.supplier_id || '',
      is_active: rate.is_active
    })
    setIsModalOpen(true)
  }

  // Export filtered rates to CSV
  // Import rates from CSV file
  // Filter rates
  const filteredRates = routes.filter(rate => {
    const matchesSearch =
      (rate.route_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.vehicles.some(v => v.key.includes(searchTerm.toLowerCase())) ||
      (rate.destination_city && rate.destination_city.toLowerCase().includes(searchTerm.toLowerCase()))
    if (!matchesSearch) return false
    if (vehicleTypeFilter) {
      // The filter value is a vocabulary KEY ('sedan'); rows store keys, older rows may carry the label.
      if (!rate.vehicles.some(v => v.key === vehicleTypeFilter.toLowerCase())) return false
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
  const totalRates = routes.length
  const activeRates = routes.filter(r => r.is_active).length
  const inactiveRates = totalRates - activeRates
  const uniqueCities = [...new Set(rates.map(r => r.city))].length
  const uniqueVehicleTypes = [...new Set(rates.map(r => String(r.vehicle_type || '').toLowerCase()).filter(Boolean))].length

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
          <input
            type="text"
            placeholder="Search rates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-3 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
          />
        </div>

        <div className="relative">
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
          >
            <option value="">All Cities</option>
            {cityOptions.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <VocabSelect kind="transport_service_type" value={serviceTypeFilter} onChange={setServiceTypeFilter} placeholder={"All Service Types"}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-white" />
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <VocabSelect kind="vehicle_type" value={vehicleTypeFilter} onChange={setVehicleTypeFilter} placeholder="All Vehicles"
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-white" />
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

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-red-50 border border-red-200 rounded-md">
          <span className="text-sm font-medium text-gray-700">{selectedIds.size} selected</span>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Clear selection
          </button>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-4 w-4" />
            {bulkDeleting ? 'Deleting...' : 'Delete Selected'}
          </button>
        </div>
      )}

      {/* Table — one row per route, vehicles as chips */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-10 px-4 py-2">
                <input
                  type="checkbox"
                  checked={filteredRates.length > 0 && filteredRates.every(r => selectedIds.has(r.id))}
                  onChange={handleSelectAll}
                  className="h-4 w-4 text-[#647C47] border-gray-300 rounded focus:ring-[#647C47]"
                  aria-label="Select all rates"
                />
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Route Name</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Service Type</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Vehicles &amp; Rates</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Route</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Status</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedRates.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                  No transportation rates found
                </td>
              </tr>
            ) : (
              paginatedRates.map((rate) => {
                const isIntercity = needsDestinationCity(rate.service_type)
                return (
                  <tr key={rate.id} className="hover:bg-gray-50">
                    <td className="w-10 px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(rate.id)}
                        onChange={() => handleSelectRate(rate.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 text-[#647C47] border-gray-300 rounded focus:ring-[#647C47]"
                        aria-label={`Select ${rate.route_name || rate.city}`}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-sm font-medium text-gray-900">{rate.route_name || '—'}</span>
                      {supplierName(rate.supplier_id) && (
                        <p className="text-xs text-gray-500">{supplierName(rate.supplier_id)}</p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-sm text-gray-600">
                        <VocabLabel kind="transport_service_type" value={rate.service_type} />
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {/* One cell per route: every offered vehicle with its rate.
                          Legacy tall rows fall back to their single vehicle. */}
                      <div className="flex flex-wrap gap-1">
                        {rate.vehicles.length > 0 ? rate.vehicles.map(chip => (
                          <span key={chip.key} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-700">
                            <span className="font-medium"><VocabLabel kind="vehicle_type" value={chip.key} /></span>
                            <span>{fmtRate(chip.eur, rate, 0)}</span>
                          </span>
                        )) : <span className="text-sm text-gray-400">—</span>}
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
                    <VocabSelect kind="transport_service_type" value={formData.service_type} onChange={handleServiceTypeChange} placeholder={null} required
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]" />
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
                      {cityOptions.map(city => (
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
                        {cityOptions.filter(city => city !== formData.city).map(city => (
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

                <RateCurrencyField compact className="mb-2 max-w-xs" value={rateCurrency} onChange={setRateCurrency} />

                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-2">Vehicle</th>
                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-2">Rate ({rateSymbol})</th>
                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-2">Min Pax</th>
                        <th className="text-left text-xs font-medium text-gray-500 px-3 py-2">Max Pax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {gridClasses(formData.vehicles).map(cls => {
                        const v = formData.vehicles[cls.key] ?? { rate_eur: '', rate_non_eur: '', capacity_min: String(cls.defMin), capacity_max: String(cls.defMax) }
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
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Transport company</label>
                  <select
                    value={formData.supplier_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, supplier_id: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47] focus:border-transparent bg-white"
                  >
                    <option value="">No supplier linked</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ''}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-400">
                    Who drives this route. Only suppliers whose type behaves as a transport company are listed; add one under CRM → Suppliers.
                  </p>
                </div>

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