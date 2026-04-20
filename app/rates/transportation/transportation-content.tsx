'use client'
// @bulk-import
import BulkRateImportExport from '@/app/components/BulkRateImportExport'

import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  Car,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Building2,
  Copy,
  Download,
  Upload
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useCurrency } from '@/hooks/useCurrency'

interface TransportationRate {
  id: string
  service_code: string
  service_type: string
  vehicle_type: string
  capacity_min: number
  capacity_max: number
  city: string
  destination_city?: string | null
  base_rate_eur: number
  base_rate_non: number
  base_rate_non_eur?: number
  season: string | null
  rate_valid_from: string
  rate_valid_to: string
  supplier_id: string | null  // NEW: linked to suppliers table
  supplier_name: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  // Joined supplier data
  suppliers?: { id: string; name: string; city?: string } | null
}

// NEW: Supplier interface for dropdown
interface Supplier {
  id: string
  name: string
  type: string
  city?: string
  status?: string
}

interface FormData {
  service_code: string
  service_type: string
  vehicle_type: string
  capacity_min: number
  capacity_max: number
  city: string
  destination_city: string
  base_rate_eur: number
  base_rate_non: number
  season: string
  rate_valid_from: string
  rate_valid_to: string
  supplier_id: string  // NEW: linked supplier
  supplier_name: string
  notes: string
  is_active: boolean
}

const initialFormData: FormData = {
  service_code: '',
  service_type: 'airport_transfer',
  vehicle_type: 'Sedan',
  capacity_min: 1,
  capacity_max: 2,
  city: '',
  destination_city: '',
  base_rate_eur: 0,
  base_rate_non: 0,
  season: '',
  rate_valid_from: new Date().toISOString().split('T')[0],
  rate_valid_to: '2099-12-31',
  supplier_id: '',  // NEW
  supplier_name: '',
  notes: '',
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([])  // NEW: suppliers list
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [serviceTypeFilter, setServiceTypeFilter] = useState('')
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')  // NEW: filter by supplier
  const [showInactive, setShowInactive] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRate, setEditingRate] = useState<TransportationRate | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  // NEW: Fetch suppliers for dropdown
  const fetchSuppliers = useCallback(async () => {
    try {
      const response = await fetch('/api/suppliers?status=active')
      if (response.ok) {
        const result = await response.json()
        // Filter to only transport-related suppliers
        const transportSuppliers = (result.data || []).filter((s: Supplier) => 
          ['transport_company', 'transport', 'driver'].includes(s.type)
        )
        setSuppliers(transportSuppliers)
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error)
    }
  }, [])

  const fetchRates = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (cityFilter) params.append('city', cityFilter)
      if (serviceTypeFilter) params.append('serviceType', serviceTypeFilter)
      if (vehicleTypeFilter) params.append('vehicleType', vehicleTypeFilter)
      if (supplierFilter) params.append('supplier_id', supplierFilter)  // NEW
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
  }, [cityFilter, serviceTypeFilter, vehicleTypeFilter, supplierFilter, showInactive])

  useEffect(() => {
    fetchRates()
    fetchSuppliers()  // NEW: fetch suppliers on mount
  }, [fetchRates, fetchSuppliers])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, cityFilter, serviceTypeFilter, vehicleTypeFilter, supplierFilter, showInactive, itemsPerPage])

  // Check if service type needs destination city
  const needsDestinationCity = (serviceType: string) => {
    const type = SERVICE_TYPES.find(t => t.value === serviceType)
    return type?.needsDestination || false
  }

  const generateServiceCode = (city: string, serviceType: string, vehicleType: string, destinationCity?: string) => {
    if (!city) return ''
    const cityCode = city.toUpperCase().replace(/\s+/g, '-')
    const typeCode = serviceType.toUpperCase().replace(/_/g, '-')
    const vehicleCode = vehicleType.toUpperCase()
    
    // For intercity, include destination
    if (needsDestinationCity(serviceType) && destinationCity) {
      const destCode = destinationCity.toUpperCase().replace(/\s+/g, '-')
      return `${cityCode}-TO-${destCode}-${vehicleCode}`
    }
    
    return `${cityCode}-${typeCode}-${vehicleCode}`
  }

  const handleVehicleTypeChange = (vehicleType: string) => {
    const vehicle = VEHICLE_TYPES.find(v => v.value === vehicleType)
    setFormData(prev => ({
      ...prev,
      vehicle_type: vehicleType,
      capacity_min: vehicle?.minPax || 1,
      capacity_max: vehicle?.maxPax || 2,
      service_code: generateServiceCode(prev.city, prev.service_type, vehicleType, prev.destination_city)
    }))
  }

  const handleCityChange = (city: string) => {
    setFormData(prev => ({
      ...prev,
      city,
      service_code: generateServiceCode(city, prev.service_type, prev.vehicle_type, prev.destination_city)
    }))
  }

  const handleDestinationCityChange = (destinationCity: string) => {
    setFormData(prev => ({
      ...prev,
      destination_city: destinationCity,
      service_code: generateServiceCode(prev.city, prev.service_type, prev.vehicle_type, destinationCity)
    }))
  }

  const handleServiceTypeChange = (serviceType: string) => {
    const needsDest = needsDestinationCity(serviceType)
    setFormData(prev => ({
      ...prev,
      service_type: serviceType,
      destination_city: needsDest ? prev.destination_city : '',
      service_code: generateServiceCode(prev.city, serviceType, prev.vehicle_type, needsDest ? prev.destination_city : '')
    }))
  }

  // NEW: Handle supplier selection - auto-fill supplier_name
  const handleSupplierChange = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId)
    setFormData(prev => ({
      ...prev,
      supplier_id: supplierId,
      supplier_name: supplier?.name || ''
    }))
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
      service_code: rate.service_code,
      service_type: rate.service_type,
      vehicle_type: rate.vehicle_type,
      capacity_min: rate.capacity_min,
      capacity_max: rate.capacity_max,
      city: rate.city,
      destination_city: rate.destination_city || '',
      base_rate_eur: rate.base_rate_eur,
      base_rate_non: rate.base_rate_non || rate.base_rate_non_eur || 0,
      season: rate.season || '',
      rate_valid_from: rate.rate_valid_from,
      rate_valid_to: rate.rate_valid_to,
      supplier_id: rate.supplier_id || '',  // NEW
      supplier_name: rate.supplier_name || rate.suppliers?.name || '',
      notes: rate.notes || '',
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

    if (!formData.base_rate_eur || formData.base_rate_eur <= 0) {
      setError('Please enter a valid EUR rate')
      setSaving(false)
      return
    }

    try {
      const url = editingRate 
        ? `/api/resources/transportation/${editingRate.id}`
        : '/api/resources/transportation'
      
      // NEW: Include supplier_id in submission, set to null if empty
      const submitData = {
        ...formData,
        supplier_id: formData.supplier_id || null
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
      `Are you sure you want to delete "${rate.service_code}"? This action cannot be undone.`
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
      service_code: rate.service_code + '-COPY',
      service_type: rate.service_type,
      vehicle_type: rate.vehicle_type,
      capacity_min: rate.capacity_min,
      capacity_max: rate.capacity_max,
      city: rate.city,
      destination_city: rate.destination_city || '',
      base_rate_eur: rate.base_rate_eur,
      base_rate_non: rate.base_rate_non || rate.base_rate_non_eur || 0,
      season: rate.season || '',
      rate_valid_from: rate.rate_valid_from,
      rate_valid_to: rate.rate_valid_to,
      supplier_id: rate.supplier_id || '',
      supplier_name: rate.supplier_name || rate.suppliers?.name || '',
      notes: rate.notes || '',
      is_active: rate.is_active
    })
    setIsModalOpen(true)
  }

  // Export filtered rates to CSV
  const handleExportCSV = () => {
    if (filteredRates.length === 0) {
      dialog.alert('No Data', 'No rates to export.', 'warning')
      return
    }

    const headers = [
      'service_code',
      'service_type',
      'vehicle_type',
      'capacity_min',
      'capacity_max',
      'city',
      'destination_city',
      'base_rate_eur',
      'base_rate_non',
      'season',
      'rate_valid_from',
      'rate_valid_to',
      'supplier_id',
      'supplier_name',
      'notes',
      'is_active'
    ]

    const csvRows = [
      headers.join(','),
      ...filteredRates.map(rate => {
        const values = [
          `"${rate.service_code || ''}"`,
          `"${rate.service_type || ''}"`,
          `"${rate.vehicle_type || ''}"`,
          rate.capacity_min || 1,
          rate.capacity_max || 2,
          `"${rate.city || ''}"`,
          `"${rate.destination_city || ''}"`,
          rate.base_rate_eur || 0,
          rate.base_rate_non || rate.base_rate_non_eur || 0,
          `"${rate.season || ''}"`,
          `"${rate.rate_valid_from || ''}"`,
          `"${rate.rate_valid_to || ''}"`,
          `"${rate.supplier_id || ''}"`,
          `"${rate.supplier_name || rate.suppliers?.name || ''}"`,
          `"${(rate.notes || '').replace(/"/g, '""')}"`,
          rate.is_active ? 'true' : 'false'
        ]
        return values.join(',')
      })
    ]

    const csvContent = csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `transportation-rates-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Import rates from CSV file
  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string
        const lines = text.split('\n').filter(line => line.trim())

        if (lines.length < 2) {
          await dialog.alert('Invalid File', 'CSV file must have a header row and at least one data row.', 'warning')
          return
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
        const requiredHeaders = ['service_code', 'service_type', 'vehicle_type', 'city', 'base_rate_eur']
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))

        if (missingHeaders.length > 0) {
          await dialog.alert('Missing Headers', `CSV is missing required headers: ${missingHeaders.join(', ')}`, 'warning')
          return
        }

        let successCount = 0
        let errorCount = 0

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].match(/("([^"]|"")*"|[^,]*)/g)?.map(v =>
            v.trim().replace(/^"|"$/g, '').replace(/""/g, '"')
          ) || []

          if (values.length < headers.length) continue

          const record: Record<string, string | number | boolean | null> = {}
          headers.forEach((header, index) => {
            record[header] = values[index] || ''
          })

          const rateData = {
            service_code: record.service_code as string,
            service_type: record.service_type as string,
            vehicle_type: record.vehicle_type as string,
            capacity_min: parseInt(record.capacity_min as string) || 1,
            capacity_max: parseInt(record.capacity_max as string) || 2,
            city: record.city as string,
            destination_city: record.destination_city as string || null,
            base_rate_eur: parseFloat(record.base_rate_eur as string) || 0,
            base_rate_non: parseFloat(record.base_rate_non as string) || 0,
            season: record.season as string || null,
            rate_valid_from: record.rate_valid_from as string || new Date().toISOString().split('T')[0],
            rate_valid_to: record.rate_valid_to as string || '2099-12-31',
            supplier_id: record.supplier_id as string || null,
            supplier_name: record.supplier_name as string || null,
            notes: record.notes as string || null,
            is_active: record.is_active === 'true' || record.is_active === '1'
          }

          try {
            const response = await fetch('/api/resources/transportation', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(rateData)
            })

            if (response.ok) {
              successCount++
            } else {
              errorCount++
            }
          } catch {
            errorCount++
          }
        }

        await dialog.alert(
          'Import Complete',
          `Successfully imported ${successCount} rates. ${errorCount > 0 ? `Failed: ${errorCount}` : ''}`,
          successCount > 0 ? 'success' : 'warning'
        )

        fetchRates()
      } catch (error) {
        console.error('Error importing CSV:', error)
        await dialog.alert('Import Error', 'Failed to parse CSV file. Please check the format.', 'warning')
      }
    }

    reader.readAsText(file)
    event.target.value = ''
  }

  // Filter rates
  const filteredRates = rates.filter(rate => {
    const matchesSearch = 
      rate.service_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.vehicle_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rate.destination_city && rate.destination_city.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (rate.supplier_name && rate.supplier_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (rate.suppliers?.name && rate.suppliers.name.toLowerCase().includes(searchTerm.toLowerCase()))  // NEW: search joined supplier
    return matchesSearch
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
  const uniqueVehicleTypes = [...new Set(rates.map(r => r.vehicle_type))].length
  const linkedToSuppliers = rates.filter(r => r.supplier_id).length  // NEW: stat

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
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-green-300 text-green-700 rounded-lg hover:bg-green-50 font-medium"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <label className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 font-medium cursor-pointer">
            <Upload className="w-4 h-4" />
            Import
            <input type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
          </label>
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#647C47] text-white text-sm rounded-md hover:bg-[#4f6238] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Rate
          </button>
        </div>
      </div>

      {/* Stats Cards - UPDATED: added linked suppliers stat */}
      <div className="grid grid-cols-6 gap-3">
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
        {/* NEW: Linked to Suppliers stat */}
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
            <span className="text-xs text-gray-500">Linked</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{linkedToSuppliers}</p>
        </div>
      </div>

      {/* Search and Filters - UPDATED: added supplier filter */}
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

        {/* NEW: Supplier filter dropdown */}
        <div className="relative">
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
          >
            <option value="">All Suppliers</option>
            {suppliers.map(supplier => (
              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
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

      {/* Table - UPDATED: added Supplier column */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Service Code</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Supplier</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Service Type</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Vehicle</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Capacity</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Route</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">{userCurrency} Rate</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Status</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedRates.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                  No transportation rates found
                </td>
              </tr>
            ) : (
              paginatedRates.map((rate) => {
                const isIntercity = needsDestinationCity(rate.service_type)
                const supplierName = rate.suppliers?.name || rate.supplier_name
                return (
                  <tr key={rate.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <span className="text-sm font-mono text-gray-900">{rate.service_code}</span>
                    </td>
                    {/* NEW: Supplier column */}
                    <td className="px-4 py-2">
                      {supplierName ? (
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-gray-400" />
                          <span className="text-sm text-gray-700">{supplierName}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-sm text-gray-600">
                        {SERVICE_TYPES.find(t => t.value === rate.service_type)?.label || rate.service_type}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-sm font-medium text-gray-900">{rate.vehicle_type}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-sm text-gray-600">{rate.capacity_min || 1}-{rate.capacity_max} pax</span>
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
                    <td className="px-4 py-2 text-right">
                      <span className="text-sm font-medium text-gray-900">{symbol}{convert(Number(rate.base_rate_eur)).toFixed(2)}</span>
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

      {/* Add/Edit Modal - UPDATED: added supplier dropdown */}
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

              {/* NEW: Supplier Selection - at the top for prominence */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-cyan-600" />
                  Transport Company (Supplier)
                </h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">
                    Link to Supplier
                  </label>
                  <select
                    value={formData.supplier_id}
                    onChange={(e) => handleSupplierChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                  >
                    <option value="">Select supplier (optional)</option>
                    {suppliers.map(supplier => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}{supplier.city ? ` (${supplier.city})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    Link this rate to a transport company for better tracking. 
                    <a href="/suppliers?type=transport_company" className="text-[#647C47] hover:underline ml-1">
                      Manage suppliers →
                    </a>
                  </p>
                </div>

                {/* Show selected supplier info */}
                {formData.supplier_id && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-cyan-50 border border-cyan-100 rounded-md">
                    <Building2 className="h-4 w-4 text-cyan-600" />
                    <span className="text-sm text-cyan-800">
                      Linked to: <strong>{formData.supplier_name}</strong>
                    </span>
                  </div>
                )}
              </div>

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

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Vehicle Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.vehicle_type}
                      onChange={(e) => handleVehicleTypeChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    >
                      {VEHICLE_TYPES.map(type => (
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
                      Service Code
                    </label>
                    <input
                      type="text"
                      value={formData.service_code}
                      onChange={(e) => setFormData(prev => ({ ...prev, service_code: e.target.value }))}
                      placeholder="Auto-generated"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-gray-50 font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1.5">
                        Min Pax
                      </label>
                      <input
                        type="number"
                        value={formData.capacity_min}
                        onChange={(e) => setFormData(prev => ({ ...prev, capacity_min: parseInt(e.target.value) || 1 }))}
                        min="1"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1.5">
                        Max Pax
                      </label>
                      <input
                        type="number"
                        value={formData.capacity_max}
                        onChange={(e) => setFormData(prev => ({ ...prev, capacity_max: parseInt(e.target.value) || 2 }))}
                        min="1"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="text-sm font-medium text-gray-700">Pricing</h3>
                  <span className="text-xs text-gray-400">Enter rates in EUR (base currency)</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      EU Passport Rate <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">€</span>
                      <input
                        type="number"
                        value={formData.base_rate_eur}
                        onChange={(e) => setFormData(prev => ({ ...prev, base_rate_eur: parseFloat(e.target.value) || 0 }))}
                        step="0.01"
                        min="0"
                        required
                        className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Non-EU Passport Rate
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">€</span>
                      <input
                        type="number"
                        value={formData.base_rate_non}
                        onChange={(e) => setFormData(prev => ({ ...prev, base_rate_non: parseFloat(e.target.value) || 0 }))}
                        step="0.01"
                        min="0"
                        className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Validity */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2">Validity Period</h3>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Season
                    </label>
                    <select
                      value={formData.season}
                      onChange={(e) => setFormData(prev => ({ ...prev, season: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    >
                      <option value="">All Year</option>
                      <option value="high_season">High Season</option>
                      <option value="low_season">Low Season</option>
                      <option value="peak">Peak</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Valid From
                    </label>
                    <input
                      type="date"
                      value={formData.rate_valid_from}
                      onChange={(e) => setFormData(prev => ({ ...prev, rate_valid_from: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Valid To
                    </label>
                    <input
                      type="date"
                      value={formData.rate_valid_to}
                      onChange={(e) => setFormData(prev => ({ ...prev, rate_valid_to: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    />
                  </div>
                </div>
              </div>

              {/* Additional Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2">Additional Information</h3>
                
                {/* Legacy supplier name field - hidden if supplier_id is set */}
                {!formData.supplier_id && (
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Supplier Name (Legacy)
                    </label>
                    <input
                      type="text"
                      value={formData.supplier_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, supplier_name: e.target.value }))}
                      placeholder="e.g., Cairo Cars Co. (prefer using dropdown above)"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      For backwards compatibility. Prefer using the supplier dropdown above.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">
                    Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    placeholder="Any additional notes..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] resize-none"
                  />
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