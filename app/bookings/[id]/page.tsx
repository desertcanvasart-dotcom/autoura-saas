'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import {
  BookOpen, User, Calendar, DollarSign, ArrowLeft, Edit2,
  Users, CreditCard, FileText, CheckCircle2, Clock, Plane,
  PartyPopper, XCircle, Mail, MessageSquare, Plus, Trash2,
  Download, AlertCircle, X as XIcon
} from 'lucide-react'

interface Booking {
  id: string
  booking_number: string
  status: string
  trip_name: string
  start_date: string
  end_date: string
  total_days: number
  num_travelers: number
  total_amount: number
  total_paid: number
  balance_due: number
  deposit_amount: number
  currency: string
  booking_date: string
  confirmation_date: string | null
  payment_deadline: string | null
  quote_type: string
  special_requests: string | null
  internal_notes: string | null
  clients: {
    id: string
    full_name: string
    email: string
    whatsapp: string | null
  } | null
  b2b_partners: {
    id: string
    company_name: string
    email: string
  } | null
  itineraries: {
    id: string
    itinerary_code: string
    trip_name: string
  } | null
}

interface Passenger {
  id: string
  title: string | null
  first_name: string
  last_name: string
  full_name: string
  date_of_birth: string | null
  nationality: string | null
  passport_number: string | null
  passenger_type: string
  is_lead_passenger: boolean
  email: string | null
  phone: string | null
}

interface Payment {
  id: string
  payment_number: string
  amount: number
  currency: string
  payment_type: string
  payment_method: string | null
  payment_date: string | null
  status: string
  transaction_reference: string | null
  notes: string | null
}

interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

const STATUS_COLORS: Record<string, { bg: string; text: string; icon: any }> = {
  pending_deposit: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock },
  confirmed: { bg: 'bg-blue-100', text: 'text-blue-700', icon: CheckCircle2 },
  paid_full: { bg: 'bg-green-100', text: 'text-green-700', icon: DollarSign },
  in_progress: { bg: 'bg-purple-100', text: 'text-purple-700', icon: Plane },
  completed: { bg: 'bg-gray-100', text: 'text-gray-700', icon: PartyPopper },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle }
}

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [passengers, setPassengers] = useState<Passenger[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [toasts, setToasts] = useState<Toast[]>([])

  // New passenger form
  const [showAddPassenger, setShowAddPassenger] = useState(false)
  const [passengerForm, setPassengerForm] = useState({
    first_name: '',
    last_name: '',
    passport_number: '',
    passenger_type: 'adult',
    is_lead_passenger: false
  })

  // New payment form
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_type: 'deposit',
    payment_method: 'bank_transfer',
    transaction_reference: '',
    notes: ''
  })

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  useEffect(() => {
    fetchBooking()
    fetchPassengers()
    fetchPayments()
  }, [resolvedParams.id])

  const fetchBooking = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/bookings/${resolvedParams.id}`)
      const data = await response.json()

      if (data.success) {
        setBooking(data.data)
      } else {
        showToast('error', data.error || 'Failed to fetch booking')
      }
    } catch (err: any) {
      showToast('error', err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchPassengers = async () => {
    try {
      const response = await fetch(`/api/bookings/${resolvedParams.id}/passengers`)
      const data = await response.json()

      if (data.success) {
        setPassengers(data.data || [])
      }
    } catch (err: any) {
      console.error('Error fetching passengers:', err)
    }
  }

  const fetchPayments = async () => {
    try {
      const response = await fetch(`/api/bookings/${resolvedParams.id}/payments`)
      const data = await response.json()

      if (data.success) {
        setPayments(data.data || [])
      }
    } catch (err: any) {
      console.error('Error fetching payments:', err)
    }
  }

  const handleAddPassenger = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const response = await fetch(`/api/bookings/${resolvedParams.id}/passengers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(passengerForm)
      })

      const data = await response.json()

      if (data.success) {
        showToast('success', 'Passenger added successfully')
        setShowAddPassenger(false)
        setPassengerForm({
          first_name: '',
          last_name: '',
          passport_number: '',
          passenger_type: 'adult',
          is_lead_passenger: false
        })
        fetchPassengers()
      } else {
        showToast('error', data.error || 'Failed to add passenger')
      }
    } catch (err: any) {
      showToast('error', err.message)
    }
  }

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const response = await fetch(`/api/bookings/${resolvedParams.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...paymentForm,
          amount: parseFloat(paymentForm.amount)
        })
      })

      const data = await response.json()

      if (data.success) {
        showToast('success', `Payment recorded. Booking status: ${data.booking_status}`)
        setShowAddPayment(false)
        setPaymentForm({
          amount: '',
          payment_type: 'deposit',
          payment_method: 'bank_transfer',
          transaction_reference: '',
          notes: ''
        })
        fetchPayments()
        fetchBooking() // Refresh to get updated payment totals
      } else {
        showToast('error', data.error || 'Failed to record payment')
      }
    } catch (err: any) {
      showToast('error', err.message)
    }
  }

  const handleSendConfirmation = async (sendVia: 'email' | 'whatsapp') => {
    try {
      const response = await fetch(`/api/bookings/${resolvedParams.id}/send-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send_via: sendVia })
      })

      const data = await response.json()

      if (data.success) {
        showToast('info', data.message)
      } else {
        showToast('error', data.error || 'Failed to send confirmation')
      }
    } catch (err: any) {
      showToast('error', err.message)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Loading booking...</p>
        </div>
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <p className="text-gray-600">Booking not found</p>
      </div>
    )
  }

  const statusConfig = STATUS_COLORS[booking.status] || STATUS_COLORS.pending_deposit
  const StatusIcon = statusConfig.icon
  const paymentProgress = (booking.total_paid / booking.total_amount) * 100

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => router.push('/bookings')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{booking.booking_number}</h1>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusConfig.bg} ${statusConfig.text} flex items-center gap-1`}>
                  <StatusIcon className="w-4 h-4" />
                  {booking.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">{booking.trip_name}</p>
            </div>

            {/* Action Buttons */}
            {booking.quote_type === 'b2c' && booking.clients && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleSendConfirmation('email')}
                  className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 flex items-center gap-2 text-sm font-medium"
                >
                  <Mail className="w-4 h-4" />
                  Send Email
                </button>
                {booking.clients.whatsapp && (
                  <button
                    onClick={() => handleSendConfirmation('whatsapp')}
                    className="px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 flex items-center gap-2 text-sm font-medium"
                  >
                    <MessageSquare className="w-4 h-4" />
                    WhatsApp
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200">
            {['overview', 'passengers', 'payments', 'documents'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? 'text-green-700 border-b-2 border-green-700'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Booking Info */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Booking Information</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-sm text-gray-500">Booking Number</label>
                  <p className="font-medium text-gray-900">{booking.booking_number}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Booking Date</label>
                  <p className="font-medium text-gray-900">
                    {new Date(booking.booking_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Client</label>
                  <p className="font-medium text-gray-900">
                    {booking.clients?.full_name || booking.b2b_partners?.company_name || 'N/A'}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Quote Type</label>
                  <p className="font-medium text-gray-900">{booking.quote_type.toUpperCase()}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Travel Dates</label>
                  <p className="font-medium text-gray-900">
                    {new Date(booking.start_date).toLocaleDateString()} - {new Date(booking.end_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Duration</label>
                  <p className="font-medium text-gray-900">{booking.total_days} days</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Number of Travelers</label>
                  <p className="font-medium text-gray-900">{booking.num_travelers}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Confirmation Date</label>
                  <p className="font-medium text-gray-900">
                    {booking.confirmation_date
                      ? new Date(booking.confirmation_date).toLocaleDateString()
                      : 'Not confirmed yet'}
                  </p>
                </div>
              </div>

              {booking.special_requests && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <label className="text-sm text-gray-500">Special Requests</label>
                  <p className="mt-1 text-gray-900">{booking.special_requests}</p>
                </div>
              )}
            </div>

            {/* Payment Summary */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Amount</span>
                  <span className="text-xl font-bold text-gray-900">
                    {booking.currency} {booking.total_amount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Paid</span>
                  <span className="text-lg font-semibold text-green-600">
                    {booking.currency} {booking.total_paid.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Balance Due</span>
                  <span className="text-lg font-semibold text-red-600">
                    {booking.currency} {booking.balance_due.toFixed(2)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 mt-2">
                  <div
                    className="bg-green-600 h-3 rounded-full transition-all"
                    style={{ width: `${paymentProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-500 text-center">
                  {paymentProgress.toFixed(0)}% paid
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Passengers Tab */}
        {activeTab === 'passengers' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">
                Passengers ({passengers.length})
              </h3>
              <button
                onClick={() => setShowAddPassenger(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Passenger
              </button>
            </div>

            {/* Add Passenger Form */}
            {showAddPassenger && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <form onSubmit={handleAddPassenger} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        First Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={passengerForm.first_name}
                        onChange={(e) => setPassengerForm({ ...passengerForm, first_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Last Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={passengerForm.last_name}
                        onChange={(e) => setPassengerForm({ ...passengerForm, last_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Passport Number
                      </label>
                      <input
                        type="text"
                        value={passengerForm.passport_number}
                        onChange={(e) => setPassengerForm({ ...passengerForm, passport_number: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Passenger Type
                      </label>
                      <select
                        value={passengerForm.passenger_type}
                        onChange={(e) => setPassengerForm({ ...passengerForm, passenger_type: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                      >
                        <option value="adult">Adult</option>
                        <option value="child">Child</option>
                        <option value="infant">Infant</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_lead"
                      checked={passengerForm.is_lead_passenger}
                      onChange={(e) => setPassengerForm({ ...passengerForm, is_lead_passenger: e.target.checked })}
                      className="w-4 h-4 text-green-600 border-gray-300 rounded"
                    />
                    <label htmlFor="is_lead" className="text-sm text-gray-700">
                      Lead Passenger
                    </label>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowAddPassenger(false)}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Add Passenger
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Passengers List */}
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-200">
              {passengers.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p>No passengers added yet</p>
                </div>
              ) : (
                passengers.map((passenger) => (
                  <div key={passenger.id} className="p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-gray-900">{passenger.full_name}</h4>
                          {passenger.is_lead_passenger && (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                              Lead
                            </span>
                          )}
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full capitalize">
                            {passenger.passenger_type}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-gray-600 space-y-1">
                          {passenger.passport_number && (
                            <p>Passport: {passenger.passport_number}</p>
                          )}
                          {passenger.nationality && <p>Nationality: {passenger.nationality}</p>}
                          {passenger.date_of_birth && (
                            <p>DOB: {new Date(passenger.date_of_birth).toLocaleDateString()}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Payments Tab */}
        {activeTab === 'payments' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">
                Payment History ({payments.length})
              </h3>
              <button
                onClick={() => setShowAddPayment(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Record Payment
              </button>
            </div>

            {/* Add Payment Form */}
            {showAddPayment && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <form onSubmit={handleAddPayment} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Amount *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={paymentForm.amount}
                        onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Payment Type
                      </label>
                      <select
                        value={paymentForm.payment_type}
                        onChange={(e) => setPaymentForm({ ...paymentForm, payment_type: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                      >
                        <option value="deposit">Deposit</option>
                        <option value="installment">Installment</option>
                        <option value="balance">Balance</option>
                        <option value="full_payment">Full Payment</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Payment Method
                      </label>
                      <select
                        value={paymentForm.payment_method}
                        onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                      >
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="credit_card">Credit Card</option>
                        <option value="cash">Cash</option>
                        <option value="paypal">PayPal</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Transaction Reference
                      </label>
                      <input
                        type="text"
                        value={paymentForm.transaction_reference}
                        onChange={(e) => setPaymentForm({ ...paymentForm, transaction_reference: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={paymentForm.notes}
                      onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowAddPayment(false)}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Record Payment
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Payments List */}
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-200">
              {payments.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p>No payments recorded yet</p>
                </div>
              ) : (
                payments.map((payment) => (
                  <div key={payment.id} className="p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-gray-900">{payment.payment_number}</h4>
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full capitalize">
                            {payment.payment_type.replace('_', ' ')}
                          </span>
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full capitalize">
                            {payment.status}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-4 text-sm text-gray-600">
                          <div>
                            <span className="text-gray-500">Amount:</span>{' '}
                            <span className="font-medium text-gray-900">
                              {payment.currency} {payment.amount.toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Method:</span>{' '}
                            <span className="capitalize">{payment.payment_method?.replace('_', ' ')}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Date:</span>{' '}
                            {payment.payment_date
                              ? new Date(payment.payment_date).toLocaleDateString()
                              : 'N/A'}
                          </div>
                        </div>
                        {payment.transaction_reference && (
                          <p className="mt-1 text-xs text-gray-500">
                            Ref: {payment.transaction_reference}
                          </p>
                        )}
                        {payment.notes && (
                          <p className="mt-1 text-sm text-gray-600">{payment.notes}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Documents</h3>
            <p className="text-sm text-gray-500">
              Document management will be available soon
            </p>
          </div>
        )}
      </div>

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg min-w-[300px] ${
                toast.type === 'success' ? 'bg-green-50 border-green-200' :
                toast.type === 'error' ? 'bg-red-50 border-red-200' :
                'bg-blue-50 border-blue-200'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : toast.type === 'error' ? (
                <AlertCircle className="w-5 h-5 text-red-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-blue-600" />
              )}
              <span className={`text-sm font-medium flex-1 ${
                toast.type === 'success' ? 'text-green-800' :
                toast.type === 'error' ? 'text-red-800' :
                'text-blue-800'
              }`}>{toast.message}</span>
              <button
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="hover:opacity-70"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
