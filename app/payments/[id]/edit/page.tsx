'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'

interface Payment {
  id: string
  itinerary_id: string
  itinerary_code: string
  client_name: string
  payment_type: string
  amount: number
  currency: string
  payment_method: string
  payment_status: string
  transaction_reference: string
  payment_date: string
  due_date: string
  notes: string
}

export default function EditPaymentPage() {
  const params = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)

  const [formData, setFormData] = useState({
    payment_type: '',
    amount: '',
    currency: 'EUR',
    payment_method: '',
    payment_status: '',
    transaction_reference: '',
    payment_date: '',
    due_date: '',
    notes: ''
  })

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
        setFormData({
          payment_type: data.data.payment_type,
          amount: data.data.amount.toString(),
          currency: data.data.currency,
          payment_method: data.data.payment_method,
          payment_status: data.data.payment_status,
          transaction_reference: data.data.transaction_reference || '',
          payment_date: data.data.payment_date || '',
          due_date: data.data.due_date || '',
          notes: data.data.notes || ''
        })
      }
    } catch (error) {
      console.error('Error fetching payment:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    if (!formData.amount) {
      setError('Please fill in all required fields')
      setSaving(false)
      return
    }

    try {
      const response = await fetch(`/api/payments/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount)
        })
      })

      const data = await response.json()

      if (data.success) {
        router.push(`/payments/${params.id}`)
      } else {
        setError(data.error || 'Failed to update payment')
      }
    } catch (err) {
      setError('Error updating payment')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading payment...</p>
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

  return (
    <div className="p-4 lg:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Edit Payment</h1>
            <p className="text-sm text-gray-600 mt-1">Update payment information</p>
          </div>
          <Link
            href={`/payments/${params.id}`}
            className="bg-gray-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-gray-700 transition-colors font-medium flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Payment
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {error && (
            <div className="mb-4 p-3 bg-danger/10 border-l-4 border-danger rounded">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          {/* Payment Info */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Payment For</h3>
            <div className="text-xs">
              <p className="font-medium">{payment.client_name}</p>
              <p className="text-gray-600 font-mono">{payment.itinerary_code}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Payment Type */}
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
                <option value="deposit">Deposit</option>
                <option value="installment">Installment</option>
                <option value="final">Final Payment</option>
                <option value="full">Full Payment</option>
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Amount (€) <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                required
                step="1"
                min="0"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                <option value="tab">Tab</option>
                <option value="cash">Cash</option>
                <option value="paypal">PayPal</option>
                <option value="stripe">Stripe</option>
              </select>
            </div>

            {/* Payment Status */}
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

            {/* Due Date */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Due Date
              </label>
              <input
                type="date"
                name="due_date"
                value={formData.due_date}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
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
              placeholder="Add any additional notes..."
            />
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
            <Link
              href={`/payments/${params.id}`}
              className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className={`px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors font-semibold flex items-center gap-2 ${
                saving ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Update Payment
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}