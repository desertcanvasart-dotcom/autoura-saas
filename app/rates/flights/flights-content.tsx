'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  Plane,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Building2,
  Clock,
  Luggage,
  ArrowRight,
  Copy,
  Download,
  Upload
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { EGYPT_CITIES } from '@/lib/constants/egypt-cities'
import { useCurrency } from '@/hooks/useCurrency'

interface FlightRate {
  id: string
  service_code: string
  route_from: string
  route_to: string
  airline: string
  flight_number: string | null
  flight_type: 'domestic' | 'international'
  cabin_class: 'economy' | 'business' | 'first'
  base_rate_eur: number
  base_rate_non_eur: number
  baggage_kg: number | null
  departure_time: string | null
  arrival_time: string | null
  duration_minutes: number | null
  frequency: string | null
  season: string | null
  rate_valid_from: string
  rate_valid_to: string
  supplier_id: string | null
  supplier_name: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  supplier?: { id: string; name: string; city?: string } | null
}

interface Supplier {
  id: string
  name: string
  type: string
  city?: string
  status?: string
}

interface FormData {
  service_code: string
  route_from: string
  route_to: string
  airline: string
  flight_number: string
  flight_type: 'domestic' | 'international'
  cabin_class: 'economy' | 'business' | 'first'
  base_rate_eur: number
  base_rate_non_eur: number
  baggage_kg: number
  departure_time: string
  arrival_time: string
  duration_minutes: number
  frequency: string
  season: string
  rate_valid_from: string
  rate_valid_to: string
  supplier_id: string
  supplier_name: string
  notes: string
  is_active: boolean
}

const initialFormData: FormData = {
  service_code: '',
  route_from: 'Cairo',
  route_to: 'Aswan',
  airline: 'EgyptAir',
  flight_number: '',
  flight_type: 'domestic',
  cabin_class: 'economy',
  base_rate_eur: 0,
  base_rate_non_eur: 0,
  baggage_kg: 23,
  departure_time: '',
  arrival_time: '',
  duration_minutes: 0,
  frequency: 'daily',
  season: '',
  rate_valid_from: new Date().toISOString().split('T')[0],
  rate_valid_to: '2099-12-31',
  supplier_id: '',
  supplier_name: '',
  notes: '',
  is_active: true
}

// Common airlines in Egypt
const AIRLINES = [
  { code: 'MS', name: 'EgyptAir' },
  { code: 'NP', name: 'Nile Air' },
  { code: 'SM', name: 'Air Cairo' },
  { code: 'FZ', name: 'FlyDubai' },
  { code: 'EK', name: 'Emirates' },
  { code: 'QR', name: 'Qatar Airways' },
  { code: 'TK', name: 'Turkish Airlines' },
  { code: 'LH', name: 'Lufthansa' },
  { code: 'BA', name: 'British Airways' },
  { code: 'AF', name: 'Air France' },
  { code: 'KL', name: 'KLM' },
  { code: 'EY', name: 'Etihad' },
  { code: 'SV', name: 'Saudia' },
  { code: 'RJ', name: 'Royal Jordanian' },
  { code: 'ME', name: 'Middle East Airlines' },
  { code: 'G9', name: 'Air Arabia' },
  { code: 'Other', name: 'Other' }
]

const FLIGHT_TYPES = [
  { value: 'domestic', label: 'Domestic' },
  { value: 'international', label: 'International' }
]

const CABIN_CLASSES = [
  { value: 'economy', label: 'Economy' },
  { value: 'business', label: 'Business' },
  { value: 'first', label: 'First Class' }
]

const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays Only' },
  { value: 'weekends', label: 'Weekends Only' },
  { value: 'mon_wed_fri', label: 'Mon/Wed/Fri' },
  { value: 'tue_thu_sat', label: 'Tue/Thu/Sat' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'charter', label: 'Charter/On Demand' }
]

// Popular flight routes in Egypt
const POPULAR_ROUTES = [
  { from: 'Cairo', to: 'Aswan' },
  { from: 'Cairo', to: 'Luxor' },
  { from: 'Cairo', to: 'Hurghada' },
  { from: 'Cairo', to: 'Sharm El Sheikh' },
  { from: 'Cairo', to: 'Abu Simbel' },
  { from: 'Cairo', to: 'Alexandria' },
  { from: 'Luxor', to: 'Cairo' },
  { from: 'Aswan', to: 'Cairo' },
  { from: 'Aswan', to: 'Abu Simbel' },
  { from: 'Hurghada', to: 'Cairo' },
  { from: 'Sharm El Sheikh', to: 'Cairo' }
]

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

export default function FlightsContent() {
  const dialog = useConfirmDialog()
  const { convert, symbol, userCurrency, loading: currencyLoading } = useCurrency()

  const [rates, setRates] = useState<FlightRate[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [routeFromFilter, setRouteFromFilter] = useState('')
  const [routeToFilter, setRouteToFilter] = useState('')
  const [airlineFilter, setAirlineFilter] = useState('')
  const [flightTypeFilter, setFlightTypeFilter] = useState('')
  const [cabinClassFilter, setCabinClassFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRate, setEditingRate] = useState<FlightRate | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  // Fetch suppliers for dropdown
  const fetchSuppliers = useCallback(async () => {
    try {
      const response = await fetch('/api/suppliers?status=active')
      if (response.ok) {
        const result = await response.json()
        // Filter to airline-related suppliers
        const airlineSuppliers = (result.data || []).filter((s: Supplier) => 
          ['airline', 'transport_company', 'travel_agent'].includes(s.type)
        )
        setSuppliers(airlineSuppliers)
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error)
    }
  }, [])

  const fetchRates = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (routeFromFilter) params.append('route_from', routeFromFilter)
      if (routeToFilter) params.append('route_to', routeToFilter)
      if (airlineFilter) params.append('airline', airlineFilter)
      if (flightTypeFilter) params.append('flight_type', flightTypeFilter)
      if (cabinClassFilter) params.append('cabin_class', cabinClassFilter)
      if (supplierFilter) params.append('supplier_id', supplierFilter)
      if (!showInactive) params.append('active_only', 'true')
      
      const response = await fetch(`/api/rates/flights?${params}`)
      if (response.ok) {
        const result = await response.json()
        setRates(result.data || [])
      }
    } catch (error) {
      console.error('Error fetching flight rates:', error)
    } finally {
      setLoading(false)
    }
  }, [routeFromFilter, routeToFilter, airlineFilter, flightTypeFilter, cabinClassFilter, supplierFilter, showInactive])

  useEffect(() => {
    fetchRates()
    fetchSuppliers()
  }, [fetchRates, fetchSuppliers])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, routeFromFilter, routeToFilter, airlineFilter, flightTypeFilter, cabinClassFilter, supplierFilter, showInactive, itemsPerPage])

  const generateServiceCode = (from: string, to: string, airline: string, cabinClass: string) => {
    if (!from || !to) return ''
    const fromCode = from.substring(0, 3).toUpperCase()
    const toCode = to.substring(0, 3).toUpperCase()
    const airlineCode = AIRLINES.find(a => a.name === airline)?.code || airline.substring(0, 2).toUpperCase()
    const classCode = cabinClass.charAt(0).toUpperCase()
    return `FLT-${airlineCode}-${fromCode}-${toCode}-${classCode}`
  }

  const handleRouteChange = (field: 'route_from' | 'route_to', value: string) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value }
      updated.service_code = generateServiceCode(
        field === 'route_from' ? value : prev.route_from,
        field === 'route_to' ? value : prev.route_to,
        prev.airline,
        prev.cabin_class
      )
      // Auto-detect flight type
      const domesticCities = ['Cairo', 'Luxor', 'Aswan', 'Hurghada', 'Sharm El Sheikh', 'Alexandria', 'Abu Simbel', 'Marsa Alam']
      const fromDomestic = domesticCities.includes(field === 'route_from' ? value : prev.route_from)
      const toDomestic = domesticCities.includes(field === 'route_to' ? value : prev.route_to)
      updated.flight_type = (fromDomestic && toDomestic) ? 'domestic' : 'international'
      return updated
    })
  }

  const handleAirlineChange = (airline: string) => {
    setFormData(prev => ({
      ...prev,
      airline,
      service_code: generateServiceCode(prev.route_from, prev.route_to, airline, prev.cabin_class)
    }))
  }

  const handleCabinClassChange = (cabinClass: 'economy' | 'business' | 'first') => {
    setFormData(prev => ({
      ...prev,
      cabin_class: cabinClass,
      service_code: generateServiceCode(prev.route_from, prev.route_to, prev.airline, cabinClass)
    }))
  }

  const handleSupplierChange = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId)
    setFormData(prev => ({
      ...prev,
      supplier_id: supplierId,
      supplier_name: supplier?.name || ''
    }))
  }

  const applyPopularRoute = (from: string, to: string) => {
    setFormData(prev => ({
      ...prev,
      route_from: from,
      route_to: to,
      service_code: generateServiceCode(from, to, prev.airline, prev.cabin_class),
      flight_type: 'domestic'
    }))
  }

  const openAddModal = () => {
    setEditingRate(null)
    setFormData(initialFormData)
    setError(null)
    setIsModalOpen(true)
  }

  const openEditModal = (rate: FlightRate) => {
    setEditingRate(rate)
    setError(null)
    setFormData({
      service_code: rate.service_code,
      route_from: rate.route_from,
      route_to: rate.route_to,
      airline: rate.airline,
      flight_number: rate.flight_number || '',
      flight_type: rate.flight_type,
      cabin_class: rate.cabin_class,
      base_rate_eur: rate.base_rate_eur,
      base_rate_non_eur: rate.base_rate_non_eur || 0,
      baggage_kg: rate.baggage_kg || 23,
      departure_time: rate.departure_time || '',
      arrival_time: rate.arrival_time || '',
      duration_minutes: rate.duration_minutes || 0,
      frequency: rate.frequency || 'daily',
      season: rate.season || '',
      rate_valid_from: rate.rate_valid_from,
      rate_valid_to: rate.rate_valid_to,
      supplier_id: rate.supplier_id || '',
      supplier_name: rate.supplier_name || rate.supplier?.name || '',
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
    if (!formData.route_from) {
      setError('Please select a departure city')
      setSaving(false)
      return
    }

    if (!formData.route_to) {
      setError('Please select an arrival city')
      setSaving(false)
      return
    }

    if (formData.route_from === formData.route_to) {
      setError('Departure and arrival cities must be different')
      setSaving(false)
      return
    }

    if (!formData.airline) {
      setError('Please select an airline')
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
        ? `/api/rates/flights/${editingRate.id}`
        : '/api/rates/flights'
      
      const submitData = {
        ...formData,
        supplier_id: formData.supplier_id || null,
        flight_number: formData.flight_number || null,
        departure_time: formData.departure_time || null,
        arrival_time: formData.arrival_time || null,
        duration_minutes: formData.duration_minutes || null,
        baggage_kg: formData.baggage_kg || null,
        season: formData.season || null,
        notes: formData.notes || null
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
        setError(result.error || 'Failed to save flight rate')
      }
    } catch (error) {
      console.error('Error saving flight rate:', error)
      setError('Failed to save flight rate. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (rate: FlightRate) => {
    const confirmed = await dialog.confirmDelete('Flight Rate',
      `Are you sure you want to delete "${rate.service_code}"? This action cannot be undone.`
    )

    if (!confirmed) return

    try {
      const response = await fetch(`/api/rates/flights/${rate.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        fetchRates()
        await dialog.alert('Deleted', 'Flight rate has been deleted.', 'success')
      } else {
        await dialog.alert('Error', 'Failed to delete flight rate. Please try again.', 'warning')
      }
    } catch (error) {
      console.error('Error deleting flight rate:', error)
      await dialog.alert('Error', 'Failed to delete flight rate. Please try again.', 'warning')
    }
  }

  const handleClone = (rate: FlightRate) => {
    setEditingRate(null)
    setError(null)
    setFormData({
      service_code: '', // Clear code for new entry
      route_from: rate.route_from,
      route_to: rate.route_to,
      airline: rate.airline,
      flight_number: '', // Clear flight number for new entry
      flight_type: rate.flight_type,
      cabin_class: rate.cabin_class,
      base_rate_eur: rate.base_rate_eur,
      base_rate_non_eur: rate.base_rate_non_eur || 0,
      baggage_kg: rate.baggage_kg || 23,
      departure_time: rate.departure_time || '',
      arrival_time: rate.arrival_time || '',
      duration_minutes: rate.duration_minutes || 0,
      frequency: rate.frequency || 'daily',
      season: rate.season || '',
      rate_valid_from: rate.rate_valid_from,
      rate_valid_to: rate.rate_valid_to,
      supplier_id: rate.supplier_id || '',
      supplier_name: rate.supplier_name || rate.supplier?.name || '',
      notes: rate.notes || '',
      is_active: rate.is_active
    })
    setIsModalOpen(true)
  }

  const handleExportCSV = () => {
    if (filteredRates.length === 0) {
      dialog.alert('No Data', 'No flight rates to export.', 'warning')
      return
    }

    const headers = [
      'service_code',
      'route_from',
      'route_to',
      'airline',
      'flight_number',
      'flight_type',
      'cabin_class',
      'base_rate_eur',
      'base_rate_non_eur',
      'baggage_kg',
      'departure_time',
      'arrival_time',
      'duration_minutes',
      'frequency',
      'season',
      'rate_valid_from',
      'rate_valid_to',
      'supplier_name',
      'notes',
      'is_active'
    ]

    const csvRows = [headers.join(',')]

    filteredRates.forEach(rate => {
      const row = [
        `"${rate.service_code || ''}"`,
        `"${rate.route_from || ''}"`,
        `"${rate.route_to || ''}"`,
        `"${rate.airline || ''}"`,
        `"${rate.flight_number || ''}"`,
        `"${rate.flight_type || ''}"`,
        `"${rate.cabin_class || ''}"`,
        rate.base_rate_eur || 0,
        rate.base_rate_non_eur || 0,
        rate.baggage_kg || '',
        `"${rate.departure_time || ''}"`,
        `"${rate.arrival_time || ''}"`,
        rate.duration_minutes || '',
        `"${rate.frequency || ''}"`,
        `"${rate.season || ''}"`,
        `"${rate.rate_valid_from || ''}"`,
        `"${rate.rate_valid_to || ''}"`,
        `"${rate.supplier_name || rate.supplier?.name || ''}"`,
        `"${(rate.notes || '').replace(/"/g, '""')}"`,
        rate.is_active ? 'true' : 'false'
      ]
      csvRows.push(row.join(','))
    })

    const csvContent = csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `flight-rates-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string
        const lines = text.split('\n').filter(line => line.trim())

        if (lines.length < 2) {
          await dialog.alert('Error', 'CSV file is empty or has no data rows.', 'warning')
          return
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
        const records: Partial<FormData>[] = []

        for (let i = 1; i < lines.length; i++) {
          const values: string[] = []
          let current = ''
          let inQuotes = false

          for (const char of lines[i]) {
            if (char === '"') {
              inQuotes = !inQuotes
            } else if (char === ',' && !inQuotes) {
              values.push(current.trim())
              current = ''
            } else {
              current += char
            }
          }
          values.push(current.trim())

          const record: Record<string, string | number | boolean> = {}
          headers.forEach((header, idx) => {
            let value = values[idx] || ''
            value = value.replace(/^"|"$/g, '').replace(/""/g, '"')
            record[header] = value
          })

          records.push({
            service_code: String(record.service_code || ''),
            route_from: String(record.route_from || ''),
            route_to: String(record.route_to || ''),
            airline: String(record.airline || 'EgyptAir'),
            flight_number: String(record.flight_number || ''),
            flight_type: (record.flight_type === 'international' ? 'international' : 'domestic') as 'domestic' | 'international',
            cabin_class: (['economy', 'business', 'first'].includes(String(record.cabin_class)) ? record.cabin_class : 'economy') as 'economy' | 'business' | 'first',
            base_rate_eur: parseFloat(String(record.base_rate_eur)) || 0,
            base_rate_non_eur: parseFloat(String(record.base_rate_non_eur)) || 0,
            baggage_kg: parseInt(String(record.baggage_kg)) || 23,
            departure_time: String(record.departure_time || ''),
            arrival_time: String(record.arrival_time || ''),
            duration_minutes: parseInt(String(record.duration_minutes)) || 0,
            frequency: String(record.frequency || 'daily'),
            season: String(record.season || ''),
            rate_valid_from: String(record.rate_valid_from || new Date().toISOString().split('T')[0]),
            rate_valid_to: String(record.rate_valid_to || '2099-12-31'),
            supplier_name: String(record.supplier_name || ''),
            notes: String(record.notes || ''),
            is_active: record.is_active === 'true' || record.is_active === '1' || record.is_active === true
          })
        }

        let successCount = 0
        let errorCount = 0

        for (const record of records) {
          try {
            const response = await fetch('/api/rates/flights', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...record,
                supplier_id: null,
                flight_number: record.flight_number || null,
                departure_time: record.departure_time || null,
                arrival_time: record.arrival_time || null,
                duration_minutes: record.duration_minutes || null,
                baggage_kg: record.baggage_kg || null,
                season: record.season || null,
                notes: record.notes || null
              })
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

        fetchRates()
        await dialog.alert(
          'Import Complete',
          `Successfully imported ${successCount} flight rates.${errorCount > 0 ? ` ${errorCount} records failed.` : ''}`,
          successCount > 0 ? 'success' : 'warning'
        )
      } catch (err) {
        console.error('Error parsing CSV:', err)
        await dialog.alert('Error', 'Failed to parse CSV file. Please check the format.', 'warning')
      }
    }

    reader.readAsText(file)
    event.target.value = ''
  }

  // Filter rates
  const filteredRates = rates.filter(rate => {
    const search = searchTerm.toLowerCase()
    const matchesSearch =
      (rate.service_code || '').toLowerCase().includes(search) ||
      (rate.route_from || '').toLowerCase().includes(search) ||
      (rate.route_to || '').toLowerCase().includes(search) ||
      (rate.airline || '').toLowerCase().includes(search) ||
      (rate.flight_number || '').toLowerCase().includes(search) ||
      (rate.supplier_name || '').toLowerCase().includes(search)
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

  // Stats
  const totalRates = rates.length
  const activeRates = rates.filter(r => r.is_active).length
  const domesticRoutes = rates.filter(r => r.flight_type === 'domestic').length
  const internationalRoutes = rates.filter(r => r.flight_type === 'international').length
  const uniqueAirlines = [...new Set(rates.map(r => r.airline))].length
  const linkedToSuppliers = rates.filter(r => r.supplier_id).length

  // Format time for display
  const formatTime = (time: string | null) => {
    if (!time) return '—'
    return time.substring(0, 5)
  }

  // Format duration
  const formatDuration = (minutes: number | null) => {
    if (!minutes) return '—'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

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
          <Plane className="h-5 w-5 text-sky-600" />
          <h1 className="text-lg font-semibold text-gray-900">Flight Rates</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-md hover:bg-gray-50 transition-colors"
            title="Export to CSV"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <label className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-md hover:bg-gray-50 transition-colors cursor-pointer">
            <Upload className="h-4 w-4" />
            Import
            <input
              type="file"
              accept=".csv"
              onChange={handleImportCSV}
              className="hidden"
            />
          </label>
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#647C47] text-white text-sm rounded-md hover:bg-[#4f6238] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Flight Rate
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-6 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-sky-500"></div>
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
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-xs text-gray-500">Domestic</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{domesticRoutes}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-500"></div>
            <span className="text-xs text-gray-500">International</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{internationalRoutes}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
            <span className="text-xs text-gray-500">Airlines</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{uniqueAirlines}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
            <span className="text-xs text-gray-500">Linked</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{linkedToSuppliers}</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search flights..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
          />
        </div>

        <div className="relative">
          <select
            value={routeFromFilter}
            onChange={(e) => setRouteFromFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
          >
            <option value="">From Any</option>
            {EGYPT_CITIES.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={routeToFilter}
            onChange={(e) => setRouteToFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
          >
            <option value="">To Any</option>
            {EGYPT_CITIES.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={airlineFilter}
            onChange={(e) => setAirlineFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
          >
            <option value="">All Airlines</option>
            {AIRLINES.map(airline => (
              <option key={airline.code} value={airline.name}>{airline.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={flightTypeFilter}
            onChange={(e) => setFlightTypeFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
          >
            <option value="">All Types</option>
            {FLIGHT_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={cabinClassFilter}
            onChange={(e) => setCabinClassFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
          >
            <option value="">All Classes</option>
            {CABIN_CLASSES.map(cls => (
              <option key={cls.value} value={cls.value}>{cls.label}</option>
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

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Route</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Airline</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Flight</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Class</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Schedule</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">{userCurrency} Rate</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Type</th>
              <th className="text-center text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Status</th>
              <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedRates.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                  No flight rates found
                </td>
              </tr>
            ) : (
              paginatedRates.map((rate) => (
                <tr key={rate.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="font-medium text-gray-900">{rate.route_from}</span>
                      <ArrowRight className="h-3 w-3 text-gray-400" />
                      <span className="font-medium text-gray-900">{rate.route_to}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-sm text-gray-700">{rate.airline}</span>
                  </td>
                  <td className="px-4 py-2">
                    {rate.flight_number ? (
                      <span className="text-sm font-mono text-gray-600">{rate.flight_number}</span>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      rate.cabin_class === 'first' 
                        ? 'bg-amber-100 text-amber-800' 
                        : rate.cabin_class === 'business'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {rate.cabin_class.charAt(0).toUpperCase() + rate.cabin_class.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {rate.departure_time && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime(rate.departure_time)}
                        </span>
                      )}
                      {rate.duration_minutes && (
                        <span className="text-gray-400">({formatDuration(rate.duration_minutes)})</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="text-sm font-medium text-gray-900">{symbol}{convert(Number(rate.base_rate_eur)).toFixed(2)}</span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      rate.flight_type === 'domestic' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {rate.flight_type === 'domestic' ? 'DOM' : 'INT'}
                    </span>
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
                        onClick={() => openEditModal(rate)}
                        className="p-1 text-gray-400 hover:text-[#647C47] transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleClone(rate)}
                        className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                        title="Clone"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(rate)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
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
                onClick={() => goToPage(1)}
                disabled={currentPage === 1}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                title="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                title="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

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
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                title="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => goToPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                title="Last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingRate ? 'Edit Flight Rate' : 'Add Flight Rate'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              {/* Popular Routes Quick Select */}
              {!editingRate && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-600">Quick Select Popular Route</label>
                  <div className="flex flex-wrap gap-2">
                    {POPULAR_ROUTES.slice(0, 6).map((route, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => applyPopularRoute(route.from, route.to)}
                        className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                          formData.route_from === route.from && formData.route_to === route.to
                            ? 'bg-sky-100 border-sky-300 text-sky-700'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {route.from} → {route.to}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Supplier Selection */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-cyan-600" />
                  Airline / Supplier
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Airline <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.airline}
                      onChange={(e) => handleAirlineChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    >
                      {AIRLINES.map(airline => (
                        <option key={airline.code} value={airline.name}>{airline.name}</option>
                      ))}
                    </select>
                  </div>

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
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Route */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2 flex items-center gap-2">
                  <Plane className="h-4 w-4 text-sky-600" />
                  Route Information
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      From <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.route_from}
                      onChange={(e) => handleRouteChange('route_from', e.target.value)}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    >
                      <option value="">Select departure city</option>
                      {EGYPT_CITIES.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      To <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.route_to}
                      onChange={(e) => handleRouteChange('route_to', e.target.value)}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    >
                      <option value="">Select arrival city</option>
                      {EGYPT_CITIES.filter(c => c !== formData.route_from).map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {formData.route_from && formData.route_to && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-sky-50 border border-sky-100 rounded-md">
                    <Plane className="h-4 w-4 text-sky-600" />
                    <span className="text-sm text-sky-700">
                      Route: <strong>{formData.route_from}</strong> → <strong>{formData.route_to}</strong>
                    </span>
                    <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${
                      formData.flight_type === 'domestic' 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      {formData.flight_type === 'domestic' ? 'Domestic' : 'International'}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Flight Number
                    </label>
                    <input
                      type="text"
                      value={formData.flight_number}
                      onChange={(e) => setFormData(prev => ({ ...prev, flight_number: e.target.value.toUpperCase() }))}
                      placeholder="e.g., MS091"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Cabin Class <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.cabin_class}
                      onChange={(e) => handleCabinClassChange(e.target.value as 'economy' | 'business' | 'first')}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    >
                      {CABIN_CLASSES.map(cls => (
                        <option key={cls.value} value={cls.value}>{cls.label}</option>
                      ))}
                    </select>
                  </div>

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
                </div>
              </div>

              {/* Schedule */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-orange-600" />
                  Schedule
                </h3>
                
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Departure Time
                    </label>
                    <input
                      type="time"
                      value={formData.departure_time}
                      onChange={(e) => setFormData(prev => ({ ...prev, departure_time: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Arrival Time
                    </label>
                    <input
                      type="time"
                      value={formData.arrival_time}
                      onChange={(e) => setFormData(prev => ({ ...prev, arrival_time: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Duration (min)
                    </label>
                    <input
                      type="number"
                      value={formData.duration_minutes || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) || 0 }))}
                      placeholder="e.g., 80"
                      min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Frequency
                    </label>
                    <select
                      value={formData.frequency}
                      onChange={(e) => setFormData(prev => ({ ...prev, frequency: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    >
                      {FREQUENCIES.map(freq => (
                        <option key={freq.value} value={freq.value}>{freq.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2">Pricing</h3>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Base Rate (EUR) <span className="text-red-500">*</span>
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
                      Alt Rate (USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        value={formData.base_rate_non_eur}
                        onChange={(e) => setFormData(prev => ({ ...prev, base_rate_non_eur: parseFloat(e.target.value) || 0 }))}
                        step="0.01"
                        min="0"
                        className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5 flex items-center gap-1">
                      <Luggage className="h-3.5 w-3.5" />
                      Baggage (kg)
                    </label>
                    <input
                      type="number"
                      value={formData.baggage_kg}
                      onChange={(e) => setFormData(prev => ({ ...prev, baggage_kg: parseInt(e.target.value) || 0 }))}
                      min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    />
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
                
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">
                    Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    placeholder="Any additional notes about this flight rate..."
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