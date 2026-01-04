'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Download, Loader2, FileText, Calendar, CreditCard } from 'lucide-react'
import { downloadInvoicePDF } from '@/lib/invoice-pdf-generator'

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
  due_date?: string
  notes: string
  created_at: string
}

export default function InvoicePage() {
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
      const invoiceNumber = `INV-${payment.itinerary_code}-${payment.id.slice(0, 4).toUpperCase()}`
      
      // Build invoice object for PDF generator
      const invoiceData = {
        id: payment.id,
        invoice_number: invoiceNumber,
        invoice_type: payment.payment_type === 'deposit' ? 'deposit' as const : 
                      payment.payment_type === 'final' ? 'final' as const : 
                      'standard' as const,
        deposit_percent: payment.payment_type === 'deposit' ? 30 : undefined,
        parent_invoice_id: null,
        client_name: payment.client_name,
        client_email: payment.client_email || '',
        line_items: [{
          description: `Payment for ${payment.itinerary_code}`,
          quantity: 1,
          unit_price: payment.amount,
          amount: payment.amount
        }],
        subtotal: payment.amount,
        tax_rate: 0,
        tax_amount: 0,
        discount_amount: 0,
        total_amount: payment.amount,
        currency: payment.currency,
        amount_paid: payment.payment_status === 'completed' ? payment.amount : 0,
        balance_due: payment.payment_status === 'completed' ? 0 : payment.amount,
        status: payment.payment_status === 'completed' ? 'paid' : 'sent',
        issue_date: payment.created_at,
        due_date: payment.due_date || payment.payment_date || new Date().toISOString(),
        notes: payment.notes,
        payment_terms: '30% deposit required to confirm booking. Balance due upon arrival.',
        payment_instructions: 'Payment accepted via bank transfer or credit card.'
      }
      
      downloadInvoicePDF(invoiceData)
    } catch (error) {
      console.error('Error downloading PDF:', error)
      alert('Failed to download invoice')
    } finally {
      setDownloading(false)
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      completed: 'bg-green-100 text-green-700',
      paid: 'bg-green-100 text-green-700',
      pending: 'bg-orange-100 text-orange-700',
      sent: 'bg-blue-100 text-blue-700',
      draft: 'bg-gray-100 text-gray-700',
      overdue: 'bg-red-100 text-red-700'
    }
    return colors[status] || 'bg-gray-100 text-gray-700'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading invoice...</p>
        </div>
      </div>
    )
  }

  if (!payment) {
    return (
      <div className="p-4 lg:p-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-3">Invoice Not Found</h1>
          <Link href="/payments" className="text-sm text-primary-600 hover:text-primary-700">
            ← Back to Payments
          </Link>
        </div>
      </div>
    )
  }

  const invoiceNumber = `INV-${payment.itinerary_code}-${payment.id.slice(0, 4).toUpperCase()}`
  const isPaid = payment.payment_status === 'completed'

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

        {/* Invoice Preview */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          {/* Header */}
          <div className="flex justify-between items-start mb-8 pb-6 border-b-2 border-gray-200">
            <div>
              <h1 className="text-3xl font-bold text-primary-600 mb-1">INVOICE</h1>
              <p className="text-sm text-gray-600 font-mono">{invoiceNumber}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-gray-900">Travel2Egypt</p>
              <p className="text-xs text-gray-500">Cairo, Egypt</p>
              <p className="text-xs text-gray-500">info@travel2egypt.com</p>
            </div>
          </div>

          {/* Bill To & Invoice Info */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Bill To</p>
              <p className="text-base font-semibold text-gray-900">{payment.client_name}</p>
              {payment.client_email && (
                <p className="text-sm text-gray-600">{payment.client_email}</p>
              )}
            </div>
            <div className="text-right">
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-500">Invoice Date</p>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(payment.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Itinerary</p>
                  <p className="text-sm font-mono text-gray-900">{payment.itinerary_code}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${getStatusColor(payment.payment_status)}`}>
                    {isPaid ? 'Paid' : payment.payment_status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="mb-8">
            <div className="bg-primary-600 text-white rounded-t-lg px-4 py-3">
              <div className="grid grid-cols-12 gap-4 text-xs font-semibold uppercase">
                <div className="col-span-6">Description</div>
                <div className="col-span-2 text-center">Type</div>
                <div className="col-span-2 text-center">Method</div>
                <div className="col-span-2 text-right">Amount</div>
              </div>
            </div>
            <div className="border-x border-b border-gray-200 rounded-b-lg">
              <div className="grid grid-cols-12 gap-4 px-4 py-4 text-sm">
                <div className="col-span-6">
                  <p className="font-medium text-gray-900">Payment for {payment.itinerary_code}</p>
                  {payment.notes && (
                    <p className="text-xs text-gray-500 mt-1">{payment.notes}</p>
                  )}
                </div>
                <div className="col-span-2 text-center capitalize text-gray-700">
                  {payment.payment_type.replace('_', ' ')}
                </div>
                <div className="col-span-2 text-center capitalize text-gray-700">
                  {payment.payment_method.replace('_', ' ')}
                </div>
                <div className="col-span-2 text-right font-semibold text-gray-900">
                  {payment.currency} {payment.amount.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end mb-8">
            <div className="w-64">
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-sm text-gray-600">Subtotal</span>
                <span className="text-sm font-medium text-gray-900">
                  {payment.currency} {payment.amount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-3 bg-gray-50 px-3 rounded-lg mt-2">
                <span className="text-base font-bold text-gray-900">Total</span>
                <span className="text-xl font-bold text-primary-600">
                  {payment.currency} {payment.amount.toFixed(2)}
                </span>
              </div>
              {isPaid && (
                <div className="mt-3 text-center">
                  <span className="inline-block bg-green-100 text-green-700 px-4 py-2 rounded-lg text-sm font-bold">
                    ✓ PAID IN FULL
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Payment Terms */}
          <div className="border-t border-gray-200 pt-6">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">Payment Terms</h4>
            <p className="text-xs text-gray-600">
              30% deposit required to confirm booking. Remaining balance due upon arrival.
              Payment accepted via bank transfer or credit card.
            </p>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200 text-center">
            <p className="text-base font-semibold text-gray-900 mb-1">
              Thank you for your business!
            </p>
            <p className="text-xs text-gray-500">
              For questions, contact us at info@travel2egypt.com
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}