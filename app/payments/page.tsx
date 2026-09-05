'use client'

import { useEffect, useState } from 'react'
import { sumByCurrency, addToTotals, formatTotals, type CurrencyTotals } from '@/lib/currency-totals'
import { 
  DollarSign, 
  TrendingUp, 
  Clock,
  CheckCircle,
  AlertCircle,
  FileText,
  ExternalLink,
  Plus,
  MapPin
} from 'lucide-react'
import Link from 'next/link'
import { getCurrencySymbol } from '@/lib/currency'

interface UnifiedPayment {
  id: string
  source: 'invoice' | 'itinerary'
  source_id: string
  source_reference: string
  client_name: string
  client_email?: string
  amount: number
  currency: string
  payment_method: string
  payment_date: string
  transaction_reference: string | null
  notes: string | null
  created_at: string
}

// Per-currency, not one number: money in different currencies does not add.
interface PaymentStats {
  totalReceived: CurrencyTotals
  pendingPayments: CurrencyTotals
  overduePayments: CurrencyTotals
  thisMonthRevenue: CurrencyTotals
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<UnifiedPayment[]>([])
  const [filteredPayments, setFilteredPayments] = useState<UnifiedPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<PaymentStats>({
    totalReceived: {},
    pendingPayments: {},
    overduePayments: {},
    thisMonthRevenue: {}
  })
  
  const [methodFilter, setMethodFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchAllPayments()
  }, [])

  useEffect(() => {
    filterPayments()
  }, [payments, methodFilter, sourceFilter, searchQuery])

  const fetchAllPayments = async () => {
    setLoading(true)
    try {
      // Fetch from both sources in parallel
      const [itineraryPaymentsRes, invoicesRes] = await Promise.all([
        fetch('/api/payments'),
        fetch('/api/invoices')
      ])

      const allPayments: UnifiedPayment[] = []
      const totalReceived: CurrencyTotals = {}
      const pendingPayments: CurrencyTotals = {}
      const overduePayments: CurrencyTotals = {}

      // Process itinerary payments
      if (itineraryPaymentsRes.ok) {
        const itineraryData = await itineraryPaymentsRes.json()
        const itineraryPayments = itineraryData.success ? itineraryData.data : (Array.isArray(itineraryData) ? itineraryData : [])
        
        itineraryPayments.forEach((p: any) => {
          allPayments.push({
            id: p.id,
            source: 'itinerary',
            source_id: p.itinerary_id,
            source_reference: p.itinerary_code || p.itineraries?.itinerary_code || 'N/A',
            client_name: p.client_name || p.itineraries?.client_name || 'Unknown',
            client_email: undefined,
            amount: Number(p.amount) || 0,
            currency: p.currency || 'EUR',
            payment_method: p.payment_method || 'unknown',
            payment_date: p.payment_date,
            transaction_reference: p.transaction_reference,
            notes: p.notes,
            created_at: p.created_at
          })
          addToTotals(totalReceived, p.amount, p.currency || 'EUR')
        })
      }

      // Process invoice payments
      if (invoicesRes.ok) {
        const invoices = await invoicesRes.json()
        const now = new Date()
        
        // For each invoice, fetch its payments
        for (const invoice of invoices) {
          // Track pending and overdue from invoices
          // 'partially_paid' is the real status value; the old 'partial'
          // matched nothing, silently excluding every part-paid invoice.
          // 'overdue' was also missing from the pending total.
          if (['sent', 'viewed', 'partially_paid', 'overdue'].includes(invoice.status)) {
            addToTotals(pendingPayments, invoice.balance_due, invoice.currency || 'EUR')
          }
          
          if (invoice.status !== 'paid' && invoice.status !== 'cancelled' && invoice.due_date) {
            const dueDate = new Date(invoice.due_date)
            if (dueDate < now && Number(invoice.balance_due) > 0) {
              addToTotals(overduePayments, invoice.balance_due, invoice.currency || 'EUR')
            }
          }

          // Fetch payments for this invoice
          try {
            const paymentsRes = await fetch(`/api/invoices/${invoice.id}/payments`)
            if (paymentsRes.ok) {
              const invoicePayments = await paymentsRes.json()
              
              if (Array.isArray(invoicePayments)) {
                invoicePayments.forEach((p: any) => {
                  allPayments.push({
                    id: p.id,
                    source: 'invoice',
                    source_id: invoice.id,
                    source_reference: invoice.invoice_number,
                    client_name: invoice.client_name || 'Unknown',
                    client_email: invoice.client_email,
                    amount: Number(p.amount) || 0,
                    currency: p.currency || invoice.currency || 'EUR',
                    payment_method: p.payment_method || 'unknown',
                    payment_date: p.payment_date,
                    transaction_reference: p.transaction_reference,
                    notes: p.notes,
                    created_at: p.created_at
                  })
                  addToTotals(totalReceived, p.amount, p.currency || invoice.currency || 'EUR')
                })
              }
            }
          } catch (err) {
            console.error(`Error fetching payments for invoice ${invoice.id}:`, err)
          }
        }
      }

      // Sort all payments by date (newest first)
      allPayments.sort((a, b) => {
        const dateA = new Date(a.payment_date || a.created_at)
        const dateB = new Date(b.payment_date || b.created_at)
        return dateB.getTime() - dateA.getTime()
      })

      // Calculate this month's revenue
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)
      
      const thisMonthRevenue = sumByCurrency(
        allPayments.filter(p => p.payment_date && new Date(p.payment_date) >= startOfMonth),
        p => p.amount,
        p => p.currency
      )

      setPayments(allPayments)
      setStats({
        totalReceived,
        pendingPayments,
        overduePayments,
        thisMonthRevenue
      })

    } catch (error) {
      console.error('Error fetching payments:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterPayments = () => {
    let filtered = payments

    if (methodFilter !== 'all') {
      filtered = filtered.filter(p => p.payment_method === methodFilter)
    }

    if (sourceFilter !== 'all') {
      filtered = filtered.filter(p => p.source === sourceFilter)
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(p =>
        p.client_name?.toLowerCase().includes(query) ||
        p.source_reference?.toLowerCase().includes(query) ||
        p.transaction_reference?.toLowerCase().includes(query)
      )
    }

    setFilteredPayments(filtered)
  }

  const getMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      bank_transfer: 'Bank Transfer',
      credit_card: 'Credit Card',
      cash: 'Cash',
      paypal: 'PayPal',
      wise: 'Wise',
      airwallex: 'Airwallex',
      stripe: 'Stripe',
      tab: 'Tab'
    }
    return labels[method] || method
  }


  const getSourceLink = (payment: UnifiedPayment) => {
    if (payment.source === 'invoice') {
      return `/invoices/${payment.source_id}`
    }
    return `/itineraries/${payment.source_id}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading payments...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment Tracking</h1>
          <p className="text-sm text-gray-600 mt-1">All payments from invoices and itineraries</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/payments/new"
            className="bg-primary-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-primary-700 flex items-center gap-2 font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Payment
          </Link>
          <Link
            href="/invoices"
            className="bg-gray-100 text-gray-700 px-3 py-1.5 text-sm rounded-lg hover:bg-gray-200 flex items-center gap-2 font-medium"
          >
            <FileText className="w-4 h-4" />
            View Invoices
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-gray-400" />
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          </div>
          <h3 className="text-xs text-gray-600 font-medium">Total Received</h3>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatTotals(stats.totalReceived)}
          </p>
          <p className="text-xs text-gray-500 mt-1">All time payments</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          </div>
          <h3 className="text-xs text-gray-600 font-medium">Pending Payments</h3>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatTotals(stats.pendingPayments)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Outstanding balance</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-gray-400" />
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
          </div>
          <h3 className="text-xs text-gray-600 font-medium">Overdue</h3>
          <p className="text-2xl font-bold text-red-600 mt-1">
            {formatTotals(stats.overduePayments)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Past due date</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-gray-400" />
            <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
          </div>
          <h3 className="text-xs text-gray-600 font-medium">This Month</h3>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatTotals(stats.thisMonthRevenue)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Revenue this month</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <input
            type="text"
            placeholder="Search by client, reference, or transaction..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-3 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">All Sources</option>
          <option value="invoice">Invoice Payments</option>
          <option value="itinerary">Itinerary Payments</option>
        </select>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">All Methods</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="credit_card">Credit Card</option>
          <option value="cash">Cash</option>
          <option value="paypal">PayPal</option>
          <option value="wise">Wise</option>
          <option value="airwallex">Airwallex</option>
          <option value="stripe">Stripe</option>
          <option value="tab">Tab</option>
        </select>
      </div>

      <div className="text-xs text-gray-600">
        Showing <span className="font-bold">{filteredPayments.length}</span> of {payments.length} payments
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Txn Ref</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredPayments.map((payment) => (
                <tr key={`${payment.source}-${payment.id}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {payment.payment_date 
                      ? new Date(payment.payment_date).toLocaleDateString()
                      : '-'
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                      payment.source === 'invoice' 
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      {payment.source === 'invoice' ? (
                        <FileText className="w-3 h-3" />
                      ) : (
                        <MapPin className="w-3 h-3" />
                      )}
                      {payment.source === 'invoice' ? 'Invoice' : 'Itinerary'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link 
                      href={getSourceLink(payment)}
                      className="text-sm font-mono text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {payment.source_reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{payment.client_name}</div>
                    {payment.client_email && (
                      <div className="text-xs text-gray-500">{payment.client_email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-green-600">
                      {getCurrencySymbol(payment.currency)}{payment.amount.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                      {getMethodLabel(payment.payment_method)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                    {payment.transaction_reference || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-center">
                      <Link
                        href={getSourceLink(payment)}
                        className="text-gray-400 hover:text-blue-600 transition-colors"
                        title={`View ${payment.source === 'invoice' ? 'Invoice' : 'Itinerary'}`}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredPayments.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-base font-medium text-gray-900">No payments found</p>
            <p className="mt-2 text-sm text-gray-600">
              <Link href="/payments/new" className="text-primary-600 hover:underline">
                Record your first payment
              </Link>
              {' '}or{' '}
              <Link href="/invoices" className="text-primary-600 hover:underline">
                create an invoice
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}