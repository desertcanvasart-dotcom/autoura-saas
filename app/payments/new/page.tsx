'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, FileText, MapPin, DollarSign } from 'lucide-react'

interface Invoice {
  id: string
  invoice_number: string
  client_name: string
  client_email: string
  total_amount: number
  amount_paid: number
  balance_due: number
  currency: string
  status: string
}

interface Itinerary {
  id: string
  itinerary_code: string
  client_name: string
  total_cost: number
  total_paid: number
  payment_status: string
}

type PaymentTarget = 'invoice' | 'itinerary' | null

export default function RecordPaymentPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget>(null)
  
  // Data sources
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [itineraries, setItineraries] = useState<Itinerary[]>([])
  
  // Selected items
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [selectedItinerary, setSelectedItinerary] = useState<Itinerary | null>(null)
  
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    target_id: '',
    payment_type: 'deposit_30',
    amount: '',
    currency: 'EUR',
    payment_method: 'bank_transfer',
    payment_status: 'completed',
    transaction_reference: '',
    payment_date: new Date().toISOString().split('T')[0],
    due_date: '',
    notes: ''
  })

  useEffect(() => {
    fetchInvoices()
    fetchItineraries()
  }, [])

  // Auto-calculate amount when target changes
  useEffect(() => {
    if (paymentTarget === 'invoice' && selectedInvoice) {
      setFormData(prev => ({
        ...prev,
        target_id: selectedInvoice.id,
        amount: selectedInvoice.balance_due.toString(),
        currency: selectedInvoice.currency
      }))
    } else if (paymentTarget === 'itinerary' && selectedItinerary) {
      // Calculate based on payment type
      if (formData.payment_type.startsWith('deposit_')) {
        const percentage = parseInt(formData.payment_type.split('_')[1])
        // Round to CENTS, not whole units: Math.round() alone turned a 15%
        // deposit on €1,111.11 into €167 instead of €166.67, so the balance
        // never reached zero and the invoice stuck in 'partial' forever.
        const depositAmount = Math.round((selectedItinerary.total_cost ?? 0) * (percentage / 100) * 100) / 100
        setFormData(prev => ({
          ...prev,
          target_id: selectedItinerary.id,
          amount: depositAmount.toString()
        }))
      } else if (formData.payment_type === 'full') {
        setFormData(prev => ({
          ...prev,
          target_id: selectedItinerary.id,
          amount: selectedItinerary.total_cost.toString()
        }))
      } else {
        const balance = selectedItinerary.total_cost - (selectedItinerary.total_paid || 0)
        setFormData(prev => ({
          ...prev,
          target_id: selectedItinerary.id,
          amount: balance.toString()
        }))
      }
    }
  }, [selectedInvoice, selectedItinerary, paymentTarget, formData.payment_type])

  const fetchInvoices = async () => {
    try {
      const response = await fetch('/api/invoices')
      if (response.ok) {
        const data = await response.json()
        // Filter to show only invoices with balance due
        const unpaidInvoices = data.filter((inv: Invoice) => Number(inv.balance_due) > 0)
        setInvoices(unpaidInvoices)
      }
    } catch (error) {
      console.error('Error fetching invoices:', error)
    }
  }

  const fetchItineraries = async () => {
    try {
      const response = await fetch('/api/itineraries')
      const data = await response.json()
      
      if (data.success) {
        setItineraries(data.data)
      }
    } catch (error) {
      console.error('Error fetching itineraries:', error)
    }
  }

  const handleTargetChange = (target: PaymentTarget) => {
    setPaymentTarget(target)
    setSelectedInvoice(null)
    setSelectedItinerary(null)
    setFormData(prev => ({
      ...prev,
      target_id: '',
      amount: ''
    }))
  }

  const handleInvoiceSelect = (invoiceId: string) => {
    const invoice = invoices.find(inv => inv.id === invoiceId)
    setSelectedInvoice(invoice || null)
  }

  const handleItinerarySelect = (itineraryId: string) => {
    const itinerary = itineraries.find(it => it.id === itineraryId)
    setSelectedItinerary(itinerary || null)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!formData.target_id || !formData.amount) {
      setError('Please fill in all required fields')
      setLoading(false)
      return
    }

    try {
      let response

      if (paymentTarget === 'invoice') {
        // Record payment against invoice
        response = await fetch(`/api/invoices/${formData.target_id}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: parseFloat(formData.amount),
            currency: formData.currency,
            payment_method: formData.payment_method,
            payment_date: formData.payment_date,
            transaction_reference: formData.transaction_reference,
            notes: formData.notes
          })
        })
      } else {
        // Record payment against itinerary
        response = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itinerary_id: formData.target_id,
            payment_type: formData.payment_type.startsWith('deposit_') 
              ? 'deposit' 
              : formData.payment_type,
            amount: parseFloat(formData.amount),
            currency: formData.currency,
            payment_method: formData.payment_method,
            payment_status: formData.payment_status,
            transaction_reference: formData.transaction_reference,
            payment_date: formData.payment_date,
            due_date: formData.due_date || null,
            notes: formData.notes
          })
        })
      }

      const data = await response.json()

      if (response.ok || data.success) {
        router.push('/payments')
      } else {
        setError(data.error || 'Failed to record payment')
      }
    } catch (err) {
      setError('Error recording payment')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getBalanceDue = () => {
    if (paymentTarget === 'invoice' && selectedInvoice) {
      return selectedInvoice.balance_due
    }
    if (paymentTarget === 'itinerary' && selectedItinerary) {
      return selectedItinerary.total_cost - (selectedItinerary.total_paid || 0)
    }
    return 0
  }

  const getCurrencySymbol = (currency: string) => {
    const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }
    return symbols[currency] || currency
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Record Payment</h1>
            <p className="text-sm text-gray-600 mt-1">Add a new payment transaction</p>
          </div>
          <Link
            href="/payments"
            className="bg-gray-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-gray-700 transition-colors font-medium flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Payments
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {error && (
            <div className="mb-4 p-3 bg-danger/10 border-l-4 border-danger rounded">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          {/* Step 1: Choose Payment Target */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Record Payment Against <span className="text-danger">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleTargetChange('invoice')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  paymentTarget === 'invoice'
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${paymentTarget === 'invoice' ? 'bg-primary-100' : 'bg-gray-100'}`}>
                    <FileText className={`w-5 h-5 ${paymentTarget === 'invoice' ? 'text-primary-600' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <p className={`font-medium ${paymentTarget === 'invoice' ? 'text-primary-900' : 'text-gray-900'}`}>
                      Invoice
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {invoices.length} with balance due
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleTargetChange('itinerary')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  paymentTarget === 'itinerary'
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${paymentTarget === 'itinerary' ? 'bg-primary-100' : 'bg-gray-100'}`}>
                    <MapPin className={`w-5 h-5 ${paymentTarget === 'itinerary' ? 'text-primary-600' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <p className={`font-medium ${paymentTarget === 'itinerary' ? 'text-primary-900' : 'text-gray-900'}`}>
                      Itinerary
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {itineraries.length} available
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Step 2: Select specific invoice or itinerary */}
          {paymentTarget && (
            <>
              {paymentTarget === 'invoice' ? (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Select Invoice <span className="text-danger">*</span>
                  </label>
                  <select
                    value={selectedInvoice?.id || ''}
                    onChange={(e) => handleInvoiceSelect(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Choose an invoice...</option>
                    {invoices.map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.invoice_number} - {invoice.client_name} (Balance: {getCurrencySymbol(invoice.currency)}{Number(invoice.balance_due).toFixed(2)})
                      </option>
                    ))}
                  </select>
                  {invoices.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">No invoices with outstanding balance found.</p>
                  )}
                </div>
              ) : (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Select Itinerary <span className="text-danger">*</span>
                  </label>
                  <select
                    value={selectedItinerary?.id || ''}
                    onChange={(e) => handleItinerarySelect(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Choose an itinerary...</option>
                    {itineraries.map((itinerary) => (
                      <option key={itinerary.id} value={itinerary.id}>
                        {itinerary.itinerary_code} - {itinerary.client_name} ({itinerary.total_cost != null ? `€${itinerary.total_cost.toFixed(2)}` : 'not priced yet'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Selected Item Info */}
              {(selectedInvoice || selectedItinerary) && (
                <div className="mb-4 p-3 bg-primary-50 border border-primary-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-primary-600" />
                    <h3 className="text-sm font-semibold text-gray-900">Payment Details</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {paymentTarget === 'invoice' && selectedInvoice && (
                      <>
                        <div>
                          <span className="text-gray-600">Invoice Total:</span>
                          <p className="font-bold text-gray-900">
                            {getCurrencySymbol(selectedInvoice.currency)}{Number(selectedInvoice.total_amount).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-600">Already Paid:</span>
                          <p className="font-bold text-success">
                            {getCurrencySymbol(selectedInvoice.currency)}{Number(selectedInvoice.amount_paid).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-600">Balance Due:</span>
                          <p className="font-bold text-orange-600">
                            {getCurrencySymbol(selectedInvoice.currency)}{Number(selectedInvoice.balance_due).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-600">Status:</span>
                          <p className="font-medium text-gray-900 capitalize">{selectedInvoice.status}</p>
                        </div>
                      </>
                    )}
                    {paymentTarget === 'itinerary' && selectedItinerary && (
                      <>
                        <div>
                          <span className="text-gray-600">Total Cost:</span>
                          <p className="font-bold text-gray-900">{selectedItinerary.total_cost != null ? `€${selectedItinerary.total_cost.toFixed(2)}` : '—'}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Already Paid:</span>
                          <p className="font-bold text-success">€{(selectedItinerary.total_paid || 0).toFixed(2)}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Balance Due:</span>
                          <p className="font-bold text-orange-600">
                            €{(selectedItinerary.total_cost - (selectedItinerary.total_paid || 0)).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-600">Payment Status:</span>
                          <p className="font-medium text-gray-900 capitalize">
                            {selectedItinerary.payment_status?.replace('_', ' ') || 'not paid'}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Payment Type - Only for Itinerary */}
                {paymentTarget === 'itinerary' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Payment Type <span className="text-danger">*</span>
                    </label>
                    <select
                      name="payment_type"
                      value={formData.payment_type}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="deposit_10">Deposit (10%)</option>
                      <option value="deposit_15">Deposit (15%)</option>
                      <option value="deposit_20">Deposit (20%)</option>
                      <option value="deposit_25">Deposit (25%)</option>
                      <option value="deposit_30">Deposit (30%)</option>
                      <option value="deposit_50">Deposit (50%)</option>
                      <option value="installment">Installment</option>
                      <option value="final">Final Payment</option>
                      <option value="full">Full Payment</option>
                    </select>
                  </div>
                )}

                {/* Amount */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Amount ({getCurrencySymbol(formData.currency)}) <span className="text-danger">*</span>
                  </label>
                  <input
                    type="number"
                    name="amount"
                    value={formData.amount}
                    onChange={handleChange}
                    required
                    step="0.01"
                    min="0"
                    max={getBalanceDue()}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>

                {/* Currency */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Currency
                  </label>
                  <select
                    name="currency"
                    value={formData.currency}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="EUR">EUR (€)</option>
                    <option value="USD">USD ($)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>

                {/* Payment Method */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Payment Method
                  </label>
                  <select
                    name="payment_method"
                    value={formData.payment_method}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="airwallex">Airwallex</option>
                    <option value="tab">Tab</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="cash">Cash</option>
                    <option value="paypal">PayPal</option>
                    <option value="stripe">Stripe</option>
                    <option value="wise">Wise</option>
                  </select>
                </div>

                {/* Payment Status - Only for Itinerary */}
                {paymentTarget === 'itinerary' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Payment Status
                    </label>
                    <select
                      name="payment_status"
                      value={formData.payment_status}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="completed">Completed</option>
                      <option value="pending">Pending</option>
                      <option value="deposit_received">Deposit Received</option>
                      <option value="partially_paid">Partially Paid</option>
                      <option value="partially_refunded">Partially Refunded</option>
                      <option value="failed">Failed</option>
                      <option value="refunded">Fully Refunded</option>
                    </select>
                  </div>
                )}

                {/* Transaction Reference */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Transaction Reference
                  </label>
                  <input
                    type="text"
                    name="transaction_reference"
                    value={formData.transaction_reference}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="TXN-12345"
                  />
                </div>

                {/* Payment Date */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    name="payment_date"
                    value={formData.payment_date}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>

                {/* Due Date - Only for Itinerary */}
                {paymentTarget === 'itinerary' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Due Date (Optional)
                    </label>
                    <input
                      type="date"
                      name="due_date"
                      value={formData.due_date}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="mt-4">
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Add any additional notes about this payment..."
                />
              </div>

              {/* Submit */}
              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                <Link
                  href="/payments"
                  className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={loading || !formData.target_id || !formData.amount}
                  className={`px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors font-semibold flex items-center gap-2 ${
                    (loading || !formData.target_id || !formData.amount) ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Recording...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Record Payment
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {/* Show prompt if no target selected */}
          {!paymentTarget && (
            <div className="text-center py-8 text-gray-500">
              <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm">Select whether to record payment against an Invoice or Itinerary</p>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}