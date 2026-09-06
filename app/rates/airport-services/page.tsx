'use client'
// @bulk-import
import BulkRateImportExport from '@/app/components/BulkRateImportExport'
import { useSubmitGuard } from '@/app/hooks/useSubmitGuard'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plane, Plus, Edit, Trash2, X, Check, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Copy } from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { VocabSelect, useVocabulary } from '@/components/vocabulary'
import { useCurrency } from '@/hooks/useCurrency'
import RateCurrencyField, { rateCurrencyPatch } from '@/app/components/RateCurrencyField'
import { useRateCurrency, useRateRowFormat } from '@/hooks/useRateCurrencySymbol'
import { averageRateInOneCurrency } from '@/lib/currency-totals'

// ============================================
// CONSTANTS
// ============================================

const AIRPORTS = [
  { code: 'CAI', name: 'Cairo International' },
  { code: 'LXR', name: 'Luxor International' },
  { code: 'ASW', name: 'Aswan International' },
  { code: 'HRG', name: 'Hurghada International' },
  { code: 'SSH', name: 'Sharm El-Sheikh' }
]
const DIRECTIONS = ['arrival', 'departure', 'both']
const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

// ============================================
// INTERFACES
// ============================================

interface AirportStaffRate {
  // The currency this row's amounts are in; blank means the tenant's.
  rate_currency?: string | null
  id: string
  service_code: string
  airport_code: string
  service_type: string
  direction: 'arrival' | 'departure' | 'both'
  rate_eur: number
  description: string | null
  notes: string | null
  is_active: boolean
  /** The outside company this service is bought from (migration 339); null = in-house. */
  supplier_id?: string | null
  supplier_name?: string | null
}

interface Toast { 
  id: string
  type: 'success' | 'error'
  message: string 
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getAirportName(code: string): string {
  return AIRPORTS.find(a => a.code === code)?.name || code
}

function formatDirection(direction: string): string {
  return direction.charAt(0).toUpperCase() + direction.slice(1)
}

// ============================================
// PAGINATION COMPONENT
// ============================================

function Pagination({
  currentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange
}: {
  currentPage: number
  totalPages: number
  totalItems: number
  startIndex: number
  endIndex: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  onItemsPerPageChange: (items: number) => void
}) {
  const goToPage = (page: number) => {
    onPageChange(Math.max(1, Math.min(page, totalPages)))
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Show</span>
          <select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            className="px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-600 bg-white"
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
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => goToPage(currentPage - 1)}
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
                    ? 'bg-sky-600 text-white'
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
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => goToPage(totalPages)}
          disabled={currentPage === totalPages}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function AirportServicesPage() {
  const dialog = useConfirmDialog()
  const { loading: currencyLoading } = useCurrency()
  
  const { fmtRate, fmtAverage } = useRateRowFormat()
  const [rates, setRates] = useState<AirportStaffRate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedAirport, setSelectedAirport] = useState('all')
  const [selectedService, setSelectedService] = useState('all')
  // The agency's words for the service levels (Settings → Your vocabulary).
  const { labelFor: formatServiceType } = useVocabulary('airport_service_type')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingRate, setEditingRate] = useState<AirportStaffRate | null>(null)
  // Which currency this rate's amounts are entered in ('' = EUR default)
  const [rateCurrency, setRateCurrency] = useState('')
  // Labels must name the currency the amounts are actually in (C3.4b).
  const { symbol: rateSymbol } = useRateCurrency(rateCurrency)
  const [toasts, setToasts] = useState<Toast[]>([])

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  const [formData, setFormData] = useState({
    service_code: '',
    airport_code: 'CAI',
    service_type: 'meet_greet',
    direction: 'arrival' as 'arrival' | 'departure' | 'both',
    rate_eur: 0,
    description: '',
    notes: '',
    is_active: true,
    supplier_id: '',
    supplier_name: ''
  })

  const showToast = (type: 'success' | 'error', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  // The outside companies this service can be bought from: every supplier whose
  // type behaves as ground handler (an agency's own "Airport assistant" or
  // "Hotel assistant" type, Settings → Your vocabulary).
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; city?: string | null }[]>([])
  useEffect(() => {
    fetch('/api/suppliers?type=ground_handler&status=active')
      .then(r => r.json())
      .then(j => setSuppliers(Array.isArray(j?.data) ? j.data : []))
      .catch(() => setSuppliers([]))
  }, [])
  const handleSupplierChange = (supplierId: string) => {
    const s = suppliers.find(x => x.id === supplierId)
    setFormData(prev => ({ ...prev, supplier_id: supplierId, supplier_name: s?.name || '' }))
  }

  const fetchRates = async () => {
    try {
      const response = await fetch('/api/rates/airport-services')
      const data = await response.json()
      if (data.success) setRates(data.data)
    } catch (error) {
      showToast('error', 'Failed to load airport service rates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRates() }, [])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedAirport, selectedService, showInactive, itemsPerPage])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  const handleCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.checked }))
  }

  const generateCode = () => {
    const svc = formData.service_type.replace('_', '').toUpperCase().substring(0, 6)
    return `AIR-${formData.airport_code}-${svc}-${formData.direction.substring(0, 3).toUpperCase()}`
  }

  const handleAddNew = () => {
    setRateCurrency('')
    setEditingRate(null)
    setFormData({
      service_code: '',
      airport_code: 'CAI',
      service_type: 'meet_greet',
      direction: 'arrival',
      rate_eur: 0,
      description: '',
      notes: '',
      is_active: true,
      supplier_id: '',
      supplier_name: ''
    })
    setShowModal(true)
  }

  const handleEdit = (rate: AirportStaffRate) => {
    setRateCurrency((rate as { rate_currency?: string | null }).rate_currency || '')
    setEditingRate(rate)
    setFormData({
      service_code: rate.service_code,
      airport_code: rate.airport_code,
      service_type: rate.service_type,
      direction: rate.direction,
      rate_eur: rate.rate_eur,
      description: rate.description || '',
      notes: rate.notes || '',
      is_active: rate.is_active,
      supplier_id: rate.supplier_id || '',
      supplier_name: rate.supplier_name || ''
    })
    setShowModal(true)
  }

  const { submitting, guard } = useSubmitGuard()
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    guard(async () => {  const submitData = { ...formData, service_code: formData.service_code || generateCode(), ...rateCurrencyPatch(rateCurrency, (editingRate as { rate_currency?: string | null } | null)?.rate_currency) }

      try {
        const url = editingRate ? `/api/rates/airport-services/${editingRate.id}` : '/api/rates/airport-services'
        const response = await fetch(url, {
          method: editingRate ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submitData)
        })
        const data = await response.json()
      
        if (data.success) {
          showToast('success', editingRate ? 'Rate updated!' : 'Rate created!')
          setShowModal(false)
          fetchRates()
        } else {
          showToast('error', data.error || 'Failed to save')
        }
      } catch (error) {
        showToast('error', 'Failed to save rate')
      }
  })
  }

  const handleDelete = async (rate: AirportStaffRate) => {
    const serviceName = formatServiceType(rate.service_type)
    const airportName = getAirportName(rate.airport_code)

    const confirmed = await dialog.confirmDelete('Airport Service Rate',
      `Are you sure you want to delete the "${serviceName}" service at ${airportName} (${rate.direction})? This action cannot be undone.`
    )

    if (!confirmed) return

    try {
      const response = await fetch(`/api/rates/airport-services/${rate.id}`, { method: 'DELETE' })
      const data = await response.json()

      if (data.success) {
        showToast('success', 'Airport service rate deleted!')
        fetchRates()
      } else {
        await dialog.alert('Error', data.error || 'Failed to delete airport service rate', 'warning')
      }
    } catch {
      await dialog.alert('Error', 'Failed to delete airport service rate. Please try again.', 'warning')
    }
  }

  const handleClone = (rate: AirportStaffRate) => {
    setRateCurrency((rate as { rate_currency?: string | null }).rate_currency || '')
    setEditingRate(null)
    setFormData({
      service_code: '',
      airport_code: rate.airport_code,
      service_type: rate.service_type,
      direction: rate.direction,
      rate_eur: rate.rate_eur,
      description: rate.description || '',
      notes: rate.notes || '',
      is_active: rate.is_active,
      supplier_id: rate.supplier_id || '',
      supplier_name: rate.supplier_name || ''
    })
    setShowModal(true)
    showToast('success', 'Rate cloned - modify and save as new')
  }

  const filteredRates = rates.filter(rate => {
    const matchesSearch = searchTerm === '' || 
      rate.airport_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.service_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getAirportName(rate.airport_code).toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.service_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.description?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesAirport = selectedAirport === 'all' || rate.airport_code === selectedAirport
    const matchesService = selectedService === 'all' || rate.service_type === selectedService
    const matchesActive = showInactive || rate.is_active
    return matchesSearch && matchesAirport && matchesService && matchesActive
  })

  // Bulk selection helpers
  const allFilteredSelected = filteredRates.length > 0 && filteredRates.every(r => selectedIds.has(r.id))

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds(allFilteredSelected ? new Set() : new Set(filteredRates.map(r => r.id)))
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    const confirmed = await dialog.confirmDelete('Airport Service Rates',
      `Delete ${ids.length} selected rate(s)? This action cannot be undone.`
    )

    if (!confirmed) return

    setBulkDeleting(true)
    try {
      const results = await Promise.allSettled(
        ids.map(id => fetch(`/api/rates/airport-services/${id}`, { method: 'DELETE' }))
      )
      const deletedIds = ids.filter((id, i) => {
        const result = results[i]
        return result.status === 'fulfilled' && result.value.ok
      })
      const failed = ids.length - deletedIds.length

      setSelectedIds(prev => {
        const next = new Set(prev)
        deletedIds.forEach(id => next.delete(id))
        return next
      })

      if (failed === 0) {
        showToast('success', `Deleted ${deletedIds.length} rate${deletedIds.length === 1 ? '' : 's'}!`)
      } else {
        showToast('error', `Deleted ${deletedIds.length} of ${ids.length} — ${failed} failed`)
      }
      fetchRates()
    } finally {
      setBulkDeleting(false)
    }
  }

  // Pagination calculations
  const totalItems = filteredRates.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)
  const paginatedRates = filteredRates.slice(startIndex, endIndex)

  // Stats
  const uniqueAirports = new Set(rates.map(r => r.airport_code)).size
  const stats = {
    total: rates.length,
    active: rates.filter(r => r.is_active).length,
    airports: uniqueAirports,
    vipServices: rates.filter(r => r.service_type === 'vip_service').length,
    avgRate: averageRateInOneCurrency(rates, r => r.rate_eur, r => r.rate_currency)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading airport service rates...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div key={toast.id} className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg ${
            toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 lg:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plane className="w-5 h-5 text-sky-600" />
            <h1 className="text-xl font-bold text-gray-900">Airport Services</h1>
            <div className="w-1.5 h-1.5 rounded-full bg-sky-600" />
          </div>
          <div className="flex items-center gap-2">
            <BulkRateImportExport tableName="airport_staff_rates" onImportComplete={fetchRates} />
            <button onClick={handleAddNew} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-medium">
              <Plus className="w-4 h-4" /> Add Rate
            </button>
            <Link href="/rates" className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
              ← Rates Hub
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 lg:px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">Total Rates</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">Active</p>
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">Airports</p>
            <p className="text-2xl font-bold text-sky-600">{stats.airports}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">VIP Services</p>
            <p className="text-2xl font-bold text-amber-600">{stats.vipServices}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">Avg. Rate</p>
            <p className="text-2xl font-bold text-green-600">{fmtAverage(stats.avgRate)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md border p-3 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <input 
                type="text" 
                placeholder="Search airports, services, or descriptions..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="w-full pl-3 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600 focus:border-transparent" 
              />
            </div>
            <select 
              value={selectedAirport} 
              onChange={(e) => setSelectedAirport(e.target.value)} 
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600"
            >
              <option value="all">All Airports</option>
              {AIRPORTS.map(a => (
                <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
              ))}
            </select>
            <VocabSelect kind="airport_service_type" value={selectedService} onChange={setSelectedService} placeholder={"All Services"} emptyValue="all"
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600" />
            <button 
              onClick={() => setShowInactive(!showInactive)} 
              className={`px-3 py-2 text-sm rounded-lg font-medium ${
                showInactive ? 'bg-gray-100 text-gray-700' : 'bg-green-50 text-green-700 border border-green-200'
              }`}
            >
              {showInactive ? 'Show All' : 'Active Only'}
            </button>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Showing {filteredRates.length} of {rates.length} airport service rates
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="bg-white rounded-lg shadow-md border p-3 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-900">{selectedIds.size} selected</span>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-sky-600 hover:text-sky-700 hover:underline"
              >
                Clear selection
              </button>
            </div>
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              {bulkDeleting ? 'Deleting...' : 'Delete Selected'}
            </button>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg shadow-md border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-sky-50 border-b border-sky-100">
                <tr>
                  <th className="px-4 py-2 text-center w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 text-sky-600 border-gray-300 rounded focus:ring-sky-500 cursor-pointer"
                      aria-label="Select all airport service rates"
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-sky-800">Airport</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-sky-800">Service</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-sky-800">Direction</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-sky-800">Rate</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-sky-800">Description</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-sky-800">Status</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-sky-800">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedRates.map((rate, idx) => (
                  <tr key={rate.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-sky-50 transition-colors`}>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(rate.id)}
                        onChange={() => toggleSelect(rate.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 text-sky-600 border-gray-300 rounded focus:ring-sky-500 cursor-pointer"
                        aria-label={`Select rate ${rate.service_code}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{rate.airport_code}</p>
                      <p className="text-xs text-gray-500">{getAirportName(rate.airport_code)}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        rate.service_type === 'vip_service' ? 'bg-amber-100 text-amber-800' :
                        rate.service_type === 'full_service' ? 'bg-blue-100 text-blue-800' :
                        rate.service_type === 'customs_assist' ? 'bg-purple-100 text-purple-800' :
                        'bg-sky-100 text-sky-800'
                      }`}>
                        {formatServiceType(rate.service_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        rate.direction === 'both' ? 'bg-green-100 text-green-800' :
                        rate.direction === 'arrival' ? 'bg-blue-100 text-blue-800' :
                        'bg-orange-100 text-orange-800'
                      }`}>
                        {formatDirection(rate.direction)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                      {fmtRate(Number(rate.rate_eur), rate, 2)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px] truncate">
                      {rate.description || '-'}
                      {rate.supplier_name && <span className="block text-[11px] text-gray-400 truncate">via {rate.supplier_name}</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        rate.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {rate.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEdit(rate)}
                          className="p-1 text-gray-500 hover:text-sky-600 hover:bg-sky-50 rounded"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleClone(rate)}
                          className="p-1 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                          title="Clone"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(rate)}
                          className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedRates.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                      <Plane className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">No airport service rates found</p>
                      <button onClick={handleAddNew} className="mt-2 text-sm text-sky-600 hover:underline">
                        Add your first airport service rate
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalItems > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              startIndex={startIndex}
              endIndex={endIndex}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
            />
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{editingRate ? 'Edit' : 'Add'} Airport Service Rate</h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Airport *</label>
                  <select 
                    name="airport_code" 
                    value={formData.airport_code} 
                    onChange={handleChange} 
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600"
                  >
                    {AIRPORTS.map(a => (
                      <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Service Type *</label>
                  <VocabSelect kind="airport_service_type" value={formData.service_type} onChange={v => setFormData(prev => ({ ...prev, service_type: v }))} placeholder={null} name="service_type"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Direction *</label>
                  <select 
                    name="direction" 
                    value={formData.direction} 
                    onChange={handleChange} 
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600"
                  >
                    {DIRECTIONS.map(d => (
                      <option key={d} value={d}>{formatDirection(d)}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Supplier</label>
                  <select
                    value={formData.supplier_id}
                    onChange={e => handleSupplierChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600"
                  >
                    <option value="">In-house / no supplier</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}{s.city ? ` (${s.city})` : ''}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    The company you buy this airport assistance from — any supplier whose type behaves as ground handler.{' '}
                    <Link href="/suppliers?type=ground_handler" className="text-sky-600 hover:underline">Manage suppliers &rarr;</Link>
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Rate ({rateSymbol}) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{rateSymbol}</span>
                    <input
                      type="number"
                      name="rate_eur"
                      value={formData.rate_eur}
                      onChange={handleChange}
                      min="0"
                      step="0.01"
                      required
                      placeholder="0.00"
                      title="Rate"
                      className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600"
                    />
                    <RateCurrencyField compact className="mt-2" value={rateCurrency} onChange={setRateCurrency} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Entered and shown in the rate&rsquo;s own currency</p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <input 
                  type="text" 
                  name="description" 
                  value={formData.description} 
                  onChange={handleChange} 
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600" 
                  placeholder="e.g., VIP meet & greet with lounge access" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Service Code</label>
                <input 
                  type="text" 
                  name="service_code" 
                  value={formData.service_code} 
                  onChange={handleChange} 
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600 font-mono" 
                  placeholder="Auto-generated if empty"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea 
                  name="notes" 
                  value={formData.notes} 
                  onChange={handleChange} 
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600" 
                  placeholder="Internal notes..."
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  name="is_active" 
                  checked={formData.is_active} 
                  onChange={handleCheckbox} 
                  className="w-4 h-4 text-sky-600 rounded focus:ring-sky-500" 
                />
                <span className="text-sm text-gray-700">Active</span>
              </label>
              <div className="flex gap-2 pt-3 border-t">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button 
                  type="submit" disabled={submitting} 
                  className="flex-1 px-3 py-2 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-medium flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {editingRate ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}