'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  Receipt, 
  Download, 
  Search, 
  Eye, 
  Calendar, 
  User, 
  CreditCard, 
  Loader2,
  MessageCircle,
  Check,
  FileText,
  MapPin
} from 'lucide-react'
import { downloadReceiptPDF } from '@/lib/receipt-pdf-generator'

interface UnifiedPayment {
  id: string
  source: 'invoice' | 'itinerary'
  source_id: string
  source_reference: string
  client_name: string
  client_email?: string
  client_phone?: string
  amount: number
  currency: string
  payment_method: string
  payment_date: string
  transaction_reference: string | null
  notes: string | null
  created_at: string
}

export default function ReceiptsPage() {
  const router = useRouter()
  const [payments, setPayments] = useState<UnifiedPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sentIds, setSentIds] = useState<string[]>([])

  useEffect(() => {
    fetchAllPayments()
  }, [])

  const fetchAllPayments = async () => {
    setLoading(true)
    try {
      // Fetch from both sources in parallel (same as Payments page)
      const [itineraryPaymentsRes, invoicesRes] = await Promise.all([
        fetch('/api/payments'),
        fetch('/api/invoices')
      ])

      const allPayments: UnifiedPayment[] = []

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
            client_email: p.client_email || p.itineraries?.client_email,
            client_phone: p.client_phone || p.itineraries?.client_phone,
            amount: Number(p.amount) || 0,
            currency: p.currency || 'EUR',
            payment_method: p.payment_method || 'unknown',
            payment_date: p.payment_date,
            transaction_reference: p.transaction_reference,
            notes: p.notes,
            created_at: p.created_at
          })
        })
      }

      // Process invoice payments
      if (invoicesRes.ok) {
        const invoices = await invoicesRes.json()
        
        for (const invoice of invoices) {
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
                    client_phone: invoice.client_phone,
                    amount: Number(p.amount) || 0,
                    currency: p.currency || invoice.currency || 'EUR',
                    payment_method: p.payment_method || 'unknown',
                    payment_date: p.payment_date,
                    transaction_reference: p.transaction_reference,
                    notes: p.notes,
                    created_at: p.created_at
                  })
                })
              }
            }
          } catch (err) {
            console.error(`Error fetching payments for invoice ${invoice.id}:`, err)
          }
        }
      }

      // Sort by date (newest first)
      allPayments.sort((a, b) => {
        const dateA = new Date(a.payment_date || a.created_at)
        const dateB = new Date(b.payment_date || b.created_at)
        return dateB.getTime() - dateA.getTime()
      })

      setPayments(allPayments)
    } catch (error) {
      console.error('Error fetching payments:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleViewReceipt = (payment: UnifiedPayment) => {
    // For itinerary payments, go to the receipt page
    // For invoice payments, go to the invoice page
    if (payment.source === 'itinerary') {
      router.push(`/documents/receipt/${payment.id}`)
    } else {
      router.push(`/invoices/${payment.source_id}`)
    }
  }

  const handleDownloadReceipt = async (payment: UnifiedPayment) => {
    setDownloadingId(payment.id)
    
    try {
      const receiptNumber = payment.transaction_reference || `RCP-${payment.id.slice(0, 8).toUpperCase()}`
      
      downloadReceiptPDF({
        receiptNumber,
        invoiceNumber: payment.source_reference,
        clientName: payment.client_name,
        clientEmail: payment.client_email || '',
        paymentDate: payment.payment_date || new Date().toISOString(),
        paymentMethod: payment.payment_method,
        amount: payment.amount,
        currency: payment.currency,
        transactionRef: payment.transaction_reference,
        notes: payment.notes
      }, {
        invoice_number: payment.source_reference,
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

  const handleSendWhatsApp = async (payment: UnifiedPayment) => {
    if (!payment.client_phone) {
      alert('No phone number available for this client')
      return
    }

    setSendingId(payment.id)
    
    try {
      // For itinerary payments, use the send-receipt API
      // For invoice payments, use the invoice's send functionality
      const endpoint = payment.source === 'itinerary' 
        ? '/api/whatsapp/send-receipt'
        : '/api/whatsapp/send-invoice'
      
      const body = payment.source === 'itinerary'
        ? { paymentId: payment.id }
        : { invoiceId: payment.source_id }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await response.json()

      if (data.success) {
        setSentIds(prev => [...prev, payment.id])
        setTimeout(() => {
          setSentIds(prev => prev.filter(id => id !== payment.id))
        }, 3000)
      } else {
        alert(data.error || 'Failed to send receipt')
      }
    } catch (error) {
      console.error('Error sending receipt:', error)
      alert('Failed to send receipt via WhatsApp')
    } finally {
      setSendingId(null)
    }
  }

  const filteredPayments = payments.filter(payment => {
    const search = searchTerm.toLowerCase()
    return (
      payment.client_name?.toLowerCase().includes(search) ||
      payment.source_reference?.toLowerCase().includes(search) ||
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

  // Stats
  const totalReceipts = filteredPayments.length
  const totalAmount = filteredPayments.reduce((sum, p) => sum + p.amount, 0)
  const mainCurrency = filteredPayments[0]?.currency || 'EUR'

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
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="w-6 h-6 text-primary-600" />
              Receipts
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Download and send receipts for all payments
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <FileText className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{totalReceipts}</p>
                <p className="text-xs text-gray-500">Total Receipts</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CreditCard className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalAmount, mainCurrency)}</p>
                <p className="text-xs text-gray-500">Total Received</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Check className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">100%</p>
                <p className="text-xs text-gray-500">Completed Payments</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by client name, reference, or transaction..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
        </div>

        {/* Receipts List */}
        {filteredPayments.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
            <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Receipts Found</h3>
            <p className="text-sm text-gray-600 mb-4">
              {searchTerm 
                ? 'No receipts match your search criteria.' 
                : 'Payments will appear here with downloadable receipts.'}
            </p>
            <Link
              href="/payments/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
            >
              <CreditCard className="w-4 h-4" />
              Record a Payment
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Receipt #</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Source</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Client</th>
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
                    const isSending = sendingId === payment.id
                    const isSent = sentIds.includes(payment.id)
                    
                    return (
                      <tr key={`${payment.source}-${payment.id}`} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="text-sm font-mono font-medium text-primary-600">
                            {receiptNumber}
                          </span>
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
                            {payment.source_reference}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                              <User className="w-4 h-4 text-gray-500" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{payment.client_name}</p>
                              {payment.client_phone && (
                                <p className="text-xs text-gray-500">{payment.client_phone}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-700">{formatDate(payment.payment_date)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-md text-xs font-medium text-gray-700 capitalize">
                            <CreditCard className="w-3 h-3" />
                            {getMethodLabel(payment.payment_method)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-bold text-gray-900">
                            {formatCurrency(payment.amount, payment.currency)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {/* View Button */}
                            <button
                              onClick={() => handleViewReceipt(payment)}
                              className="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                              title="View Receipt"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            
                            {/* Download Button */}
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
                            
                            {/* WhatsApp Button */}
                            <button
                              onClick={() => handleSendWhatsApp(payment)}
                              disabled={isSending || !payment.client_phone}
                              className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                                isSent 
                                  ? 'text-green-600 bg-green-50' 
                                  : 'text-gray-600 hover:text-[#25D366] hover:bg-green-50'
                              }`}
                              title={payment.client_phone ? 'Send via WhatsApp' : 'No phone number'}
                            >
                              {isSending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : isSent ? (
                                <Check className="w-4 h-4" />
                              ) : (
                                <MessageCircle className="w-4 h-4" />
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
          </div>
        )}

        {/* Summary */}
        {filteredPayments.length > 0 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <span>Showing {filteredPayments.length} receipt{filteredPayments.length !== 1 ? 's' : ''}</span>
            <span>Total: <strong className="text-gray-900">{formatCurrency(totalAmount, mainCurrency)}</strong></span>
          </div>
        )}
      </div>
    </div>
  )
}