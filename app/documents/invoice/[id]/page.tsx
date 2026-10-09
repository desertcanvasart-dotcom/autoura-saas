'use client'

import { identityFromTenant, fetchLogoDataUrl } from '@/lib/company-identity'
import { DocumentLetterhead, DocumentFooter } from '@/components/documents/Letterhead'
import { useTenant } from '@/app/contexts/TenantContext'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Download, Loader2 } from 'lucide-react'
import { showToast } from '@/app/contexts/ToastContext'
import { BackLink } from '@/components/nav/TripNav'
import { paymentInvoiceShape } from '@/lib/payment-invoice'
import { contractDepositPercent, contractSettingsFromTenant, paymentTermsText } from '@/lib/contract-terms'

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
  /** The trip's total (the itinerary's total_cost); null when unpriced. */
  total_cost?: number | null
}

const PAYMENT_INSTRUCTIONS = 'Payment accepted via bank transfer or credit card.'

export default function InvoicePage() {
  const { tenant } = useTenant()
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

  // The operator's own deposit and country (Settings → Organization), as the
  // contract states them — it said "30% … upon arrival" for everyone.
  const settings = contractSettingsFromTenant(tenant)
  const paymentTerms = paymentTermsText(contractDepositPercent(settings), settings)

  const handleDownloadPDF = async () => {
    if (!payment) return
    
    setDownloading(true)
    
    try {
      const invoiceNumber = `INV-${payment.itinerary_code}-${payment.id.slice(0, 4).toUpperCase()}`
      const shape = paymentInvoiceShape(payment.payment_type, payment.amount, payment.total_cost)

      // Build invoice object for PDF generator
      const invoiceData = {
        id: payment.id,
        invoice_number: invoiceNumber,
        // From the payment and its trip's real total — not an assumed 30%.
        invoice_type: shape.invoiceType,
        deposit_percent: shape.depositPercent,
        trip_total: shape.tripTotal,
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
        payment_terms: paymentTerms,
        payment_instructions: PAYMENT_INSTRUCTIONS
      }
      
      const { downloadInvoicePDF } = await import('@/lib/invoice-pdf-generator')
      downloadInvoicePDF(invoiceData, { ...identityFromTenant(tenant), logoDataUrl: await fetchLogoDataUrl(tenant?.logo_url) })
    } catch (error) {
      console.error('Error downloading PDF:', error)
      showToast('error', 'Failed to download invoice')
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
  const shape = paymentInvoiceShape(payment.payment_type, payment.amount, payment.total_cost)
  const money = (n: number) => `${payment.currency} ${n.toFixed(2)}`

  return (
    <div className="p-4 lg:p-6 bg-gray-50 min-h-screen">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          {/* Back to wherever it was opened from (?from=), else its payment. */}
          <BackLink fallbackHref={`/payments/${payment.id}`} fallbackLabel="Payment" />
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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Header: the agency's letterhead (Settings → Organization) */}
          <DocumentLetterhead
            company={identityFromTenant(tenant)}
            title="Invoice"
            number={invoiceNumber}
          />
          <div className="px-8 pb-8 pt-2">
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

          {/* The trip this deposit or balance is part of — real figures only. */}
          {shape.tripTotal !== undefined && (
            <div className="mb-6 grid grid-cols-3 gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">Full trip cost</p>
                <p className="font-semibold text-gray-900">{money(shape.tripTotal)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Deposit ({shape.depositPercent}%)</p>
                <p className="font-semibold text-gray-900">
                  {money(shape.invoiceType === 'deposit' ? payment.amount : shape.tripTotal - payment.amount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Balance</p>
                <p className="font-semibold text-gray-900">
                  {money(shape.invoiceType === 'deposit' ? shape.tripTotal - payment.amount : payment.amount)}
                </p>
              </div>
            </div>
          )}

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
                    ✓ PAID
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Payment Terms */}
          <div className="border-t border-gray-200 pt-6">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">Payment Terms</h4>
            <p className="text-xs text-gray-600">
              {paymentTerms} {PAYMENT_INSTRUCTIONS}
            </p>
          </div>

            <p className="mt-8 text-center text-base font-semibold text-gray-900">Thank you for your business!</p>
          </div>

          {/* Footer: Settings → Organization */}
          <div className="border-t border-gray-100 bg-gray-50/60 px-8 py-4">
            <DocumentFooter company={identityFromTenant(tenant)} />
          </div>
        </div>
      </div>
    </div>
  )
}