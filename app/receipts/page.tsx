'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Receipt, Download, Search, Eye, Calendar, User, CreditCard, Loader2 } from 'lucide-react'
import { downloadReceiptPDF } from '@/lib/receipt-pdf-generator'

interface Payment {
  id: string
  itinerary_id: string
  itinerary_code: string
  client_name: string
  client_email?: string
  payment_type: string
  amount: number
  currency: string
  payment_method: string
  payment_status: string
  transaction_reference: string
  payment_date: string
  notes: string
  created_at: string
}

export default function ReceiptsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  useEffect(() => {
    fetchPayments()
  }, [])

  const fetchPayments = async () => {
    try {
      const response = await fetch('/api/payments?status=completed')
      const data = await response.json()
      
      if (data.success) {
        // Filter only completed payments (receipts are for completed payments)
        const completedPayments = (data.data || []).filter(
          (p: Payment) => p.payment_status === 'completed'
        )
        setPayments(completedPayments)
      }
    } catch (error) {
      console.error('Error fetching payments:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadReceipt = async (payment: Payment) => {
    setDownloadingId(payment.id)
    
    try {
      downloadReceiptPDF({
        receiptNumber: payment.transaction_reference || `RCP-${payment.id.slice(0, 8).toUpperCase()}`,
        invoiceNumber: payment.itinerary_code,
        clientName: payment.client_name,
        clientEmail: payment.client_email || '',
        paymentDate: payment.payment_date || new Date().toISOString(),
        paymentMethod: payment.payment_method,
        amount: payment.amount,
        currency: payment.currency,
        transactionRef: payment.transaction_reference,
        notes: payment.notes
      }, {
        invoice_number: payment.itinerary_code,
        client_name: payment.client_name,
        total_amount: payment.amount,
        currency: payment.currency
      })
    } catch (error) {
      console.error('Error downloading receipt:', error)
      alert('Failed to download receipt')
    } finally {
      setDownloadingId(null)
    }
  }

  const filteredPayments = payments.filter(payment => {
    const search = searchTerm.toLowerCase()
    return (
      payment.client_name?.toLowerCase().includes(search) ||
      payment.itinerary_code?.toLowerCase().includes(search) ||
      payment.transaction_reference?.toLowerCase().includes(search)
    )
  })

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  const formatCurrency = (amount: number, currency: string) => {
    const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', EGP: 'E£' }
    return `${symbols[currency] || currency} ${amount.toFixed(2)}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading receipts...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="w-6 h-6 text-primary-600" />
              Receipts
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Download receipts for completed payments
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by client name, itinerary code, or transaction reference..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </div>

        {/* Receipts List */}
        {filteredPayments.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
            <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Receipts Found</h3>
            <p className="text-sm text-gray-600">
              {searchTerm 
                ? 'No receipts match your search criteria.' 
                : 'Completed payments will appear here with downloadable receipts.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Receipt #</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Itinerary</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Method</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Amount</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPayments.map((payment) => {
                  const receiptNumber = payment.transaction_reference || `RCP-${payment.id.slice(0, 8).toUpperCase()}`
                  const isDownloading = downloadingId === payment.id
                  
                  return (
                    <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono font-medium text-gray-900">
                          {receiptNumber}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-900">{payment.client_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link 
                          href={`/itineraries/${payment.itinerary_id}`}
                          className="text-sm font-mono text-primary-600 hover:text-primary-700"
                        >
                          {payment.itinerary_code}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-700">{formatDate(payment.payment_date)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-700 capitalize">
                            {payment.payment_method?.replace('_', ' ')}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold text-gray-900">
                          {formatCurrency(payment.amount, payment.currency)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/documents/receipt/${payment.id}`}
                            className="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            title="View Receipt"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => handleDownloadReceipt(payment)}
                            disabled={isDownloading}
                            className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Download PDF"
                          >
                            {isDownloading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary */}
        {filteredPayments.length > 0 && (
          <div className="mt-4 text-sm text-gray-600 text-right">
            Showing {filteredPayments.length} receipt{filteredPayments.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}