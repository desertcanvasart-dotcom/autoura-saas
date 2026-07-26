'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  FileText,
  Calendar,
  User,
  MapPin,
  ExternalLink,
  Plus,
  Handshake,
  AlertTriangle
} from 'lucide-react'

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
  commission_breakdown: Record<string, { receivable: number; payable: number }>
  gross_profit: number
  profit_margin: number
  expense_breakdown: Record<string, number>
  invoice_count: number
  expense_count: number
  commission_count: number
  fx: {
    same_currency: number
    historical: number
    live: number
    unconverted: number
    all_historical: boolean
  }
  complete: boolean
  holes: Array<{
    kind: string
    reference: string
    amount: number
    fromCurrency: string
    toCurrency: string
    date: string | null
    message: string
  }>
}

interface Invoice {
  id: string
  invoice_number: string
  total_amount: number
  amount_paid: number
  status: string
  issue_date: string
}

interface Expense {
  id: string
  expense_number: string
  category: string
  description: string
  amount: number
  status: string
  expense_date: string
  supplier_name: string
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  guide: { label: 'Tour Guide', icon: '👨‍🏫', color: 'bg-blue-100 text-blue-700' },
  driver: { label: 'Driver', icon: '🚗', color: 'bg-purple-100 text-purple-700' },
  hotel: { label: 'Hotel', icon: '🏨', color: 'bg-indigo-100 text-indigo-700' },
  transportation: { label: 'Transportation', icon: '🚐', color: 'bg-cyan-100 text-cyan-700' },
  entrance: { label: 'Entrance Fees', icon: '🎫', color: 'bg-pink-100 text-pink-700' },
  meal: { label: 'Meals', icon: '🍽️', color: 'bg-orange-100 text-orange-700' },
  airport_staff: { label: 'Airport Staff', icon: '✈️', color: 'bg-sky-100 text-sky-700' },
  hotel_staff: { label: 'Hotel Staff', icon: '🛎️', color: 'bg-violet-100 text-violet-700' },
  ground_handler: { label: 'Ground Handler', icon: '🧳', color: 'bg-teal-100 text-teal-700' },
  tipping: { label: 'Tipping', icon: '💵', color: 'bg-green-100 text-green-700' },
  permits: { label: 'Permits', icon: '📋', color: 'bg-amber-100 text-amber-700' },
  toll: { label: 'Toll Fees', icon: '🛣️', color: 'bg-stone-100 text-stone-700' },
  parking: { label: 'Parking', icon: '🅿️', color: 'bg-slate-100 text-slate-700' },
  fuel: { label: 'Fuel', icon: '⛽', color: 'bg-red-100 text-red-700' },
  other: { label: 'Other', icon: '📦', color: 'bg-gray-100 text-gray-700' }
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: 'text-gray-600', bg: 'bg-gray-100' },
  sent: { label: 'Sent', color: 'text-blue-600', bg: 'bg-blue-100' },
  confirmed: { label: 'Confirmed', color: 'text-green-600', bg: 'bg-green-100' },
  completed: { label: 'Completed', color: 'text-purple-600', bg: 'bg-purple-100' },
  cancelled: { label: 'Cancelled', color: 'text-red-600', bg: 'bg-red-100' },
  pending: { label: 'Pending', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  approved: { label: 'Approved', color: 'text-blue-600', bg: 'bg-blue-100' },
  paid: { label: 'Paid', color: 'text-green-600', bg: 'bg-green-100' },
  partial: { label: 'Partial', color: 'text-orange-600', bg: 'bg-orange-100' }
}

export default function TripPnLDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [pnlData, setPnlData] = useState<TripPnL | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [resolvedParams.id])

  const fetchData = async () => {
    try {
      // Fetch P&L data for this itinerary
      const pnlResponse = await fetch(`/api/profit-loss?itineraryId=${resolvedParams.id}`)
      if (pnlResponse.ok) {
        const pnlResult = await pnlResponse.json()
        if (pnlResult.success && pnlResult.data.length > 0) {
          setPnlData(pnlResult.data[0])
        }
      }

      // Fetch invoices for this itinerary
      const invoicesResponse = await fetch(`/api/invoices?itineraryId=${resolvedParams.id}`)
      if (invoicesResponse.ok) {
        const invoicesData = await invoicesResponse.json()
        setInvoices(Array.isArray(invoicesData) ? invoicesData : [])
      }

      // Fetch expenses for this itinerary
      const expensesResponse = await fetch(`/api/expenses?itineraryId=${resolvedParams.id}`)
      if (expensesResponse.ok) {
        const expensesData = await expensesResponse.json()
        setExpenses(Array.isArray(expensesData) ? expensesData : [])
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getCurrencySymbol = (currency: string) => {
    const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', EGP: 'E£' }
    return symbols[currency] || currency
  }

  const getProfitColor = (profit: number) => {
    if (profit > 0) return 'text-green-600'
    if (profit < 0) return 'text-red-600'
    return 'text-gray-600'
  }

  const getMarginColor = (margin: number) => {
    if (margin >= 30) return 'text-green-600 bg-green-100'
    if (margin >= 15) return 'text-yellow-600 bg-yellow-100'
    if (margin >= 0) return 'text-orange-600 bg-orange-100'
    return 'text-red-600 bg-red-100'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
      </div>
    )
  }

  if (!pnlData) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Trip not found</p>
        <Link href="/profit-loss" className="text-[#647C47] hover:underline mt-2 inline-block">
          Back to Profit & Loss
        </Link>
      </div>
    )
  }

  const revenue = pnlData.total_revenue > 0 ? pnlData.total_revenue : pnlData.quoted_amount
  const sortedBreakdown = Object.entries(pnlData.expense_breakdown)
    .sort(([, a], [, b]) => b - a)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/profit-loss"
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-gray-900">{pnlData.itinerary_code}</h1>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CONFIG[pnlData.status]?.bg || 'bg-gray-100'} ${STATUS_CONFIG[pnlData.status]?.color || 'text-gray-600'}`}>
                {STATUS_CONFIG[pnlData.status]?.label || pnlData.status}
              </span>
            </div>
            <p className="text-sm text-gray-500">{pnlData.client_name} • {pnlData.trip_name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/itineraries/${pnlData.itinerary_id}`}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Calendar className="h-4 w-4" />
            View Itinerary
          </Link>
          <Link
            href={`/expenses?itineraryId=${pnlData.itinerary_id}`}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Expense
          </Link>
        </div>
      </div>

      {/* Main P&L Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
          {/* Revenue */}
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-center gap-2 mb-2">
              <DollarSign className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-600">Revenue</span>
            </div>
            <p className="text-2xl font-bold text-blue-700">
              {getCurrencySymbol(pnlData.currency)}{revenue.toLocaleString()}
            </p>
            {pnlData.total_revenue === 0 && (
              <p className="text-xs text-blue-500 mt-1">Quoted amount</p>
            )}
            {pnlData.total_paid > 0 && pnlData.total_paid < revenue && (
              <p className="text-xs text-blue-500 mt-1">
                {getCurrencySymbol(pnlData.currency)}{pnlData.total_paid.toLocaleString()} paid
              </p>
            )}
          </div>

          {/* Minus */}
          <div className="flex items-center justify-center text-2xl text-gray-400">
            −
          </div>

          {/* Expenses */}
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Receipt className="h-5 w-5 text-red-600" />
              <span className="text-sm font-medium text-red-600">Expenses</span>
            </div>
            <p className="text-2xl font-bold text-red-700">
              {getCurrencySymbol(pnlData.currency)}{pnlData.total_expenses.toLocaleString()}
            </p>
            {pnlData.expenses_pending > 0 && (
              <p className="text-xs text-red-500 mt-1">
                {getCurrencySymbol(pnlData.currency)}{pnlData.expenses_pending.toLocaleString()} pending
              </p>
            )}
          </div>

          {/* Commission operator — sign follows the net direction, so the
              equation on screen always reconciles with the profit figure. */}
          <div className="flex items-center justify-center text-2xl text-gray-400">
            {pnlData.net_commission >= 0 ? '+' : '−'}
          </div>

          {/* Commission */}
          <div className="text-center p-4 bg-amber-50 rounded-lg">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Handshake className="h-5 w-5 text-amber-600" />
              <span className="text-sm font-medium text-amber-600">Commission</span>
            </div>
            <p className="text-2xl font-bold text-amber-700">
              {getCurrencySymbol(pnlData.currency)}
              {Math.abs(pnlData.net_commission).toLocaleString()}
            </p>
            {pnlData.commission_count > 0 ? (
              <p className="text-xs text-amber-600 mt-1">
                {pnlData.commissions_receivable > 0 && (
                  <>in {getCurrencySymbol(pnlData.currency)}{pnlData.commissions_receivable.toLocaleString()}</>
                )}
                {pnlData.commissions_receivable > 0 && pnlData.commissions_payable > 0 && ' · '}
                {pnlData.commissions_payable > 0 && (
                  <>out {getCurrencySymbol(pnlData.currency)}{pnlData.commissions_payable.toLocaleString()}</>
                )}
              </p>
            ) : (
              <p className="text-xs text-amber-500 mt-1">None recorded</p>
            )}
          </div>

          {/* Equals */}
          <div className="flex items-center justify-center text-2xl text-gray-400">
            =
          </div>

          {/* Profit */}
          <div className={`text-center p-4 rounded-lg ${pnlData.gross_profit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="flex items-center justify-center gap-2 mb-2">
              {pnlData.gross_profit >= 0 ? (
                <TrendingUp className="h-5 w-5 text-green-600" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-600" />
              )}
              <span className={`text-sm font-medium ${getProfitColor(pnlData.gross_profit)}`}>
                {pnlData.gross_profit >= 0 ? 'Profit' : 'Loss'}
              </span>
            </div>
            <p className={`text-2xl font-bold ${getProfitColor(pnlData.gross_profit)}`}>
              {pnlData.gross_profit >= 0 ? '+' : ''}{getCurrencySymbol(pnlData.currency)}{pnlData.gross_profit.toLocaleString()}
            </p>
            <p className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-medium ${getMarginColor(pnlData.profit_margin)}`}>
              {pnlData.profit_margin >= 0 ? '+' : ''}{pnlData.profit_margin.toFixed(1)}% margin
            </p>
          </div>
        </div>
      </div>

      {/* Provenance — how exact is the number above? */}
      {(!pnlData.complete || pnlData.fx.live > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-900">
              {!pnlData.complete ? (
                <>
                  <p className="font-medium mb-1">
                    This margin is incomplete — {pnlData.holes.length} amount
                    {pnlData.holes.length > 1 ? 's are' : ' is'} missing from it.
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 text-xs text-amber-800">
                    {pnlData.holes.map((hole, i) => (
                      <li key={`${hole.reference}-${i}`}>{hole.message}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>
                  {pnlData.fx.live} amount{pnlData.fx.live > 1 ? 's were' : ' was'} converted at
                  today&apos;s exchange rate because no rate was on file for the transaction date.
                  The real margin may differ.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expense Breakdown */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Expense Breakdown</h3>
            <span className="text-xs text-gray-500">{expenses.length} expenses</span>
          </div>

          {sortedBreakdown.length === 0 ? (
            <div className="text-center py-8">
              <Receipt className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No expenses recorded</p>
              <Link
                href={`/expenses?itineraryId=${pnlData.itinerary_id}`}
                className="text-sm text-[#647C47] hover:underline mt-2 inline-block"
              >
                Add expenses
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedBreakdown.map(([category, amount]) => {
                const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other
                const percentage = pnlData.total_expenses > 0 ? (amount / pnlData.total_expenses) * 100 : 0
                return (
                  <div key={category}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="flex items-center gap-2">
                        <span>{config.icon}</span>
                        <span className="text-gray-700">{config.label}</span>
                      </div>
                      <span className="font-medium text-gray-900">
                        {getCurrencySymbol(pnlData.currency)}{amount.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#647C47] rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{percentage.toFixed(1)}%</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent Expenses */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Expenses</h3>
            <Link
              href={`/expenses?itineraryId=${pnlData.itinerary_id}`}
              className="text-xs text-[#647C47] hover:underline"
            >
              View all
            </Link>
          </div>

          {expenses.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">No expenses</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {expenses.slice(0, 10).map(expense => {
                const config = CATEGORY_CONFIG[expense.category] || CATEGORY_CONFIG.other
                const statusConfig = STATUS_CONFIG[expense.status] || STATUS_CONFIG.pending
                return (
                  <Link
                    key={expense.id}
                    href={`/expenses/${expense.id}`}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{config.icon}</span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{expense.expense_number}</p>
                        <p className="text-xs text-gray-500">
                          {expense.description || config.label}
                          {expense.supplier_name && ` • ${expense.supplier_name}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">
                        {getCurrencySymbol(pnlData.currency)}{Number(expense.amount).toLocaleString()}
                      </p>
                      <span className={`text-xs ${statusConfig.color}`}>{statusConfig.label}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Invoices */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Invoices</h3>
            <span className="text-xs text-gray-500">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</span>
          </div>

          {invoices.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No invoices created</p>
              <Link
                href={`/itineraries/${pnlData.itinerary_id}`}
                className="text-sm text-[#647C47] hover:underline mt-2 inline-block"
              >
                Create invoice
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map(invoice => {
                const statusConfig = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.draft
                return (
                  <Link
                    key={invoice.id}
                    href={`/invoices/${invoice.id}`}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{invoice.invoice_number}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(invoice.issue_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">
                        {getCurrencySymbol(pnlData.currency)}{Number(invoice.total_amount).toLocaleString()}
                      </p>
                      <span className={`text-xs ${statusConfig.color}`}>{statusConfig.label}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Trip Info */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Trip Details</h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <User className="h-4 w-4 text-gray-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Client</p>
                <p className="text-sm font-medium text-gray-900">{pnlData.client_name}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <MapPin className="h-4 w-4 text-gray-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Trip</p>
                <p className="text-sm font-medium text-gray-900">{pnlData.trip_name}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Calendar className="h-4 w-4 text-gray-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Dates</p>
                <p className="text-sm font-medium text-gray-900">
                  {new Date(pnlData.start_date).toLocaleDateString()} - {new Date(pnlData.end_date).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <DollarSign className="h-4 w-4 text-gray-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Quoted Amount</p>
                <p className="text-sm font-medium text-gray-900">
                  {getCurrencySymbol(pnlData.currency)}{pnlData.quoted_amount.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}