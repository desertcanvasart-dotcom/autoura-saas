'use client'
// @bulk-import
import BulkRateImportExport from '@/app/components/BulkRateImportExport'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  DollarSign, Plus, Search, Edit, Trash2, X, Check, AlertCircle, CheckCircle2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Copy, Download, Upload
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useCurrency } from '@/hooks/useCurrency'

// ============================================
// CONSTANTS
// ============================================

const ROLE_TYPES = ['guide', 'driver', 'boat_crew', 'porter', 'hotel_staff', 'restaurant', 'other']
const CONTEXTS = ['day_tour', 'half_day_tour', 'cruise', 'transfer', 'airport', 'hotel', 'restaurant', 'felucca', 'motorboat']
const RATE_UNITS = ['per_day', 'per_service', 'per_cruise', 'per_night', 'per_person']
const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

// ============================================
// INTERFACES
// ============================================

interface TippingRate {
  id: string
  service_code: string
  role_type: string
  context: string | null
  rate_unit: string
  rate_eur: number
  description: string | null
  notes: string | null
  is_active: boolean
}

interface Toast { 
  id: string
  type: 'success' | 'error'
  message: string 
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
            className="px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-green-600 bg-white"
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
                    ? 'bg-green-600 text-white'
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

export default function TippingPage() {
  const dialog = useConfirmDialog()
  const { convert, symbol, userCurrency, loading: currencyLoading } = useCurrency()
  
  const [rates, setRates] = useState<TippingRate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRole, setSelectedRole] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingRate, setEditingRate] = useState<TippingRate | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  const [formData, setFormData] = useState({
    service_code: '',
    role_type: 'guide',
    context: 'day_tour',
    rate_unit: 'per_day',
    rate_eur: 0,
    description: '',
    notes: '',
    is_active: true
  })

  const showToast = (type: 'success' | 'error', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  const fetchRates = async () => {
    try {
      const response = await fetch('/api/rates/tipping')
      const data = await response.json()
      if (data.success) setRates(data.data)
    } catch (error) {
      showToast('error', 'Failed to load tipping rates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRates() }, [])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedRole, showInactive, itemsPerPage])

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
    return `TIP-${formData.role_type.toUpperCase()}-${formData.context?.toUpperCase() || 'GEN'}`
  }

  const handleAddNew = () => {
    setEditingRate(null)
    setFormData({ 
      service_code: '', 
      role_type: 'guide', 
      context: 'day_tour', 
      rate_unit: 'per_day', 
      rate_eur: 0, 
      description: '', 
      notes: '', 
      is_active: true 
    })
    setShowModal(true)
  }

  const handleEdit = (rate: TippingRate) => {
    setEditingRate(rate)
    setFormData({
      service_code: rate.service_code,
      role_type: rate.role_type,
      context: rate.context || '',
      rate_unit: rate.rate_unit,
      rate_eur: rate.rate_eur,
      description: rate.description || '',
      notes: rate.notes || '',
      is_active: rate.is_active
    })
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const submitData = { ...formData, service_code: formData.service_code || generateCode() }

    try {
      const url = editingRate ? `/api/rates/tipping/${editingRate.id}` : '/api/rates/tipping'
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
  }

  const handleDelete = async (rate: TippingRate) => {
    const roleName = rate.role_type.replace('_', ' ')
    const contextName = rate.context ? ` (${rate.context.replace('_', ' ')})` : ''

    const confirmed = await dialog.confirmDelete('Tipping Rate',
      `Are you sure you want to delete the tipping rate for "${roleName}"${contextName}? This action cannot be undone.`
    )

    if (!confirmed) return

    try {
      const response = await fetch(`/api/rates/tipping/${rate.id}`, { method: 'DELETE' })
      const data = await response.json()

      if (data.success) {
        showToast('success', 'Tipping rate deleted!')
        fetchRates()
      } else {
        await dialog.alert('Error', data.error || 'Failed to delete tipping rate', 'warning')
      }
    } catch {
      await dialog.alert('Error', 'Failed to delete tipping rate. Please try again.', 'warning')
    }
  }

  const handleClone = (rate: TippingRate) => {
    setEditingRate(null)
    setFormData({
      service_code: '',
      role_type: rate.role_type,
      context: rate.context || '',
      rate_unit: rate.rate_unit,
      rate_eur: rate.rate_eur,
      description: rate.description || '',
      notes: rate.notes || '',
      is_active: rate.is_active
    })
    setShowModal(true)
    showToast('success', 'Rate cloned! Modify and save as new.')
  }

  const handleExportCSV = () => {
    if (filteredRates.length === 0) {
      showToast('error', 'No rates to export')
      return
    }

    const headers = ['service_code', 'role_type', 'context', 'rate_unit', 'rate_eur', 'description', 'notes', 'is_active']
    const csvContent = [
      headers.join(','),
      ...filteredRates.map(rate => [
        `"${rate.service_code || ''}"`,
        `"${rate.role_type || ''}"`,
        `"${rate.context || ''}"`,
        `"${rate.rate_unit || ''}"`,
        rate.rate_eur,
        `"${(rate.description || '').replace(/"/g, '""')}"`,
        `"${(rate.notes || '').replace(/"/g, '""')}"`,
        rate.is_active
      ].join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `tipping-rates-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
    showToast('success', `Exported ${filteredRates.length} rates to CSV`)
  }

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const lines = text.split('\n').filter(line => line.trim())

    if (lines.length < 2) {
      showToast('error', 'CSV file is empty or invalid')
      event.target.value = ''
      return
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    const requiredHeaders = ['role_type', 'rate_unit', 'rate_eur']
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))

    if (missingHeaders.length > 0) {
      showToast('error', `Missing required columns: ${missingHeaders.join(', ')}`)
      event.target.value = ''
      return
    }

    let successCount = 0
    let errorCount = 0

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

      const row: Record<string, string> = {}
      headers.forEach((header, index) => {
        row[header] = values[index]?.replace(/^"|"$/g, '') || ''
      })

      const rateData = {
        service_code: row.service_code || '',
        role_type: row.role_type || 'guide',
        context: row.context || null,
        rate_unit: row.rate_unit || 'per_day',
        rate_eur: parseFloat(row.rate_eur) || 0,
        description: row.description || null,
        notes: row.notes || null,
        is_active: row.is_active === 'true' || row.is_active === '1' || row.is_active === 'yes'
      }

      try {
        const response = await fetch('/api/rates/tipping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rateData)
        })
        const data = await response.json()
        if (data.success) {
          successCount++
        } else {
          errorCount++
        }
      } catch {
        errorCount++
      }
    }

    event.target.value = ''
    fetchRates()

    if (successCount > 0) {
      showToast('success', `Imported ${successCount} rates${errorCount > 0 ? `, ${errorCount} failed` : ''}`)
    } else {
      showToast('error', `Failed to import rates. ${errorCount} errors.`)
    }
  }

  const filteredRates = rates.filter(rate => {
    const matchesSearch = searchTerm === '' || 
      rate.role_type.toLowerCase().includes(searchTerm.toLowerCase()) || 
      rate.context?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.service_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.description?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = selectedRole === 'all' || rate.role_type === selectedRole
    const matchesActive = showInactive || rate.is_active
    return matchesSearch && matchesRole && matchesActive
  })

  // Pagination calculations
  const totalItems = filteredRates.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)
  const paginatedRates = filteredRates.slice(startIndex, endIndex)

  // Stats
  const stats = {
    total: rates.length,
    active: rates.filter(r => r.is_active).length,
    guides: rates.filter(r => r.role_type === 'guide').length,
    drivers: rates.filter(r => r.role_type === 'driver').length,
    avgTip: rates.length > 0 
      ? Math.round(rates.reduce((sum, r) => sum + r.rate_eur, 0) / rates.length)
      : 0
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading tipping rates...</p>
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
            <DollarSign className="w-5 h-5 text-green-600" />
            <h1 className="text-xl font-bold text-gray-900">Tipping Rates</h1>
            <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
          </div>
          <div className="flex items-center gap-2">
            <BulkRateImportExport tableName="tipping_rates" onImportComplete={fetchRates} />
            <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
              <Download className="w-4 h-4" /> Export
            </button>
            <label className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium cursor-pointer">
              <Upload className="w-4 h-4" /> Import
              <input type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
            </label>
            <button onClick={handleAddNew} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
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
            <p className="text-xs text-gray-600">Guide Tips</p>
            <p className="text-2xl font-bold text-blue-600">{stats.guides}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">Driver Tips</p>
            <p className="text-2xl font-bold text-orange-600">{stats.drivers}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">Avg. Tip</p>
            <p className="text-2xl font-bold text-green-600">{symbol}{convert(stats.avgTip).toFixed(0)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md border p-3 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search roles, contexts, or descriptions..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent" 
              />
            </div>
            <select 
              value={selectedRole} 
              onChange={(e) => setSelectedRole(e.target.value)} 
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600"
            >
              <option value="all">All Roles</option>
              {ROLE_TYPES.map(r => (
                <option key={r} value={r}>{r.replace('_', ' ')}</option>
              ))}
            </select>
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
            Showing {filteredRates.length} of {rates.length} tipping rates
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-md border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-green-50 border-b border-green-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-green-800">Role</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-green-800">Context</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-green-800">Unit</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-green-800">{userCurrency} Rate</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-green-800">Description</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-green-800">Status</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-green-800">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedRates.map((rate, idx) => (
                  <tr key={rate.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-green-50 transition-colors`}>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        rate.role_type === 'guide' ? 'bg-blue-100 text-blue-800' :
                        rate.role_type === 'driver' ? 'bg-orange-100 text-orange-800' :
                        rate.role_type === 'boat_crew' ? 'bg-cyan-100 text-cyan-800' :
                        rate.role_type === 'porter' ? 'bg-purple-100 text-purple-800' :
                        rate.role_type === 'hotel_staff' ? 'bg-pink-100 text-pink-800' :
                        rate.role_type === 'restaurant' ? 'bg-amber-100 text-amber-800' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {rate.role_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-600">
                      {rate.context?.replace('_', ' ') || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-medium">
                        {rate.rate_unit.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                      {symbol}{convert(Number(rate.rate_eur)).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px] truncate">
                      {rate.description || '-'}
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
                          className="p-1 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleClone(rate)}
                          className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
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
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      <DollarSign className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">No tipping rates found</p>
                      <button onClick={handleAddNew} className="mt-2 text-sm text-green-600 hover:underline">
                        Add your first tipping rate
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
              <h2 className="text-lg font-bold text-gray-900">{editingRate ? 'Edit' : 'Add'} Tipping Rate</h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Role Type *</label>
                  <select 
                    name="role_type" 
                    value={formData.role_type} 
                    onChange={handleChange} 
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600"
                  >
                    {ROLE_TYPES.map(r => (
                      <option key={r} value={r}>{r.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Context</label>
                  <select 
                    name="context" 
                    value={formData.context} 
                    onChange={handleChange} 
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600"
                  >
                    <option value="">No specific context</option>
                    {CONTEXTS.map(c => (
                      <option key={c} value={c}>{c.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Rate Unit *</label>
                  <select 
                    name="rate_unit" 
                    value={formData.rate_unit} 
                    onChange={handleChange} 
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600"
                  >
                    {RATE_UNITS.map(u => (
                      <option key={u} value={u}>{u.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount in EUR (€) *</label>
                  <input 
                    type="number" 
                    name="rate_eur" 
                    value={formData.rate_eur} 
                    onChange={handleChange} 
                    min="0" 
                    step="0.5" 
                    required 
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600" 
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <input 
                  type="text" 
                  name="description" 
                  value={formData.description} 
                  onChange={handleChange} 
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600" 
                  placeholder="e.g., Full day tour guide tip" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Service Code</label>
                <input 
                  type="text" 
                  name="service_code" 
                  value={formData.service_code} 
                  onChange={handleChange} 
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 font-mono" 
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
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600" 
                  placeholder="Additional notes..."
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  name="is_active" 
                  checked={formData.is_active} 
                  onChange={handleCheckbox} 
                  className="w-4 h-4 text-green-600 rounded focus:ring-green-500" 
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
                  type="submit" 
                  className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center justify-center gap-2"
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