'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/contexts/AuthContext'
import { useTenant } from '@/app/contexts/TenantContext'
import { showToast } from '@/app/contexts/ToastContext'
import { 
  Search,
  DollarSign,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
  Eye,
  Building,
  Receipt,
  Calendar,
  Wallet,
  CheckCircle,
  CreditCard,
  TrendingDown,
  Users
} from 'lucide-react'

interface AgingBucket {
  current: number
  days30: number
  days60: number
  days90Plus: number
}

interface SupplierPayable {
  supplier_name: string
  supplier_type: string
  total_expenses: number
  total_paid: number
  total_outstanding: number
  expense_count: number
  oldest_expense_date: string
  aging: AgingBucket
  expenses: Expense[]
}

interface Expense {
  id: string
  expense_number: string
  category: string
  description: string
  amount: number
  currency: string
  expense_date: string
  supplier_name: string
  supplier_type: string
  status: string
  payment_method: string
  payment_date: string
  days_outstanding: number
  aging_bucket: string
  is_overdue: boolean
}

interface Summary {
  total_outstanding: number
  supplier_count: number
  expense_count: number
  aging: AgingBucket
  pending_count: number
  pending_amount: number
  approved_count: number
  approved_amount: number
  overdue_count: number
  overdue_amount: number
}

const SUPPLIER_TYPES: Record<string, { label: string; icon: string }> = {
  guide: { label: 'Tour Guide', icon: '👨‍🏫' },
  driver: { label: 'Driver', icon: '🚗' },
  hotel: { label: 'Hotel', icon: '🏨' },
  restaurant: { label: 'Restaurant', icon: '🍽️' },
  transport_company: { label: 'Transport Company', icon: '🚐' },
  airport_staff: { label: 'Airport Staff', icon: '✈️' },
  hotel_staff: { label: 'Hotel Staff', icon: '🛎️' },
  ground_handler: { label: 'Ground Handler', icon: '🧳' },
  government: { label: 'Government', icon: '🏛️' },
  other: { label: 'Other', icon: '📦' }
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
  guide: { label: 'Tour Guide', icon: '👨‍🏫' },
  driver: { label: 'Driver', icon: '🚗' },
  hotel: { label: 'Hotel', icon: '🏨' },
  transportation: { label: 'Transportation', icon: '🚐' },
  entrance: { label: 'Entrance Fees', icon: '🎫' },
  meal: { label: 'Meals', icon: '🍽️' },
  airport_staff: { label: 'Airport Staff', icon: '✈️' },
  hotel_staff: { label: 'Hotel Staff', icon: '🛎️' },
  ground_handler: { label: 'Ground Handler', icon: '🧳' },
  tipping: { label: 'Tipping', icon: '💵' },
  permits: { label: 'Permits', icon: '📋' },
  toll: { label: 'Toll Fees', icon: '🛣️' },
  parking: { label: 'Parking', icon: '🅿️' },
  fuel: { label: 'Fuel', icon: '⛽' },
  other: { label: 'Other', icon: '📦' }
}

const ITEMS_PER_PAGE = 15

export default function AccountsPayablePage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { tenant, loading: tenantLoading, isManager } = useTenant()

  const [suppliers, setSuppliers] = useState<SupplierPayable[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [recentPayments, setRecentPayments] = useState<Expense[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [categoryBreakdown, setCategoryBreakdown] = useState<Record<string, number>>({})
  const [supplierTypeBreakdown, setSupplierTypeBreakdown] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [agingFilter, setAgingFilter] = useState('')
  const [supplierTypeFilter, setSupplierTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [viewMode, setViewMode] = useState<'suppliers' | 'expenses' | 'payments'>('suppliers')
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (agingFilter) params.append('aging', agingFilter)
      if (supplierTypeFilter) params.append('supplierType', supplierTypeFilter)
      if (statusFilter) params.append('status', statusFilter)

      const response = await fetch(`/api/accounts-payable?${params}`)
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setSuppliers(result.data)
          setExpenses(result.expenses)
          setRecentPayments(result.recentPayments || [])
          setSummary(result.summary)
          setCategoryBreakdown(result.categoryBreakdown || {})
          setSupplierTypeBreakdown(result.supplierTypeBreakdown || {})
        }
      }
    } catch (error) {
      console.error('Error fetching AP data:', error)
    } finally {
      setLoading(false)
    }
  }, [agingFilter, supplierTypeFilter, statusFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, agingFilter, supplierTypeFilter, statusFilter, viewMode])

  // Authentication check
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  const handleMarkAsPaid = async (expense: Expense) => {
    try {
      const response = await fetch(`/api/expenses/${expense.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'paid', 
          payment_date: new Date().toISOString().split('T')[0]
        })
      })
      if (response.ok) {
        fetchData()
      }
    } catch (error) {
      console.error('Error marking as paid:', error)
    }
  }

  const handleApprove = async (expense: Expense) => {
    try {
      const response = await fetch(`/api/expenses/${expense.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' })
      })
      if (response.ok) {
        fetchData()
      }
    } catch (error) {
      console.error('Error approving expense:', error)
    }
  }

  const getCurrencySymbol = (currency: string = 'EUR') => {
    const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', EGP: 'E£' }
    return symbols[currency] || currency
  }

  const getAgingColor = (bucket: string) => {
    switch (bucket) {
      case 'current': return 'text-green-600 bg-green-100'
      case 'overdue':
      case '30': return 'text-yellow-600 bg-yellow-100'
      case '60': return 'text-orange-600 bg-orange-100'
      case '90plus': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getAgingLabel = (bucket: string) => {
    switch (bucket) {
      case 'current': return 'Current'
      case 'overdue': return '15-30 Days'
      case '30': return '15-30 Days'
      case '60': return '31-60 Days'
      case '90plus': return '90+ Days'
      default: return bucket
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-100'
      case 'approved': return 'text-blue-600 bg-blue-100'
      case 'paid': return 'text-green-600 bg-green-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const filteredSuppliers = suppliers.filter(supplier => {
    return supplier.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase())
  })

  const filteredExpenses = expenses.filter(expense => {
    return expense.expense_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           expense.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           expense.description?.toLowerCase().includes(searchTerm.toLowerCase())
  })

  const getDisplayData = () => {
    if (viewMode === 'suppliers') return filteredSuppliers
    if (viewMode === 'payments') return recentPayments
    return filteredExpenses
  }

  const displayData = getDisplayData()
  const totalPages = Math.ceil(displayData.length / ITEMS_PER_PAGE)
  const paginatedData = displayData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  const hasActiveFilters = agingFilter || supplierTypeFilter || statusFilter

  const clearFilters = () => {
    setAgingFilter('')
    setSupplierTypeFilter('')
    setStatusFilter('')
  }

  // Show loading during authentication check
  if (authLoading || tenantLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2d3b2d]"></div>
      </div>
    )
  }

  // Redirect if not authenticated (will be handled by useEffect)
  if (!user) {
    return null
  }

  // Check authorization
  if (!isManager) {
    return (
      <div className="p-8">
        <div className="max-w-md mx-auto text-center">
          <div className="mb-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-6">
            You don't have permission to view accounts payable. Manager access is required.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#2d3b2d] text-white rounded-lg hover:bg-[#3d4b3d] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

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
            💸
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-gray-900">Accounts Payable</h1>
              {tenant && (
                <span className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full">
                  {tenant.company_name}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">Track outstanding supplier payments</p>
          </div>
        </div>
        <Link
          href="/expenses"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] transition-colors"
        >
          <Receipt className="h-4 w-4" />
          View All Expenses
        </Link>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">💰</span>
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">Total Payable</p>
            <p className="text-2xl font-semibold text-red-600">€{summary.total_outstanding.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">{summary.expense_count} expenses</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">⏳</span>
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">Pending Approval</p>
            <p className="text-2xl font-semibold text-yellow-600">€{summary.pending_amount.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">{summary.pending_count} expenses</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">✅</span>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">Approved to Pay</p>
            <p className="text-2xl font-semibold text-blue-600">€{summary.approved_amount.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">{summary.approved_count} expenses</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">✅</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">Current</p>
            <p className="text-2xl font-semibold text-green-600">€{summary.aging.current.toLocaleString()}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">⏰</span>
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">31-60 Days</p>
            <p className="text-2xl font-semibold text-orange-600">€{summary.aging.days60.toLocaleString()}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🚨</span>
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">90+ Days</p>
            <p className="text-2xl font-semibold text-red-600">€{summary.aging.days90Plus.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Aging Report Visual */}
      {summary && summary.total_outstanding > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Aging Report</h3>
          <div className="flex h-8 rounded-lg overflow-hidden">
            {summary.aging.current > 0 && (
              <div 
                className="bg-green-500 flex items-center justify-center text-white text-xs font-medium"
                style={{ width: `${(summary.aging.current / summary.total_outstanding) * 100}%` }}
                title={`Current: €${summary.aging.current.toLocaleString()}`}
              >
                {((summary.aging.current / summary.total_outstanding) * 100).toFixed(0)}%
              </div>
            )}
            {summary.aging.days30 > 0 && (
              <div 
                className="bg-yellow-500 flex items-center justify-center text-white text-xs font-medium"
                style={{ width: `${(summary.aging.days30 / summary.total_outstanding) * 100}%` }}
                title={`15-30 Days: €${summary.aging.days30.toLocaleString()}`}
              >
                {((summary.aging.days30 / summary.total_outstanding) * 100).toFixed(0)}%
              </div>
            )}
            {summary.aging.days60 > 0 && (
              <div 
                className="bg-orange-500 flex items-center justify-center text-white text-xs font-medium"
                style={{ width: `${(summary.aging.days60 / summary.total_outstanding) * 100}%` }}
                title={`31-60 Days: €${summary.aging.days60.toLocaleString()}`}
              >
                {((summary.aging.days60 / summary.total_outstanding) * 100).toFixed(0)}%
              </div>
            )}
            {summary.aging.days90Plus > 0 && (
              <div 
                className="bg-red-500 flex items-center justify-center text-white text-xs font-medium"
                style={{ width: `${(summary.aging.days90Plus / summary.total_outstanding) * 100}%` }}
                title={`90+ Days: €${summary.aging.days90Plus.toLocaleString()}`}
              >
                {((summary.aging.days90Plus / summary.total_outstanding) * 100).toFixed(0)}%
              </div>
            )}
          </div>
          <div className="flex items-center gap-6 mt-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-500"></div>
              <span className="text-gray-600">Current (0-14 days)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-yellow-500"></div>
              <span className="text-gray-600">15-30 Days</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-orange-500"></div>
              <span className="text-gray-600">31-60 Days</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-red-500"></div>
              <span className="text-gray-600">90+ Days</span>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search suppliers or expenses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47]"
          />
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
          <button
            onClick={() => setViewMode('suppliers')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'suppliers' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            By Supplier
          </button>
          <button
            onClick={() => setViewMode('expenses')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'expenses' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            By Expense
          </button>
          <button
            onClick={() => setViewMode('payments')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'payments' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Payment History
          </button>
        </div>

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
          {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-[#647C47]"></span>}
        </button>

        {hasActiveFilters && (
          <button onClick={clearFilters} className="text-sm text-gray-500 hover:text-gray-700">
            Clear
          </button>
        )}
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Aging</label>
              <select
                value={agingFilter}
                onChange={(e) => setAgingFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
              >
                <option value="">All Aging</option>
                <option value="current">Current (0-14 days)</option>
                <option value="30">15-30 Days</option>
                <option value="60">31-60 Days</option>
                <option value="90">90+ Days</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Supplier Type</label>
              <select
                value={supplierTypeFilter}
                onChange={(e) => setSupplierTypeFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
              >
                <option value="">All Types</option>
                {Object.entries(SUPPLIER_TYPES).map(([key, val]) => (
                  <option key={key} value={key}>{val.icon} {val.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending Approval</option>
                <option value="approved">Approved</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Supplier View */}
      {viewMode === 'suppliers' && (
        <div className="space-y-3">
          {(paginatedData as SupplierPayable[]).length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
              <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
              <p className="text-gray-500">No outstanding payables</p>
            </div>
          ) : (
            (paginatedData as SupplierPayable[]).map((supplier) => {
              const typeConfig = SUPPLIER_TYPES[supplier.supplier_type] || SUPPLIER_TYPES.other
              return (
                <div key={supplier.supplier_name} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedSupplier(expandedSupplier === supplier.supplier_name ? null : supplier.supplier_name)}
                    className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-xl">
                        {typeConfig.icon}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-gray-900">{supplier.supplier_name}</p>
                        <p className="text-xs text-gray-500">{typeConfig.label}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">€{supplier.total_outstanding.toLocaleString()}</p>
                        <p className="text-xs text-gray-500">{supplier.expense_count} expense{supplier.expense_count !== 1 ? 's' : ''}</p>
                      </div>
                      
                      {/* Mini aging bars */}
                      <div className="hidden md:flex items-center gap-1">
                        {supplier.aging.current > 0 && (
                          <div className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
                            €{supplier.aging.current.toLocaleString()}
                          </div>
                        )}
                        {supplier.aging.days30 > 0 && (
                          <div className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded">
                            €{supplier.aging.days30.toLocaleString()}
                          </div>
                        )}
                        {supplier.aging.days60 > 0 && (
                          <div className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded">
                            €{supplier.aging.days60.toLocaleString()}
                          </div>
                        )}
                        {supplier.aging.days90Plus > 0 && (
                          <div className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">
                            €{supplier.aging.days90Plus.toLocaleString()}
                          </div>
                        )}
                      </div>

                      <ChevronRight className={`h-5 w-5 text-gray-400 transition-transform ${expandedSupplier === supplier.supplier_name ? 'rotate-90' : ''}`} />
                    </div>
                  </button>

                  {/* Expanded expenses */}
                  {expandedSupplier === supplier.supplier_name && (
                    <div className="border-t border-gray-200 bg-gray-50 p-4">
                      <div className="space-y-2">
                        {supplier.expenses.map((expense: Expense) => {
                          const catConfig = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.other
                          return (
                            <div key={expense.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                              <div className="flex items-center gap-3">
                                <span className="text-lg">{catConfig.icon}</span>
                                <div>
                                  <Link href={`/expenses/${expense.id}`} className="text-sm font-medium text-gray-900 hover:text-[#647C47]">
                                    {expense.expense_number}
                                  </Link>
                                  <p className="text-xs text-gray-500">
                                    {expense.description || catConfig.label} • {new Date(expense.expense_date).toLocaleDateString()}
                                    {expense.days_outstanding > 14 && (
                                      <span className="text-orange-500 ml-2">({expense.days_outstanding} days old)</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-gray-900">
                                    {getCurrencySymbol(expense.currency)}{Number(expense.amount).toLocaleString()}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(expense.status)}`}>
                                      {expense.status === 'pending' ? 'Pending' : 'Approved'}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  {expense.status === 'pending' && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleApprove(expense); }}
                                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                      title="Approve"
                                    >
                                      <CheckCircle className="h-4 w-4" />
                                    </button>
                                  )}
                                  {expense.status === 'approved' && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleMarkAsPaid(expense); }}
                                      className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                                      title="Mark as Paid"
                                    >
                                      <Wallet className="h-4 w-4" />
                                    </button>
                                  )}
                                  <Link
                                    href={`/expenses/${expense.id}`}
                                    className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-gray-100 rounded transition-colors"
                                    title="View Expense"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Link>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Expense View */}
      {viewMode === 'expenses' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Expense</th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Supplier</th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Date</th>
                <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Amount</th>
                <th className="text-center text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Status</th>
                <th className="text-center text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Aging</th>
                <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(paginatedData as Expense[]).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                    No outstanding expenses
                  </td>
                </tr>
              ) : (
                (paginatedData as Expense[]).map((expense) => {
                  const catConfig = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.other
                  return (
                    <tr key={expense.id} className={`hover:bg-gray-50 ${expense.is_overdue ? 'bg-orange-50/50' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{catConfig.icon}</span>
                          <div>
                            <Link href={`/expenses/${expense.id}`} className="text-sm font-medium text-gray-900 hover:text-[#647C47]">
                              {expense.expense_number}
                            </Link>
                            <p className="text-xs text-gray-500">{expense.description || catConfig.label}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-900">{expense.supplier_name || '-'}</p>
                        {expense.supplier_type && (
                          <p className="text-xs text-gray-500">{SUPPLIER_TYPES[expense.supplier_type]?.label || expense.supplier_type}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-600">{new Date(expense.expense_date).toLocaleDateString()}</p>
                        {expense.days_outstanding > 14 && (
                          <p className="text-xs text-orange-500">{expense.days_outstanding} days old</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold text-gray-900">
                          {getCurrencySymbol(expense.currency)}{Number(expense.amount).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(expense.status)}`}>
                          {expense.status === 'pending' ? 'Pending' : 'Approved'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getAgingColor(expense.aging_bucket)}`}>
                          {getAgingLabel(expense.aging_bucket)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {expense.status === 'pending' && (
                            <button
                              onClick={() => handleApprove(expense)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Approve"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                          )}
                          {expense.status === 'approved' && (
                            <button
                              onClick={() => handleMarkAsPaid(expense)}
                              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                              title="Mark as Paid"
                            >
                              <Wallet className="h-4 w-4" />
                            </button>
                          )}
                          <Link
                            href={`/expenses/${expense.id}`}
                            className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-gray-100 rounded transition-colors"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
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

      {/* Payment History View */}
      {viewMode === 'payments' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Expense</th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Supplier</th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Payment Date</th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Method</th>
                <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Amount</th>
                <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(paginatedData as Expense[]).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                    No recent payments
                  </td>
                </tr>
              ) : (
                (paginatedData as Expense[]).map((expense) => {
                  const catConfig = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.other
                  return (
                    <tr key={expense.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{catConfig.icon}</span>
                          <div>
                            <Link href={`/expenses/${expense.id}`} className="text-sm font-medium text-gray-900 hover:text-[#647C47]">
                              {expense.expense_number}
                            </Link>
                            <p className="text-xs text-gray-500">{expense.description || catConfig.label}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-900">{expense.supplier_name || '-'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-600">
                          {expense.payment_date ? new Date(expense.payment_date).toLocaleDateString() : '-'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-600 capitalize">
                          {expense.payment_method?.replace('_', ' ') || '-'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold text-green-600">
                          {getCurrencySymbol(expense.currency)}{Number(expense.amount).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/expenses/${expense.id}`}
                          className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-gray-100 rounded transition-colors inline-block"
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, displayData.length)} of {displayData.length}
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

      {/* Footer */}
      <div className="text-center pt-4">
        <p className="text-xs text-gray-400">© 2024 Autoura Operations System</p>
      </div>
    </div>
  )
}