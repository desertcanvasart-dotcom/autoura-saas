'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  FileText, 
  Send, 
  Download, 
  Plus,
  X,
  Trash2,
  Building,
  Mail,
  Calendar,
  CreditCard,
  CheckCircle,
  Clock,
  AlertCircle,
  Bell,
  XCircle,
  Wallet,
  Receipt,
  ArrowRight,
  Link as LinkIcon,
  MessageCircle
} from 'lucide-react'
import { downloadInvoicePDF } from '@/lib/invoice-pdf-generator'
import { downloadReceiptPDF } from '@/lib/receipt-pdf-generator'

interface Invoice {
  id: string
  invoice_number: string
  invoice_type: 'standard' | 'deposit' | 'final'
  deposit_percent: number
  parent_invoice_id: string | null
  client_id: string
  itinerary_id: string | null
  client_name: string
  client_email: string
  line_items: LineItem[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  currency: string
  amount_paid: number
  balance_due: number
  status: string
  issue_date: string
  due_date: string
  notes: string | null
  payment_terms: string | null
  payment_instructions: string | null
  created_at: string
  sent_at: string | null
  paid_at: string | null
}

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  amount: number
}

interface Payment {
  id: string
  invoice_id: string
  amount: number
  currency: string
  payment_method: string
  payment_date: string
  transaction_reference: string | null
  notes: string | null
  created_at: string
}

interface ReminderHistory {
  id: string
  invoice_id: string
  sent_at: string
  reminder_type: string
  recipient_email: string
  subject: string
  status: string
  error_message: string | null
}

interface PaymentFormData {
  amount: number
  currency: string
  payment_method: string
  payment_date: string
  transaction_reference: string
  notes: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  draft: { label: 'Draft', color: 'text-gray-600', bg: 'bg-gray-100', icon: FileText },
  sent: { label: 'Sent', color: 'text-blue-700', bg: 'bg-blue-100', icon: Send },
  viewed: { label: 'Viewed', color: 'text-purple-700', bg: 'bg-purple-100', icon: FileText },
  partial: { label: 'Partial', color: 'text-orange-700', bg: 'bg-orange-100', icon: Clock },
  paid: { label: 'Paid', color: 'text-green-700', bg: 'bg-green-100', icon: CheckCircle },
  overdue: { label: 'Overdue', color: 'text-red-700', bg: 'bg-red-100', icon: AlertCircle },
  cancelled: { label: 'Cancelled', color: 'text-gray-500', bg: 'bg-gray-100', icon: X }
}

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  standard: { label: 'Standard', color: 'text-gray-600', bg: 'bg-gray-50', icon: FileText },
  deposit: { label: 'Deposit', color: 'text-amber-700', bg: 'bg-amber-50', icon: Wallet },
  final: { label: 'Final', color: 'text-emerald-700', bg: 'bg-emerald-50', icon: Receipt }
}

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'wise', label: 'Wise' },
  { value: 'airwallex', label: 'Airwallex' },
  { value: 'stripe', label: 'Stripe' },
]

const REMINDER_TYPE_LABELS: Record<string, string> = {
  before_due_7: '7 days before',
  before_due_3: '3 days before',
  on_due: 'On due date',
  overdue_7: '7 days overdue',
  overdue_14: '14 days overdue',
  overdue_30: '30+ days overdue',
  manual: 'Manual'
}
export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [linkedInvoice, setLinkedInvoice] = useState<Invoice | null>(null)
  const [childInvoice, setChildInvoice] = useState<Invoice | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [reminders, setReminders] = useState<ReminderHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [savingPayment, setSavingPayment] = useState(false)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [creatingFinalInvoice, setCreatingFinalInvoice] = useState(false)
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false)
  const [paymentForm, setPaymentForm] = useState<PaymentFormData>({
    amount: 0,
    currency: 'EUR',
    payment_method: 'bank_transfer',
    payment_date: new Date().toISOString().split('T')[0],
    transaction_reference: '',
    notes: ''
  })

  useEffect(() => {
    fetchInvoice()
    fetchPayments()
    fetchReminders()
  }, [resolvedParams.id])

  const fetchInvoice = async () => {
    try {
      const response = await fetch(`/api/invoices/${resolvedParams.id}`)
      if (response.ok) {
        const data = await response.json()
        setInvoice(data)
        setPaymentForm(prev => ({
          ...prev,
          amount: Number(data.balance_due),
          currency: data.currency
        }))

        if (data.parent_invoice_id) {
          const parentResponse = await fetch(`/api/invoices/${data.parent_invoice_id}`)
          if (parentResponse.ok) {
            const parentData = await parentResponse.json()
            setLinkedInvoice(parentData)
          }
        }

        if (data.invoice_type === 'deposit') {
          const allInvoicesResponse = await fetch(`/api/invoices?itineraryId=${data.itinerary_id}`)
          if (allInvoicesResponse.ok) {
            const allInvoices = await allInvoicesResponse.json()
            const finalInvoice = allInvoices.find((inv: Invoice) => 
              inv.parent_invoice_id === data.id && inv.invoice_type === 'final'
            )
            if (finalInvoice) {
              setChildInvoice(finalInvoice)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching invoice:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPayments = async () => {
    try {
      const response = await fetch(`/api/invoices/${resolvedParams.id}/payments`)
      if (response.ok) {
        const data = await response.json()
        setPayments(data)
      }
    } catch (error) {
      console.error('Error fetching payments:', error)
    }
  }

  const fetchReminders = async () => {
    try {
      const response = await fetch(`/api/invoices/${resolvedParams.id}/reminder`)
      if (response.ok) {
        const data = await response.json()
        setReminders(data.reminders || [])
      }
    } catch (error) {
      console.error('Error fetching reminders:', error)
    }
  }

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingPayment(true)

    try {
      const response = await fetch(`/api/invoices/${resolvedParams.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentForm)
      })

      if (response.ok) {
        setShowPaymentModal(false)
        fetchInvoice()
        fetchPayments()
        setPaymentForm({
          amount: 0,
          currency: invoice?.currency || 'EUR',
          payment_method: 'bank_transfer',
          payment_date: new Date().toISOString().split('T')[0],
          transaction_reference: '',
          notes: ''
        })
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to record payment')
      }
    } catch (error) {
      console.error('Error recording payment:', error)
      alert('Failed to record payment')
    } finally {
      setSavingPayment(false)
    }
  }

  const handleMarkAsSent = async () => {
    try {
      const response = await fetch(`/api/invoices/${resolvedParams.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString() })
      })
      if (response.ok) {
        fetchInvoice()
      }
    } catch (error) {
      console.error('Error updating invoice:', error)
    }
  }

  const handleDownloadPDF = () => {
    if (!invoice) return
    
    setGeneratingPDF(true)
    try {
      downloadInvoicePDF(invoice)
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert('Failed to generate PDF. Please try again.')
    } finally {
      setGeneratingPDF(false)
    }
  }

  const handleSendWhatsApp = async () => {
    if (!invoice) return
    
    setSendingWhatsApp(true)
    try {
      const response = await fetch('/api/whatsapp/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id })
      })
      
      const data = await response.json()
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to send invoice')
      }
      
      alert('Invoice sent via WhatsApp! ✅')
      fetchInvoice()
    } catch (error: any) {
      console.error('Error sending WhatsApp:', error)
      alert(`Failed to send: ${error.message}`)
    } finally {
      setSendingWhatsApp(false)
    }
  }

  const handleGenerateReceipt = (payment: Payment) => {
    if (!invoice) return
    
    const receiptData = {
      receiptNumber: `RCP-${invoice.invoice_number}-${payments.indexOf(payment) + 1}`,
      invoiceNumber: invoice.invoice_number,
      clientName: invoice.client_name,
      clientEmail: invoice.client_email,
      paymentDate: payment.payment_date,
      paymentMethod: payment.payment_method,
      amount: payment.amount,
      currency: payment.currency,
      transactionRef: payment.transaction_reference,
      notes: payment.notes
    }
    
    downloadReceiptPDF(receiptData, invoice)
  }

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('Are you sure you want to delete this payment?')) return

    try {
      const response = await fetch(`/api/invoices/${resolvedParams.id}/payments/${paymentId}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        fetchInvoice()
        fetchPayments()
      }
    } catch (error) {
      console.error('Error deleting payment:', error)
    }
  }

  const handleCreateFinalInvoice = async () => {
    if (!invoice) return
    
    if (!confirm('Create a Final Invoice for the remaining balance?')) return

    setCreatingFinalInvoice(true)
    try {
      const fullTripCost = (Number(invoice.total_amount) * 100) / invoice.deposit_percent
      const balanceAmount = fullTripCost - Number(invoice.total_amount)

      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_type: 'final',
          deposit_percent: invoice.deposit_percent,
          parent_invoice_id: invoice.id,
          client_id: invoice.client_id,
          itinerary_id: invoice.itinerary_id,
          client_name: invoice.client_name,
          client_email: invoice.client_email,
          full_trip_cost: fullTripCost,
          line_items: [{
            description: `Final Balance - ${invoice.line_items[0]?.description.replace(/^Booking Deposit \(\d+%\) - /, '')}`,
            quantity: 1,
            unit_price: balanceAmount,
            amount: balanceAmount
          }],
          subtotal: balanceAmount,
          total_amount: balanceAmount,
          currency: invoice.currency,
          issue_date: new Date().toISOString().split('T')[0],
          due_date: null,
          payment_terms: 'Balance payable in cash upon arrival or before first day of service.',
          notes: `Related Deposit Invoice: ${invoice.invoice_number}`
        })
      })

      if (response.ok) {
        const newInvoice = await response.json()
        router.push(`/invoices/${newInvoice.id}`)
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to create final invoice')
      }
    } catch (error) {
      console.error('Error creating final invoice:', error)
      alert('Failed to create final invoice')
    } finally {
      setCreatingFinalInvoice(false)
    }
  }

  const getCurrencySymbol = (currency: string) => {
    const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }
    return symbols[currency] || currency
  }

  const formatReminderDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getDisplayStatus = () => {
    if (!invoice) return 'draft'
    if (invoice.status !== 'paid' && invoice.status !== 'cancelled' && invoice.due_date) {
      const dueDate = new Date(invoice.due_date)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (dueDate < today && Number(invoice.balance_due) > 0) {
        return 'overdue'
      }
    }
    return invoice.status
  }

  const canCreateFinalInvoice = () => {
    if (!invoice) return false
    return (
      invoice.invoice_type === 'deposit' &&
      invoice.status === 'paid' &&
      !childInvoice
    )
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Invoice not found</p>
        <Link href="/invoices" className="text-[#647C47] hover:underline mt-2 inline-block">
          Back to Invoices
        </Link>
      </div>
    )
  }

  const displayStatus = getDisplayStatus()
  const statusConfig = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.draft
  const StatusIcon = statusConfig.icon
  const typeConfig = TYPE_CONFIG[invoice.invoice_type] || TYPE_CONFIG.standard
  const TypeIcon = typeConfig.icon

  const fullTripCost = invoice.invoice_type === 'deposit' 
    ? (Number(invoice.total_amount) * 100) / invoice.deposit_percent
    : invoice.invoice_type === 'final' && linkedInvoice
      ? (Number(linkedInvoice.total_amount) * 100) / linkedInvoice.deposit_percent
      : Number(invoice.total_amount)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/invoices"
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-gray-900">{invoice.invoice_number}</h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${typeConfig.bg} ${typeConfig.color}`}>
                <TypeIcon className="h-3.5 w-3.5" />
                {typeConfig.label}
                {invoice.invoice_type !== 'standard' && ` (${invoice.deposit_percent}%)`}
              </span>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                <StatusIcon className="h-3.5 w-3.5" />
                {statusConfig.label}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{invoice.client_name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Send via WhatsApp Button */}
          <button
            onClick={handleSendWhatsApp}
            disabled={sendingWhatsApp}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {sendingWhatsApp ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Sending...
              </>
            ) : (
              <>
                <MessageCircle className="h-4 w-4" />
                Send via WhatsApp
              </>
            )}
          </button>

          <button
            onClick={handleDownloadPDF}
            disabled={generatingPDF}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {generatingPDF ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                Generating...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Download PDF
              </>
            )}
          </button>
          
          {invoice.status === 'draft' && (
            <button
              onClick={handleMarkAsSent}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Send className="h-4 w-4" />
              Mark as Sent
            </button>
          )}

          {canCreateFinalInvoice() && (
            <button
              onClick={handleCreateFinalInvoice}
              disabled={creatingFinalInvoice}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {creatingFinalInvoice ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Creating...
                </>
              ) : (
                <>
                  <Receipt className="h-4 w-4" />
                  Create Final Invoice
                </>
              )}
            </button>
          )}

          {Number(invoice.balance_due) > 0 && (
            <button
              onClick={() => setShowPaymentModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white text-sm font-medium rounded-lg hover:bg-[#4f6238] transition-colors"
            >
              <Plus className="h-4 w-4" />
              Record Payment
            </button>
          )}
        </div>
      </div>

      {/* Linked Invoice Banner */}
      {(linkedInvoice || childInvoice) && (
        <div className={`mb-6 p-4 rounded-lg border ${
          invoice.invoice_type === 'final' 
            ? 'bg-amber-50 border-amber-200' 
            : 'bg-emerald-50 border-emerald-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LinkIcon className={`h-5 w-5 ${invoice.invoice_type === 'final' ? 'text-amber-600' : 'text-emerald-600'}`} />
              <div>
                <p className={`text-sm font-medium ${invoice.invoice_type === 'final' ? 'text-amber-800' : 'text-emerald-800'}`}>
                  {invoice.invoice_type === 'final' ? 'Deposit Invoice' : 'Final Invoice'}
                </p>
                <p className={`text-xs ${invoice.invoice_type === 'final' ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {linkedInvoice?.invoice_number || childInvoice?.invoice_number} • 
                  {' '}{getCurrencySymbol(linkedInvoice?.currency || childInvoice?.currency || 'EUR')}
                  {Number(linkedInvoice?.total_amount || childInvoice?.total_amount).toFixed(2)} • 
                  {' '}{STATUS_CONFIG[linkedInvoice?.status || childInvoice?.status || 'draft'].label}
                </p>
              </div>
            </div>
            <Link
              href={`/invoices/${linkedInvoice?.id || childInvoice?.id}`}
              className={`flex items-center gap-1 text-sm font-medium ${
                invoice.invoice_type === 'final' 
                  ? 'text-amber-700 hover:text-amber-800' 
                  : 'text-emerald-700 hover:text-emerald-800'
              }`}
            >
              View
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Trip Cost Summary */}
      {invoice.invoice_type !== 'standard' && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Trip Cost Breakdown</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500">Full Trip Cost</p>
              <p className="text-lg font-bold text-gray-900">
                {getCurrencySymbol(invoice.currency)}{fullTripCost.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Deposit ({invoice.deposit_percent}%)</p>
              <p className="text-lg font-bold text-amber-600">
                {getCurrencySymbol(invoice.currency)}{((fullTripCost * invoice.deposit_percent) / 100).toFixed(2)}
                {invoice.invoice_type === 'deposit' && linkedInvoice === null && childInvoice === null && invoice.status === 'paid' && (
                  <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Paid</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Balance Due on Arrival</p>
              <p className="text-lg font-bold text-emerald-600">
                {getCurrencySymbol(invoice.currency)}{(fullTripCost - (fullTripCost * invoice.deposit_percent) / 100).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice Details - Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Client & Dates Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Bill To</h3>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Building className="h-4 w-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{invoice.client_name}</p>
                    {invoice.client_email && (
                      <p className="text-sm text-gray-500 mt-0.5">{invoice.client_email}</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Calendar className="h-4 w-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Issue Date</p>
                    <p className="text-sm font-medium text-gray-900">{new Date(invoice.issue_date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Clock className="h-4 w-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Due Date</p>
                    <p className={`text-sm font-medium ${displayStatus === 'overdue' ? 'text-red-600' : 'text-gray-900'}`}>
                      {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'On Arrival'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-5 py-3">Description</th>
                  <th className="text-center text-xs font-semibold text-gray-600 uppercase tracking-wide px-5 py-3 w-24">Qty</th>
                  <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-5 py-3 w-32">Unit Price</th>
                  <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-5 py-3 w-32">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(invoice.line_items || []).map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-5 py-4 text-sm text-gray-900">{item.description}</td>
                    <td className="px-5 py-4 text-sm text-gray-600 text-center">{item.quantity}</td>
                    <td className="px-5 py-4 text-sm text-gray-600 text-right">
                      {getCurrencySymbol(invoice.currency)}{Number(item.unit_price).toFixed(2)}
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-gray-900 text-right">
                      {getCurrencySymbol(invoice.currency)}{Number(item.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr className="border-t border-gray-200">
                  <td colSpan={3} className="px-5 py-3 text-sm text-gray-500 text-right">Subtotal</td>
                  <td className="px-5 py-3 text-sm font-medium text-gray-900 text-right">
                    {getCurrencySymbol(invoice.currency)}{Number(invoice.subtotal).toFixed(2)}
                  </td>
                </tr>
                {Number(invoice.tax_amount) > 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-3 text-sm text-gray-500 text-right">
                      Tax ({invoice.tax_rate}%)
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-900 text-right">
                      {getCurrencySymbol(invoice.currency)}{Number(invoice.tax_amount).toFixed(2)}
                    </td>
                  </tr>
                )}
                {Number(invoice.discount_amount) > 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-3 text-sm text-gray-500 text-right">Discount</td>
                    <td className="px-5 py-3 text-sm text-green-600 text-right">
                      -{getCurrencySymbol(invoice.currency)}{Number(invoice.discount_amount).toFixed(2)}
                    </td>
                  </tr>
                )}
                <tr className="border-t-2 border-gray-200">
                  <td colSpan={3} className="px-5 py-4 text-sm font-semibold text-gray-900 text-right">
                    {invoice.invoice_type === 'deposit' ? 'Deposit Amount' : 
                     invoice.invoice_type === 'final' ? 'Balance Due' : 'Total'}
                  </td>
                  <td className="px-5 py-4 text-lg font-bold text-gray-900 text-right">
                    {getCurrencySymbol(invoice.currency)}{Number(invoice.total_amount).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Notes & Payment Terms */}
          {(invoice.notes || invoice.payment_terms) && (
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {invoice.payment_terms && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Payment Terms</h3>
                    <p className="text-sm text-gray-700">{invoice.payment_terms}</p>
                  </div>
                )}
                {invoice.notes && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</h3>
                    <p className="text-sm text-gray-700">{invoice.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Payment Summary & History */}
        <div className="space-y-6">
          {/* Payment Summary */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Payment Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">
                  {invoice.invoice_type === 'deposit' ? 'Deposit Amount' : 
                   invoice.invoice_type === 'final' ? 'Balance Amount' : 'Total Amount'}
                </span>
                <span className="text-sm font-medium text-gray-900">
                  {getCurrencySymbol(invoice.currency)}{Number(invoice.total_amount).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Amount Paid</span>
                <span className="text-sm font-medium text-green-600">
                  {getCurrencySymbol(invoice.currency)}{Number(invoice.amount_paid).toFixed(2)}
                </span>
              </div>
              <div className="pt-3 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-900">Balance Due</span>
                  <span className={`text-xl font-bold ${Number(invoice.balance_due) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {getCurrencySymbol(invoice.currency)}{Number(invoice.balance_due).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {Number(invoice.balance_due) > 0 && (
              <button
                onClick={() => setShowPaymentModal(true)}
                className="w-full mt-5 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#647C47] text-white text-sm font-medium rounded-lg hover:bg-[#4f6238] transition-colors"
              >
                <Plus className="h-4 w-4" />
                Record Payment
              </button>
            )}

            {canCreateFinalInvoice() && (
              <button
                onClick={handleCreateFinalInvoice}
                disabled={creatingFinalInvoice}
                className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {creatingFinalInvoice ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <Receipt className="h-4 w-4" />
                    Create Final Invoice
                  </>
                )}
              </button>
            )}
            
            <button
              onClick={handleDownloadPDF}
              disabled={generatingPDF}
              className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {generatingPDF ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Download PDF
                </>
              )}
            </button>
          </div>

          {/* Payment History */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Payment History</h3>
            {payments.length === 0 ? (
              <div className="text-center py-6">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <CreditCard className="h-5 w-5 text-gray-400" />
                </div>
                <p className="text-sm text-gray-500">No payments recorded</p>
              </div>
            ) : (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div key={payment.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 bg-green-100 rounded-lg">
                        <CreditCard className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {getCurrencySymbol(payment.currency)}{Number(payment.amount).toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(payment.payment_date).toLocaleDateString()} • {payment.payment_method?.replace('_', ' ')}
                        </p>
                        {payment.transaction_reference && (
                          <p className="text-xs text-gray-400 font-mono mt-0.5">{payment.transaction_reference}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleGenerateReceipt(payment)}
                        className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Download Receipt"
                      >
                        <Receipt className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeletePayment(payment.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Payment"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reminder History */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Reminder History</h3>
              <Link 
                href="/reminders" 
                className="text-xs text-[#647C47] hover:underline"
              >
                View All
              </Link>
            </div>
            {reminders.length === 0 ? (
              <div className="text-center py-6">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Bell className="h-5 w-5 text-gray-400" />
                </div>
                <p className="text-sm text-gray-500">No reminders sent</p>
              </div>
            ) : (
              <div className="space-y-3">
                {reminders.map((reminder) => (
                  <div key={reminder.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className={`p-1.5 rounded-lg ${reminder.status === 'sent' ? 'bg-green-100' : 'bg-red-100'}`}>
                      {reminder.status === 'sent' ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">
                          {REMINDER_TYPE_LABELS[reminder.reminder_type] || reminder.reminder_type}
                        </p>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
                          reminder.status === 'sent' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {reminder.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatReminderDate(reminder.sent_at)}
                      </p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        To: {reminder.recipient_email}
                      </p>
                      {reminder.error_message && (
                        <p className="text-xs text-red-500 mt-1">{reminder.error_message}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Record Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Record Payment</h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="p-5 space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  Balance Due: <span className="font-bold">{getCurrencySymbol(invoice.currency)}{Number(invoice.balance_due).toFixed(2)}</span>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Amount <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                    step="0.01"
                    min="0"
                    max={Number(invoice.balance_due)}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Currency</label>
                  <select
                    value={paymentForm.currency}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, currency: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
                  >
                    <option value="EUR">EUR (€)</option>
                    <option value="USD">USD ($)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment Method</label>
                  <select
                    value={paymentForm.payment_method}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_method: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
                  >
                    {PAYMENT_METHODS.map(method => (
                      <option key={method.value} value={method.value}>{method.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment Date</label>
                  <input
                    type="date"
                    value={paymentForm.payment_date}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Transaction Reference</label>
                <input
                  type="text"
                  value={paymentForm.transaction_reference}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, transaction_reference: e.target.value }))}
                  placeholder="e.g., TXN-12345"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Notes</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder="Optional notes..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47] resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPayment}
                  className="px-4 py-2 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] disabled:opacity-50 transition-colors"
                >
                  {savingPayment ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}