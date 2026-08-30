'use client'

import { useState, useEffect, useCallback } from 'react'
import { todayLocal } from '@/lib/today'
import { CurrencyTotals, sumByCurrency, formatTotals } from '@/lib/currency-totals'
import { 
  Search, 
  Plus, 
  Eye,
  Edit2,
  Trash2, 
  X,
  Receipt,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Upload,
  ExternalLink,
  CheckCircle,
  Clock,
  AlertCircle,
  Wallet,
  Download,
  BarChart3,
  List,
  Grid3X3,
  Calendar,
  Filter
} from 'lucide-react'
import Link from 'next/link'
import { showToast } from '@/app/contexts/ToastContext'
import { useConfirmDialog } from '@/components/ConfirmDialog'

interface Expense {
  id: string
  expense_number: string
  itinerary_id: string | null
  supplier_id: string | null
  category: string
  description: string | null
  amount: number
  currency: string
  expense_date: string
  supplier_name: string | null
  supplier_type: string | null
  receipt_url: string | null
  receipt_filename: string | null
  status: string
  payment_method: string | null
  payment_date: string | null
  payment_reference: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface Itinerary {
  id: string
  itinerary_code: string
  trip_name: string
  client_name: string
}

interface FormData {
  itinerary_id: string
  category: string
  description: string
  amount: number
  currency: string
  expense_date: string
  supplier_name: string
  supplier_type: string
  receipt_url: string
  receipt_filename: string
  status: string
  payment_method: string
  payment_date: string
  payment_reference: string
  notes: string
}

const initialFormData: FormData = {
  itinerary_id: '',
  category: '',
  description: '',
  amount: 0,
  currency: 'EUR',
  expense_date: todayLocal(),
  supplier_name: '',
  supplier_type: '',
  receipt_url: '',
  receipt_filename: '',
  status: 'pending',
  payment_method: '',
  payment_date: '',
  payment_reference: '',
  notes: ''
}

const CATEGORIES = [
  { value: 'guide', label: 'Tour Guide', icon: '👨‍🏫' },
  { value: 'driver', label: 'Driver', icon: '🚗' },
  { value: 'hotel', label: 'Hotel/Accommodation', icon: '🏨' },
  { value: 'transportation', label: 'Transportation', icon: '🚐' },
  { value: 'entrance', label: 'Entrance Fees', icon: '🎫' },
  { value: 'meal', label: 'Meals', icon: '🍽️' },
  { value: 'airport_staff', label: 'Airport Staff', icon: '✈️' },
  { value: 'hotel_staff', label: 'Hotel Staff', icon: '🛎️' },
  { value: 'ground_handler', label: 'Ground Handler', icon: '🧳' },
  { value: 'tipping', label: 'Tipping', icon: '💵' },
  { value: 'permits', label: 'Permits/Permissions', icon: '📋' },
  { value: 'toll', label: 'Toll Fees', icon: '🛣️' },
  { value: 'parking', label: 'Parking', icon: '🅿️' },
  { value: 'fuel', label: 'Fuel', icon: '⛽' },
  { value: 'office', label: 'Office Expenses', icon: '🏢' },
  { value: 'marketing', label: 'Marketing', icon: '📢' },
  { value: 'software', label: 'Software/Subscriptions', icon: '💻' },
  { value: 'other', label: 'Other', icon: '📦' }
]

const SUPPLIER_TYPES = [
  { value: 'guide', label: 'Tour Guide' },
  { value: 'driver', label: 'Driver' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'transport_company', label: 'Transport Company' },
  { value: 'airport_staff', label: 'Airport Staff' },
  { value: 'hotel_staff', label: 'Hotel Staff' },
  { value: 'ground_handler', label: 'Ground Handler' },
  { value: 'government', label: 'Government/Authority' },
  { value: 'other', label: 'Other' }
]

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'wise', label: 'Wise' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'company_card', label: 'Company Card' }
]

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  pending: { label: 'Pending', color: 'text-yellow-700', bg: 'bg-yellow-100', icon: Clock },
  approved: { label: 'Approved', color: 'text-blue-700', bg: 'bg-blue-100', icon: CheckCircle },
  paid: { label: 'Paid', color: 'text-green-700', bg: 'bg-green-100', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'text-red-700', bg: 'bg-red-100', icon: AlertCircle }
}

const ITEMS_PER_PAGE = 15

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [itineraries, setItineraries] = useState<Itinerary[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [supplierTypeFilter, setSupplierTypeFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'chart'>('list')
  const [currentPage, setCurrentPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const dialog = useConfirmDialog()

  const fetchExpenses = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (categoryFilter) params.append('category', categoryFilter)
      if (supplierTypeFilter) params.append('supplierType', supplierTypeFilter)
      if (startDate) params.append('startDate', startDate)
      if (endDate) params.append('endDate', endDate)
      
      const response = await fetch(`/api/expenses?${params}`)
      if (response.ok) {
        const data = await response.json()
        setExpenses(data)
      }
    } catch (error) {
      console.error('Error fetching expenses:', error)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, categoryFilter, supplierTypeFilter, startDate, endDate])

  const fetchItineraries = async () => {
    try {
      const response = await fetch('/api/itineraries')
      if (response.ok) {
        const data = await response.json()
        const itinerariesData = data.success ? data.data : (Array.isArray(data) ? data : [])
        setItineraries(itinerariesData || [])
      }
    } catch (error) {
      console.error('Error fetching itineraries:', error)
    }
  }

  useEffect(() => {
    fetchExpenses()
    fetchItineraries()
  }, [fetchExpenses])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter, categoryFilter, supplierTypeFilter, startDate, endDate])

  const openAddModal = () => {
    setEditingExpense(null)
    setFormData(initialFormData)
    setIsModalOpen(true)
  }

  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense)
    setFormData({
      itinerary_id: expense.itinerary_id || '',
      category: expense.category,
      description: expense.description || '',
      amount: expense.amount,
      currency: expense.currency,
      expense_date: expense.expense_date,
      supplier_name: expense.supplier_name || '',
      supplier_type: expense.supplier_type || '',
      receipt_url: expense.receipt_url || '',
      receipt_filename: expense.receipt_filename || '',
      status: expense.status,
      payment_method: expense.payment_method || '',
      payment_date: expense.payment_date || '',
      payment_reference: expense.payment_reference || '',
      notes: expense.notes || ''
    })
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const url = editingExpense 
        ? `/api/expenses/${editingExpense.id}`
        : '/api/expenses'
      
      const response = await fetch(url, {
        method: editingExpense ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        setIsModalOpen(false)
        fetchExpenses()
      } else {
        const error = await response.json()
        showToast('error', error.error || 'Failed to save expense')
      }
    } catch (error) {
      console.error('Error saving expense:', error)
      showToast('error', 'Failed to save expense')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!(await dialog.confirm({ message: 'Are you sure you want to delete this expense?', variant: 'danger', confirmText: 'Delete' }))) return

    try {
      const response = await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
      if (response.ok) {
        fetchExpenses()
      } else {
        showToast('error', 'Failed to delete expense')
      }
    } catch (error) {
      console.error('Error deleting expense:', error)
      showToast('error', 'Failed to delete expense')
    }
  }

  const handleMarkAsPaid = async (expense: Expense) => {
    try {
      const response = await fetch(`/api/expenses/${expense.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'paid', 
          payment_date: todayLocal()
        })
      })
      if (response.ok) {
        fetchExpenses()
      }
    } catch (error) {
      console.error('Error updating expense:', error)
    }
  }

  const exportToCSV = () => {
    const headers = [
      'Expense #',
      'Date',
      'Category',
      'Description',
      'Supplier',
      'Supplier Type',
      'Amount',
      'Currency',
      'Status',
      'Payment Method',
      'Payment Date',
      'Payment Reference',
      'Notes'
    ]

    const rows = filteredExpenses.map(exp => [
      exp.expense_number,
      exp.expense_date,
      getCategoryLabel(exp.category),
      exp.description || '',
      exp.supplier_name || '',
      exp.supplier_type || '',
      exp.amount,
      exp.currency,
      exp.status,
      exp.payment_method || '',
      exp.payment_date || '',
      exp.payment_reference || '',
      exp.notes || ''
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `expenses_${todayLocal()}.csv`
    link.click()
  }

  const clearFilters = () => {
    setSearchTerm('')
    setStatusFilter('')
    setCategoryFilter('')
    setSupplierTypeFilter('')
    setStartDate('')
    setEndDate('')
  }

  const getCurrencySymbol = (currency: string) => {
    const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', EGP: 'E£' }
    return symbols[currency] || currency
  }

  const getCategoryIcon = (category: string) => {
    const cat = CATEGORIES.find(c => c.value === category)
    return cat?.icon || '📦'
  }

  const getCategoryLabel = (category: string) => {
    const cat = CATEGORIES.find(c => c.value === category)
    return cat?.label || category
  }

  const filteredExpenses = expenses.filter(expense => {
    const matchesSearch = 
      expense.expense_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesSearch
  })

  // Pagination
  const totalPages = Math.ceil(filteredExpenses.length / ITEMS_PER_PAGE)
  const paginatedExpenses = filteredExpenses.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  // Stats
  // Per currency — a $500 hotel bill and a €300 guide fee are not €800 of
  // expenses (lib/currency-totals.ts).
  const totalExpenses = sumByCurrency(expenses, e => e.amount, e => e.currency)
  const pendingExpenses = sumByCurrency(expenses.filter(e => e.status === 'pending'), e => e.amount, e => e.currency)
  const approvedExpenses = sumByCurrency(expenses.filter(e => e.status === 'approved'), e => e.amount, e => e.currency)
  const paidExpenses = sumByCurrency(expenses.filter(e => e.status === 'paid'), e => e.amount, e => e.currency)
  // Percentage bars only make sense when everything shares one currency.
  const expenseCurrencies = [...new Set(expenses.map(e => e.currency || 'EUR'))]
  const singleCurrency = expenseCurrencies.length === 1 ? expenseCurrencies[0] : (expenseCurrencies.length === 0 ? 'EUR' : null)
  const mag = (t: CurrencyTotals) => Object.values(t).reduce((x, v) => x + Math.abs(v), 0)

  // Category breakdown for chart
  const categoryBreakdown = CATEGORIES.map(cat => {
    const total = sumByCurrency(
      expenses.filter(e => e.category === cat.value),
      e => e.amount, e => e.currency)
    return { ...cat, total }
  }).filter(c => mag(c.total) > 0).sort((a, b) => mag(b.total) - mag(a.total))

  const hasActiveFilters = statusFilter || categoryFilter || supplierTypeFilter || startDate || endDate

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-lg">
            💰
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Expenses</h1>
            <p className="text-sm text-gray-500">Track operational costs and supplier payments</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white text-sm font-medium rounded-lg hover:bg-[#4f6238] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Expense
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">📊</span>
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">Total Expenses</p>
          <p className="text-2xl font-semibold text-gray-900">{formatTotals(totalExpenses)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⏳</span>
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">Pending</p>
          <p className="text-2xl font-semibold text-yellow-600">{formatTotals(pendingExpenses)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">✅</span>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">Approved</p>
          <p className="text-2xl font-semibold text-blue-600">{formatTotals(approvedExpenses)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">💸</span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">Paid</p>
          <p className="text-2xl font-semibold text-green-600">{formatTotals(paidExpenses)}</p>
        </div>
      </div>

      {/* View Toggle & Search */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`}
            title="List View"
          >
            <List className="h-4 w-4 text-gray-600" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`}
            title="Grid View"
          >
            <Grid3X3 className="h-4 w-4 text-gray-600" />
          </button>
          <button
            onClick={() => setViewMode('chart')}
            className={`p-2 rounded-md transition-colors ${viewMode === 'chart' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'}`}
            title="Chart View"
          >
            <BarChart3 className="h-4 w-4 text-gray-600" />
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search expenses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47]"
          />
        </div>

        {/* Filter Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border rounded-lg transition-colors ${
            hasActiveFilters 
              ? 'border-[#647C47] text-[#647C47] bg-[#647C47]/5' 
              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="w-2 h-2 rounded-full bg-[#647C47]"></span>
          )}
        </button>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
              >
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
              >
                <option value="">All Categories</option>
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.icon} {cat.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Supplier Type</label>
              <select
                value={supplierTypeFilter}
                onChange={(e) => setSupplierTypeFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
              >
                <option value="">All Suppliers</option>
                {SUPPLIER_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">From Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
              />
            </div>
          </div>
        </div>
      )}

      {/* Chart View */}
      {viewMode === 'chart' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Category Breakdown */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Expenses by Category</h3>
            <div className="space-y-3">
              {categoryBreakdown.slice(0, 10).map(cat => {
                // Width by single-currency share when unambiguous; by magnitude otherwise
                // (ordering signal only — the label shows the real per-currency figures).
                const percentage = singleCurrency
                  ? ((cat.total[singleCurrency] || 0) / (totalExpenses[singleCurrency] || 1)) * 100
                  : (mag(totalExpenses) > 0 ? (mag(cat.total) / mag(totalExpenses)) * 100 : 0)
                return (
                  <div key={cat.value}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="flex items-center gap-2">
                        <span>{cat.icon}</span>
                        <span className="text-gray-700">{cat.label}</span>
                      </div>
                      <span className="font-medium text-gray-900">{formatTotals(cat.total)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#647C47] rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Status Breakdown */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Expenses by Status</h3>
            <div className="space-y-4">
              {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                const amount = sumByCurrency(expenses.filter(e => e.status === key), e => e.amount, e => e.currency)
                const count = expenses.filter(e => e.status === key).length
                // Same rule as the category bars: real share in a single currency,
                // magnitude-based ordering signal when currencies are mixed.
                const percentage = singleCurrency
                  ? ((amount[singleCurrency] || 0) / (totalExpenses[singleCurrency] || 1)) * 100
                  : (mag(totalExpenses) > 0 ? (mag(amount) / mag(totalExpenses)) * 100 : 0)
                
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                          {config.label}
                        </span>
                        <span className="text-gray-500">{count} items</span>
                      </div>
                      <span className="font-medium text-gray-900">{formatTotals(amount)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          key === 'paid' ? 'bg-green-500' :
                          key === 'approved' ? 'bg-blue-500' :
                          key === 'pending' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedExpenses.map((expense) => {
            const statusConfig = STATUS_CONFIG[expense.status] || STATUS_CONFIG.pending
            const StatusIcon = statusConfig.icon
            return (
              <div key={expense.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:border-[#647C47] transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getCategoryIcon(expense.category)}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{expense.expense_number}</p>
                      <p className="text-xs text-gray-500">{getCategoryLabel(expense.category)}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                    <StatusIcon className="h-3 w-3" />
                    {statusConfig.label}
                  </span>
                </div>
                
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{expense.description || 'No description'}</p>
                
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-gray-500">{new Date(expense.expense_date).toLocaleDateString()}</p>
                    {expense.supplier_name && (
                      <p className="text-xs text-gray-500">{expense.supplier_name}</p>
                    )}
                  </div>
                  <p className="text-lg font-semibold text-gray-900">
                    {getCurrencySymbol(expense.currency)}{Number(expense.amount).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100">
                  <Link
                    href={`/expenses/${expense.id}`}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-gray-600 hover:text-[#647C47] hover:bg-gray-50 rounded transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </Link>
                  <button
                    onClick={() => openEditModal(expense)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(expense.id)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* List View (Table) */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Expense</th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Category</th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Supplier</th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Date</th>
                <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Amount</th>
                <th className="text-center text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Status</th>
                <th className="text-center text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Receipt</th>
                <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedExpenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                    No expenses found
                  </td>
                </tr>
              ) : (
                paginatedExpenses.map((expense) => {
                  const statusConfig = STATUS_CONFIG[expense.status] || STATUS_CONFIG.pending
                  const StatusIcon = statusConfig.icon
                  return (
                    <tr key={expense.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <Link href={`/expenses/${expense.id}`} className="text-sm font-medium text-gray-900 hover:text-[#647C47]">
                            {expense.expense_number}
                          </Link>
                          <p className="text-xs text-gray-500 truncate max-w-[200px]">{expense.description || '-'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{getCategoryIcon(expense.category)}</span>
                          <span className="text-sm text-gray-700">{getCategoryLabel(expense.category)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm text-gray-900">{expense.supplier_name || '-'}</p>
                          {expense.supplier_type && (
                            <p className="text-xs text-gray-500 capitalize">{expense.supplier_type.replace('_', ' ')}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">
                          {new Date(expense.expense_date).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold text-gray-900">
                          {getCurrencySymbol(expense.currency)}{Number(expense.amount).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                          <StatusIcon className="h-3 w-3" />
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {expense.receipt_url ? (
                          <a
                            href={expense.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                          >
                            <Receipt className="h-3.5 w-3.5" />
                            View
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/expenses/${expense.id}`}
                            className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-gray-100 rounded transition-colors"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          {expense.status === 'approved' && (
                            <button
                              onClick={() => handleMarkAsPaid(expense)}
                              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                              title="Mark as Paid"
                            >
                              <Wallet className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(expense)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(expense.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
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
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (viewMode === 'list' || viewMode === 'grid') && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredExpenses.length)} of {filteredExpenses.length} expenses
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum
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
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-8 h-8 text-sm rounded-lg ${
                    currentPage === pageNum
                      ? 'bg-[#647C47] text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {pageNum}
                </button>
              )
            })}
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
              <h2 className="text-base font-semibold text-gray-900">
                {editingExpense ? 'Edit Expense' : 'Add Expense'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-5">
              {/* Category & Amount */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
                  >
                    <option value="">Select Category</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.icon} {cat.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Amount <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={formData.currency}
                      onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                      className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                    >
                      <option value="EUR">EUR €</option>
                      <option value="USD">USD $</option>
                      <option value="GBP">GBP £</option>
                      <option value="EGP">EGP E£</option>
                    </select>
                    <input
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                      step="0.01"
                      min="0"
                      required
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="What was this expense for?"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                />
              </div>

              {/* Date & Itinerary */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Expense Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.expense_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, expense_date: e.target.value }))}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Link to Trip (Optional)</label>
                  <select
                    value={formData.itinerary_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, itinerary_id: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                  >
                    <option value="">No Trip Link</option>
                    {itineraries.map(it => (
                      <option key={it.id} value={it.id}>
                        {it.itinerary_code} - {it.client_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Supplier Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Supplier Name</label>
                  <input
                    type="text"
                    value={formData.supplier_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, supplier_name: e.target.value }))}
                    placeholder="e.g., Ahmed Mohamed"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Supplier Type</label>
                  <select
                    value={formData.supplier_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, supplier_type: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                  >
                    <option value="">Select Type</option>
                    {SUPPLIER_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
                <div className="flex gap-2">
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, status: key }))}
                      className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                        formData.status === key
                          ? `${config.bg} ${config.color} border-current`
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {config.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Info (if paid/approved) */}
              {(formData.status === 'paid' || formData.status === 'approved') && (
                <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment Method</label>
                    <select
                      value={formData.payment_method}
                      onChange={(e) => setFormData(prev => ({ ...prev, payment_method: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                    >
                      <option value="">Select Method</option>
                      {PAYMENT_METHODS.map(method => (
                        <option key={method.value} value={method.value}>{method.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment Date</label>
                    <input
                      type="date"
                      value={formData.payment_date}
                      onChange={(e) => setFormData(prev => ({ ...prev, payment_date: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Reference</label>
                    <input
                      type="text"
                      value={formData.payment_reference}
                      onChange={(e) => setFormData(prev => ({ ...prev, payment_reference: e.target.value }))}
                      placeholder="TXN-12345"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                    />
                  </div>
                </div>
              )}

              {/* Receipt URL */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Receipt URL</label>
                <input
                  type="url"
                  value={formData.receipt_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, receipt_url: e.target.value }))}
                  placeholder="https://drive.google.com/..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                />
                <p className="text-xs text-gray-400 mt-1">Upload receipt to Google Drive and paste the link</p>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder="Additional notes..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : (editingExpense ? 'Update Expense' : 'Add Expense')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center pt-4">
        <p className="text-xs text-gray-400">© {new Date().getFullYear()} Autoura Operations System</p>
      </div>
    </div>
  )
}