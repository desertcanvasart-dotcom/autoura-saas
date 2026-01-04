'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'
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
}

export default function ReceiptPage() {
  const params = useParams()
  const [payment, setPayment] = useState<Payment | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

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
      // Use client-side PDF generation
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
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-3">Payment Not Found</h1>
          <Link href="/payments" className="text-sm text-primary-600 hover:text-primary-700">
            ← Back to Payments
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
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/payments"
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Payments
          </Link>
          <button
            onClick={handleDownloadPDF}
            disabled={downloading}
            className="bg-primary-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-primary-700 flex items-center gap-2 font-medium disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {downloading ? 'Generating...' : 'Download PDF'}
          </button>
        </div>

        {/* Receipt Preview */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          {/* Header */}
          <div className="text-center mb-6 pb-6 border-b-2 border-gray-200">
            <h1 className="text-3xl font-bold text-primary-600 mb-2">PAYMENT RECEIPT</h1>
            <p className="text-sm text-gray-600">Travel2Egypt</p>
            <p className="text-xs text-gray-500">Cairo, Egypt | info@travel2egypt.com</p>
          </div>

          {/* Receipt Details */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <p className="text-xs text-gray-600 mb-1">Receipt Number</p>
              <p className="text-sm font-bold text-gray-900">{receiptNumber}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Date</p>
              <p className="text-sm font-bold text-gray-900">
                {new Date(payment.payment_date || Date.now()).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Client Name</p>
              <p className="text-sm font-bold text-gray-900">{payment.client_name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Itinerary Code</p>
              <p className="text-sm font-bold text-gray-900 font-mono">{payment.itinerary_code}</p>
            </div>
          </div>

          {/* Payment Details */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Payment Details</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Payment Type:</span>
                <span className="font-medium text-gray-900 capitalize">
                  {payment.payment_type.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Payment Method:</span>
                <span className="font-medium text-gray-900 capitalize">
                  {payment.payment_method.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Status:</span>
                <span className="font-medium text-green-600 capitalize">
                  {payment.payment_status.replace('_', ' ')}
                </span>
              </div>
              {payment.transaction_reference && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Transaction Ref:</span>
                  <span className="font-medium text-gray-900 font-mono">
                    {payment.transaction_reference}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Amount */}
          <div className="bg-primary-600 text-white rounded-lg p-6 text-center mb-6">
            <p className="text-xs mb-2 opacity-90">Amount Paid</p>
            <p className="text-4xl font-bold">
              {payment.currency} {payment.amount.toFixed(2)}
            </p>
          </div>

          {/* Notes */}
          {payment.notes && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Notes</h4>
              <p className="text-xs text-gray-600">{payment.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="border-t-2 border-gray-200 pt-4 text-center">
            <p className="text-base font-semibold text-gray-900 mb-2">
              Thank you for your payment!
            </p>
            <p className="text-xs text-gray-600">
              This receipt confirms your payment has been received and processed.
            </p>
            <p className="text-xs text-gray-600 mt-2">
              For questions, contact us at info@travel2egypt.com
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}