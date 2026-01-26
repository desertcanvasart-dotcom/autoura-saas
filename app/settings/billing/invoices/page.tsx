'use client'

import { useState, useEffect } from 'react'
import { useTenant } from '@/app/contexts/TenantContext'
import Link from 'next/link'
import {
  ArrowLeft,
  FileText,
  Download,
  ExternalLink,
  AlertCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  CreditCard,
} from 'lucide-react'

interface Invoice {
  id: string
  stripe_invoice_id: string
  subscription_id: string
  amount_due: number
  amount_paid: number
  currency: string
  status: string
  invoice_date: string
  due_date: string | null
  paid_at: string | null
  invoice_pdf: string | null
  hosted_invoice_url: string | null
}

export default function BillingInvoicesPage() {
  const { tenant, tenantMember, isAdmin } = useTenant()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'paid' | 'open' | 'void'>('all')

  useEffect(() => {
    if (tenant) {
      fetchInvoices()
    }
  }, [tenant, filter])

  const fetchInvoices = async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (filter !== 'all') {
        params.set('status', filter)
      }

      const response = await fetch(`/api/billing/invoices?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setInvoices(data.invoices || [])
      } else {
        setError(data.error || 'Failed to load invoices')
      }
    } catch (err: any) {
      console.error('Error fetching invoices:', err)
      setError('Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 border border-green-200 rounded-md text-xs font-medium">
            <CheckCircle2 className="w-3 h-3" />
            Paid
          </span>
        )
      case 'open':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 border border-blue-200 rounded-md text-xs font-medium">
            <Clock className="w-3 h-3" />
            Open
          </span>
        )
      case 'void':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-800 border border-gray-200 rounded-md text-xs font-medium">
            <XCircle className="w-3 h-3" />
            Void
          </span>
        )
      case 'uncollectible':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 border border-red-200 rounded-md text-xs font-medium">
            <XCircle className="w-3 h-3" />
            Uncollectible
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-800 border border-gray-200 rounded-md text-xs font-medium">
            {status}
          </span>
        )
    }
  }

  const formatAmount = (amount: number, currency: string) => {
    const symbol = currency === 'eur' ? '€' : currency === 'usd' ? '$' : currency.toUpperCase()
    return `${symbol}${(amount / 100).toFixed(2)}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  // Only show access denied AFTER we've confirmed the user's role is loaded
  if (tenantMember && !isAdmin) {
    return (
      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-900">Access Denied</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Only owners and admins can access invoice information.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <Link
            href="/settings/billing"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Billing
          </Link>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <FileText className="w-7 h-7 text-blue-600" />
                Invoice History
              </h1>
              <p className="text-gray-600 mt-1">
                View and download your billing invoices
              </p>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="bg-white border border-gray-200 rounded-lg p-1 inline-flex gap-1">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            All Invoices
          </button>
          <button
            onClick={() => setFilter('paid')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filter === 'paid'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Paid
          </button>
          <button
            onClick={() => setFilter('open')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filter === 'open'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Open
          </button>
          <button
            onClick={() => setFilter('void')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filter === 'void'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Void
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Invoices List */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
              <p className="text-sm text-gray-600 mt-2">Loading invoices...</p>
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No invoices found</p>
              <p className="text-sm text-gray-500 mt-1">
                Invoices will appear here once you have a subscription
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                            <FileText className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              Invoice #{invoice.stripe_invoice_id.slice(-8)}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatDate(invoice.invoice_date)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(invoice.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {formatAmount(invoice.amount_paid || invoice.amount_due, invoice.currency)}
                          </p>
                          {invoice.status === 'paid' && invoice.paid_at && (
                            <p className="text-xs text-gray-500">
                              Paid {formatDate(invoice.paid_at)}
                            </p>
                          )}
                          {invoice.status === 'open' && invoice.due_date && (
                            <p className="text-xs text-gray-500">
                              Due {formatDate(invoice.due_date)}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          {formatDate(invoice.invoice_date)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          {invoice.invoice_pdf && (
                            <a
                              href={invoice.invoice_pdf}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          )}
                          {invoice.hosted_invoice_url && (
                            <a
                              href={invoice.hosted_invoice_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                              title="View online"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        {invoices.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {invoices.filter((inv) => inv.status === 'paid').length}
                  </p>
                  <p className="text-sm text-gray-600">Paid Invoices</p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {invoices.filter((inv) => inv.status === 'open').length}
                  </p>
                  <p className="text-sm text-gray-600">Open Invoices</p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatAmount(
                      invoices
                        .filter((inv) => inv.status === 'paid')
                        .reduce((sum, inv) => sum + inv.amount_paid, 0),
                      invoices[0]?.currency || 'eur'
                    )}
                  </p>
                  <p className="text-sm text-gray-600">Total Paid</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
