'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  Download, 
  Loader2, 
  Check, 
  MessageCircle,
  Calendar,
  CreditCard,
  User,
  FileText,
  Hash,
  Mail,
  Phone
} from 'lucide-react'
import { downloadReceiptPDF } from '@/lib/receipt-pdf-generator'

interface Payment {
  id: string
  itinerary_id: string
  itinerary_code: string
  client_name: string
  client_email?: string
  client_phone?: string
  payment_type: string
  amount: number
  currency: string
  payment_method: string
  payment_status: string
  transaction_reference: string
  payment_date: string
  notes: string
}

export default function ReceiptPage() {
  const params = useParams()
  const router = useRouter()
  const [payment, setPayment] = useState<Payment | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (params.id) {
      fetchPayment(params.id as string)
    }
  }, [params.id])

  const fetchPayment = async (id: string) => {
    try {
      const response = await fetch(`/api/payments/${id}`)
      const data = await response.json()
      
      if (data.success) {
        setPayment(data.data)
      }
    } catch (error) {
      console.error('Error fetching payment:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPDF = () => {
    if (!payment) return
    
    setDownloading(true)
    
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
      console.error('Error downloading PDF:', error)
      alert('Failed to download receipt')
    } finally {
      setDownloading(false)
    }
  }

  const handleSendWhatsApp = async () => {
    if (!payment?.client_phone) {
      alert('No phone number available for this client')
      return
    }

    setSending(true)
    
    try {
      const response = await fetch('/api/whatsapp/send-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: payment.id })
      })

      const data = await response.json()

      if (data.success) {
        setSent(true)
        setTimeout(() => setSent(false), 3000)
      } else {
        alert(data.error || 'Failed to send receipt')
      }
    } catch (error) {
      console.error('Error sending receipt:', error)
      alert('Failed to send receipt via WhatsApp')
    } finally {
      setSending(false)
    }
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
          <p className="text-sm text-gray-600">Loading receipt...</p>
        </div>
      </div>
    )
  }

  if (!payment) {
    return (
      <div className="p-4 lg:p-6">
        <div className="max-w-3xl mx-auto text-center py-12">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-3">Payment Not Found</h1>
          <p className="text-sm text-gray-600 mb-4">The receipt you're looking for doesn't exist.</p>
          <Link href="/receipts" className="text-sm text-primary-600 hover:text-primary-700">
            ← Back to Receipts
          </Link>
        </div>
      </div>
    )
  }

  const receiptNumber = payment.transaction_reference || `RCP-${payment.id.slice(0, 8).toUpperCase()}`

  return (
    <div className="p-4 lg:p-6 bg-gray-50 min-h-screen">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          
          <div className="flex items-center gap-2">
            {/* WhatsApp Button */}
            {payment.client_phone && (
              <button
                onClick={handleSendWhatsApp}
                disabled={sending}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  sent 
                    ? 'bg-green-600 text-white' 
                    : 'bg-[#25D366] text-white hover:bg-[#20BD5A]'
                } disabled:opacity-50`}
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : sent ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <MessageCircle className="w-4 h-4" />
                )}
                {sending ? 'Sending...' : sent ? 'Sent!' : 'Send via WhatsApp'}
              </button>
            )}
            
            {/* Download Button */}
            <button
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {downloading ? 'Generating...' : 'Download PDF'}
            </button>
          </div>
        </div>

        {/* Receipt Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Receipt Header */}
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-primary-200 text-xs uppercase tracking-wider mb-1">Payment Receipt</p>
                <h1 className="text-2xl font-bold">{receiptNumber}</h1>
              </div>
              <div className="text-right">
                <p className="text-primary-200 text-xs mb-1">Travel2Egypt</p>
                <p className="text-xs opacity-75">Cairo, Egypt</p>
              </div>
            </div>
          </div>

          {/* Status Badge */}
          <div className="px-6 py-3 bg-green-50 border-b border-green-100 flex items-center justify-center gap-2">
            <Check className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-700">Payment Completed Successfully</span>
          </div>

          {/* Receipt Body */}
          <div className="p-6">
            {/* Client & Date Info */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Received From</p>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{payment.client_name}</p>
                    {payment.client_email && (
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3" />
                        {payment.client_email}
                      </p>
                    )}
                    {payment.client_phone && (
                      <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />
                        {payment.client_phone}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Date & Reference</p>
                <p className="font-semibold text-gray-900">
                  {new Date(payment.payment_date || Date.now()).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </p>
                <Link 
                  href={`/itineraries/${payment.itinerary_id}`}
                  className="text-sm text-primary-600 hover:text-primary-700 font-mono"
                >
                  {payment.itinerary_code}
                </Link>
              </div>
            </div>

            {/* Payment Details */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Payment Details</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Payment Method</p>
                    <p className="text-sm font-medium text-gray-900 capitalize">
                      {payment.payment_method?.replace('_', ' ')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Payment Type</p>
                    <p className="text-sm font-medium text-gray-900 capitalize">
                      {payment.payment_type?.replace('_', ' ')}
                    </p>
                  </div>
                </div>
                {payment.transaction_reference && (
                  <div className="flex items-center gap-3 col-span-2">
                    <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                      <Hash className="w-4 h-4 text-gray-500" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Transaction Reference</p>
                      <p className="text-sm font-mono font-medium text-gray-900">
                        {payment.transaction_reference}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Amount */}
            <div className="bg-primary-600 text-white rounded-lg p-6 text-center mb-6">
              <p className="text-primary-200 text-xs uppercase tracking-wider mb-2">Amount Received</p>
              <p className="text-4xl font-bold">
                {formatCurrency(payment.amount, payment.currency)}
              </p>
            </div>

            {/* Notes */}
            {payment.notes && (
              <div className="mb-6">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Notes</p>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{payment.notes}</p>
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-gray-200 pt-6 text-center">
              <p className="text-lg font-semibold text-gray-900 mb-1">
                Thank you for your payment!
              </p>
              <p className="text-sm text-gray-600">
                This receipt confirms your payment has been received and processed.
              </p>
              <p className="text-xs text-gray-500 mt-3">
                Questions? Contact us at info@travel2egypt.com
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}