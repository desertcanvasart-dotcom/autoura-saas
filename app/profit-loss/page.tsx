'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getCurrencySymbol } from '@/lib/currency'
import { 
  Search,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  ChevronLeft,
  ChevronRight,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Eye,
  BarChart3,
  PieChart,
  Calendar,
  AlertTriangle
} from 'lucide-react'

interface FxSummary {
  same_currency: number
  historical: number
  live: number
  unconverted: number
  all_historical: boolean
}

interface FxHole {
  kind: string
  reference: string
  amount: number
  fromCurrency: string
  toCurrency: string
  date: string | null
  message: string
}

interface TripPnL {
  itinerary_id: string
  itinerary_code: string
  trip_name: string
  client_name: string
  start_date: string
  end_date: string
  status: string
  currency: string
  quoted_amount: number
  total_revenue: number
  total_paid: number
  total_expenses: number
  expenses_paid: number
  expenses_pending: number
  commissions_receivable: number
  commissions_payable: number
  net_commission: number
  disputed_receivable: number
  commission_breakdown: Record<string, { receivable: number; payable: number }>
  gross_profit: number
  profit_margin: number
  expense_breakdown: Record<string, number>
  invoice_count: number
  expense_count: number
  commission_count: number
  fx: FxSummary
  complete: boolean
  holes: FxHole[]
}

interface Summary {
  total_trips: number
  reporting_currency: string
  total_revenue: number
  total_expenses: number
  total_commissions_receivable: number
  total_commissions_payable: number
  total_disputed_receivable: number
  total_profit: number
  average_margin: number
  profitable_trips: number
  loss_trips: number
  incomplete_trips: number
  untranslated_trips: number
  fx: FxSummary
}

interface PnlMeta {
  reporting_currency: string
  fx_history_available: boolean
  snapshot_count: number
  commissions_available: boolean
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: 'text-gray-600', bg: 'bg-gray-100' },
  sent: { label: 'Sent', color: 'text-blue-600', bg: 'bg-blue-100' },
  confirmed: { label: 'Confirmed', color: 'text-green-600', bg: 'bg-green-100' },
  completed: { label: 'Completed', color: 'text-purple-600', bg: 'bg-purple-100' },
  cancelled: { label: 'Cancelled', color: 'text-red-600', bg: 'bg-red-100' }
}

const CATEGORY_LABELS: Record<string, string> = {
  guide: 'Tour Guide',
  driver: 'Driver',
  hotel: 'Hotel',
  transportation: 'Transportation',
  entrance: 'Entrance Fees',
  meal: 'Meals',
  airport_staff: 'Airport Staff',
  hotel_staff: 'Hotel Staff',
  ground_handler: 'Ground Handler',
  tipping: 'Tipping',
  permits: 'Permits',
  toll: 'Toll Fees',
  parking: 'Parking',
  fuel: 'Fuel',
  other: 'Other'
}

const ITEMS_PER_PAGE = 15

export default function ProfitLossPage() {
  const [data, setData] = useState<TripPnL[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [meta, setMeta] = useState<PnlMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<'profit_margin' | 'gross_profit' | 'start_date'>('start_date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (startDate) params.append('startDate', startDate)
      if (endDate) params.append('endDate', endDate)

      const response = await fetch(`/api/profit-loss?${params}`)
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setData(result.data)
          setSummary(result.summary)
          setMeta(result.meta || null)
        }
      }
    } catch (error) {
      console.error('Error fetching P&L data:', error)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, startDate, endDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter, startDate, endDate, sortField, sortOrder])

  const filteredData = data
    .filter(trip => {
      const matchesSearch = 
        trip.itinerary_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.trip_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.client_name?.toLowerCase().includes(searchTerm.toLowerCase())
      return matchesSearch
    })
    .sort((a, b) => {
      let aVal: number, bVal: number
      switch (sortField) {
        case 'profit_margin':
          aVal = a.profit_margin
          bVal = b.profit_margin
          break
        case 'gross_profit':
          aVal = a.gross_profit
          bVal = b.gross_profit
          break
        case 'start_date':
        default:
          aVal = new Date(a.start_date).getTime()
          bVal = new Date(b.start_date).getTime()
      }
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
    })

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE)
  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )


  const getProfitColor = (profit: number) => {
    if (profit > 0) return 'text-green-600'
    if (profit < 0) return 'text-red-600'
    return 'text-gray-600'
  }

  const getProfitBg = (profit: number) => {
    if (profit > 0) return 'bg-green-50'
    if (profit < 0) return 'bg-red-50'
    return 'bg-gray-50'
  }

  const getMarginColor = (margin: number) => {
    if (margin >= 30) return 'text-green-600 bg-green-100'
    if (margin >= 15) return 'text-yellow-600 bg-yellow-100'
    if (margin >= 0) return 'text-orange-600 bg-orange-100'
    return 'text-red-600 bg-red-100'
  }

  const clearFilters = () => {
    setSearchTerm('')
    setStatusFilter('')
    setStartDate('')
    setEndDate('')
  }

  const hasActiveFilters = statusFilter || startDate || endDate

  // Summary figures are stated in one reporting currency; per-trip figures
  // stay in the trip's own currency.
  const reportingSymbol = getCurrencySymbol(summary?.reporting_currency || 'EUR')
  const netCommissionTotal = summary
    ? summary.total_commissions_receivable - summary.total_commissions_payable
    : 0
  const hasFxCaveat = Boolean(
    summary &&
    (summary.fx.live > 0 ||
      summary.fx.unconverted > 0 ||
      summary.untranslated_trips > 0 ||
      (meta && !meta.commissions_available))
  )

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
            📊
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Profit & Loss</h1>
            <p className="text-sm text-gray-500">Trip profitability analysis</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🎯</span>
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
              </div>
              <p className="text-xs text-gray-500 mb-1">Total Trips</p>
              <p className="text-2xl font-semibold text-gray-900">{summary.total_trips}</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">💰</span>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              </div>
              <p className="text-xs text-gray-500 mb-1">Total Revenue</p>
              <p className="text-2xl font-semibold text-blue-600">
                {reportingSymbol}{summary.total_revenue.toLocaleString()}
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">💸</span>
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
              </div>
              <p className="text-xs text-gray-500 mb-1">Total Expenses</p>
              <p className="text-2xl font-semibold text-red-600">
                {reportingSymbol}{summary.total_expenses.toLocaleString()}
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🤝</span>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              </div>
              <p className="text-xs text-gray-500 mb-1">Net Commission</p>
              <p className={`text-2xl font-semibold ${getProfitColor(netCommissionTotal)}`}>
                {netCommissionTotal >= 0 ? '+' : '−'}{reportingSymbol}
                {Math.abs(netCommissionTotal).toLocaleString()}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                in {reportingSymbol}{summary.total_commissions_receivable.toLocaleString()} · out{' '}
                {reportingSymbol}{summary.total_commissions_payable.toLocaleString()}
              </p>
              {summary.total_disputed_receivable > 0 && (
                <p
                  className="text-[11px] text-amber-600 mt-0.5"
                  title="Disputed receivable commission may never be collected, so it is deliberately left out of margin."
                >
                  {reportingSymbol}{summary.total_disputed_receivable.toLocaleString()} disputed,
                  not in margin
                </p>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">📈</span>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              </div>
              <p className="text-xs text-gray-500 mb-1">Gross Profit</p>
              <p className={`text-2xl font-semibold ${getProfitColor(summary.total_profit)}`}>
                {reportingSymbol}{summary.total_profit.toLocaleString()}
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">📊</span>
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
              </div>
              <p className="text-xs text-gray-500 mb-1">Avg Margin</p>
              <p className="text-2xl font-semibold text-purple-600">{summary.average_margin.toFixed(1)}%</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">✅</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              </div>
              <p className="text-xs text-gray-500 mb-1">Profitable</p>
              <p className="text-2xl font-semibold text-emerald-600">{summary.profitable_trips}</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">⚠️</span>
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
              </div>
              <p className="text-xs text-gray-500 mb-1">Loss-Making</p>
              <p className="text-2xl font-semibold text-orange-600">{summary.loss_trips}</p>
            </div>
          </div>

          {/* Provenance: say plainly which figures are exact and which are not */}
          {(hasFxCaveat || summary.incomplete_trips > 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-900 space-y-1">
                  <p className="font-medium">
                    These totals are shown in {summary.reporting_currency} and are not fully exact.
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-800 text-xs">
                    {summary.fx.live > 0 && (
                      <li>
                        {summary.fx.live} amount{summary.fx.live > 1 ? 's were' : ' was'} converted at
                        today&apos;s rate because no exchange rate was on file for the transaction date.
                        {meta && !meta.fx_history_available &&
                          ' Rate history starts building from the next exchange-rate refresh.'}
                      </li>
                    )}
                    {summary.fx.unconverted > 0 && (
                      <li>
                        {summary.fx.unconverted} amount{summary.fx.unconverted > 1 ? 's are' : ' is'} missing
                        from these totals entirely — no exchange rate is available for them, so the
                        margin shown is <strong>better than reality</strong>.
                      </li>
                    )}
                    {summary.untranslated_trips > 0 && (
                      <li>
                        {summary.untranslated_trips} trip{summary.untranslated_trips > 1 ? 's' : ''} could not
                        be expressed in {summary.reporting_currency} and {summary.untranslated_trips > 1 ? 'are' : 'is'} excluded
                        from the totals above.
                      </li>
                    )}
                    {meta && !meta.commissions_available && (
                      <li>Commissions could not be read, so they are not reflected in these margins.</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search trips..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47]"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as any)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
          >
            <option value="start_date">Sort by Date</option>
            <option value="gross_profit">Sort by Profit</option>
            <option value="profit_margin">Sort by Margin</option>
          </select>

          <button
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"
            title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortOrder === 'asc' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
          </button>

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
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Trip Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
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

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Trip</th>
              <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Date</th>
              <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Revenue</th>
              <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Expenses</th>
              <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Commission</th>
              <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Profit</th>
              <th className="text-center text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Margin</th>
              <th className="text-center text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Status</th>
              <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                  No trips found
                </td>
              </tr>
            ) : (
              paginatedData.map((trip) => {
                const statusConfig = STATUS_CONFIG[trip.status] || STATUS_CONFIG.draft
                const revenue = trip.total_revenue > 0 ? trip.total_revenue : trip.quoted_amount
                return (
                  <tr key={trip.itinerary_id} className={`hover:bg-gray-50 ${getProfitBg(trip.gross_profit)}`}>
                    <td className="px-4 py-3">
                      <div>
                        <Link 
                          href={`/profit-loss/${trip.itinerary_id}`}
                          className="text-sm font-medium text-gray-900 hover:text-[#647C47]"
                        >
                          {trip.itinerary_code}
                        </Link>
                        <p className="text-xs text-gray-500 truncate max-w-[200px]">{trip.client_name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-600">
                        {new Date(trip.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      <div className="text-xs text-gray-400">
                        {trip.end_date && `to ${new Date(trip.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {getCurrencySymbol(trip.currency)}{revenue.toLocaleString()}
                      </div>
                      {trip.invoice_count > 0 && (
                        <div className="text-xs text-gray-500">
                          {trip.invoice_count} invoice{trip.invoice_count > 1 ? 's' : ''}
                        </div>
                      )}
                      {trip.total_revenue === 0 && (
                        <div className="text-xs text-gray-400 italic">quoted</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {getCurrencySymbol(trip.currency)}{trip.total_expenses.toLocaleString()}
                      </div>
                      {trip.expense_count > 0 && (
                        <div className="text-xs text-gray-500">
                          {trip.expense_count} expense{trip.expense_count > 1 ? 's' : ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {trip.commission_count === 0 ? (
                        <span className="text-sm text-gray-300">—</span>
                      ) : (
                        <>
                          <div
                            className={`text-sm font-medium ${
                              trip.net_commission >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {trip.net_commission >= 0 ? '+' : '−'}
                            {getCurrencySymbol(trip.currency)}
                            {Math.abs(trip.net_commission).toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-500">
                            {trip.commission_count} record{trip.commission_count > 1 ? 's' : ''}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className={`text-sm font-semibold ${getProfitColor(trip.gross_profit)}`}>
                        {trip.gross_profit >= 0 ? '+' : ''}{getCurrencySymbol(trip.currency)}{trip.gross_profit.toLocaleString()}
                      </div>
                      {!trip.complete && (
                        <div
                          className="inline-flex items-center gap-1 text-xs text-amber-700 mt-0.5"
                          title={trip.holes.map(h => h.message).join('\n')}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {trip.holes.length} cost{trip.holes.length > 1 ? 's' : ''} not converted
                        </div>
                      )}
                      {trip.complete && trip.fx.live > 0 && (
                        <div
                          className="text-xs text-gray-400 mt-0.5"
                          title="No exchange rate was on file for the transaction date, so today's rate was used."
                        >
                          today&apos;s FX rate
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getMarginColor(trip.profit_margin)}`}>
                        {trip.profit_margin >= 0 ? '+' : ''}{trip.profit_margin.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                        {statusConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/profit-loss/${trip.itinerary_id}`}
                          className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-gray-100 rounded transition-colors"
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <Link
                          href={`/itineraries/${trip.itinerary_id}`}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="View Itinerary"
                        >
                          <Calendar className="h-4 w-4" />
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)} of {filteredData.length} trips
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
        <p className="text-xs text-gray-400">© {new Date().getFullYear()} Autoura Operations System</p>
      </div>
    </div>
  )
}