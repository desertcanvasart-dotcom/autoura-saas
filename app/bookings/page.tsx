'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  BookOpen, User, Calendar, Eye, DollarSign, Filter, Search,
  ChevronRight, AlertCircle, Loader2, Clock, CheckCircle2,
  Plane, PartyPopper, XCircle
} from 'lucide-react'

interface Booking {
  id: string
  booking_number: string
  status: string
  trip_name: string
  start_date: string
  end_date: string
  num_travelers: number
  total_amount: number
  total_paid: number
  balance_due: number
  currency: string
  booking_date: string
  quote_type: string
  created_at: string
  clients: {
    id: string
    full_name: string
    email: string
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

const STATUS_COLORS: Record<string, { bg: string; text: string; icon: any }> = {
  pending_deposit: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock },
  confirmed: { bg: 'bg-blue-100', text: 'text-blue-700', icon: CheckCircle2 },
  paid_full: { bg: 'bg-green-100', text: 'text-green-700', icon: DollarSign },
  in_progress: { bg: 'bg-purple-100', text: 'text-purple-700', icon: Plane },
  completed: { bg: 'bg-gray-100', text: 'text-gray-700', icon: PartyPopper },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle }
}

const STATUS_LABELS: Record<string, string> = {
  pending_deposit: 'Pending Deposit',
  confirmed: 'Confirmed',
  paid_full: 'Paid in Full',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled'
}

export default function BookingsPage() {
  const router = useRouter()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchBookings()
  }, [statusFilter])

  const fetchBookings = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== 'all') {
        params.append('status', statusFilter)
      }

      const response = await fetch(`/api/bookings?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setBookings(data.data || [])
      } else {
        setError(data.error || 'Failed to fetch bookings')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredBookings = bookings.filter(booking => {
    if (!searchQuery) return true
    const search = searchQuery.toLowerCase()
    return (
      booking.booking_number.toLowerCase().includes(search) ||
      booking.trip_name?.toLowerCase().includes(search) ||
      booking.clients?.full_name?.toLowerCase().includes(search) ||
      booking.b2b_partners?.company_name?.toLowerCase().includes(search)
    )
  })

  // Calculate status counts from all bookings
  const statusCounts = {
    all: bookings.length,
    pending_deposit: bookings.filter(b => b.status === 'pending_deposit').length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    paid_full: bookings.filter(b => b.status === 'paid_full').length,
    in_progress: bookings.filter(b => b.status === 'in_progress').length,
    completed: bookings.filter(b => b.status === 'completed').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length
  }

  const stats = {
    total: bookings.length,
    pending: statusCounts.pending_deposit,
    confirmed: statusCounts.confirmed + statusCounts.paid_full,
    inProgress: statusCounts.in_progress,
    completed: statusCounts.completed
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <BookOpen className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
                <p className="text-sm text-gray-500">Manage confirmed trips and payments</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-5 gap-4 mt-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-xs text-gray-500">Total Bookings</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-yellow-700">{stats.pending}</div>
              <div className="text-xs text-yellow-600">Pending Deposit</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-blue-700">{stats.confirmed}</div>
              <div className="text-xs text-blue-600">Confirmed</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-purple-700">{stats.inProgress}</div>
              <div className="text-xs text-purple-600">In Progress</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-700">{stats.completed}</div>
              <div className="text-xs text-green-600">Completed</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by booking #, client name, or trip..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                aria-label="Filter bookings by status"
              >
                <option value="all">All Status ({statusCounts.all})</option>
                <option value="pending_deposit">Pending Deposit ({statusCounts.pending_deposit})</option>
                <option value="confirmed">Confirmed ({statusCounts.confirmed})</option>
                <option value="paid_full">Paid in Full ({statusCounts.paid_full})</option>
                <option value="in_progress">In Progress ({statusCounts.in_progress})</option>
                <option value="completed">Completed ({statusCounts.completed})</option>
                <option value="cancelled">Cancelled ({statusCounts.cancelled})</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Bookings List */}
      <div className="max-w-7xl mx-auto px-4 pb-8">
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading bookings...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Error loading bookings</p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
            </div>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-sm font-medium text-gray-600 mb-1">
              {searchQuery ? 'No bookings found' : 'No bookings yet'}
            </h3>
            <p className="text-xs text-gray-400">
              {searchQuery ? 'Try adjusting your search filters' : 'Bookings will appear here when quotes are accepted'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBookings.map((booking) => {
              const statusConfig = STATUS_COLORS[booking.status] || STATUS_COLORS.pending_deposit
              const StatusIcon = statusConfig.icon
              const paymentProgress = (booking.total_paid / booking.total_amount) * 100

              return (
                <Link
                  key={booking.id}
                  href={`/bookings/${booking.id}`}
                  className="block bg-white rounded-xl border-2 border-gray-200 p-4 hover:border-green-300 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-lg font-bold text-gray-900">{booking.booking_number}</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text} flex items-center gap-1`}>
                          <StatusIcon className="w-3 h-3" />
                          {STATUS_LABELS[booking.status]}
                        </span>
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {booking.quote_type.toUpperCase()}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="flex items-center gap-2 text-gray-500 mb-1">
                            <User className="w-4 h-4" />
                            <span className="text-xs">Client</span>
                          </div>
                          <div className="font-medium text-gray-900">
                            {booking.clients?.full_name || booking.b2b_partners?.company_name || 'No client'}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center gap-2 text-gray-500 mb-1">
                            <BookOpen className="w-4 h-4" />
                            <span className="text-xs">Trip</span>
                          </div>
                          <div className="font-medium text-gray-900 truncate">
                            {booking.trip_name}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center gap-2 text-gray-500 mb-1">
                            <Calendar className="w-4 h-4" />
                            <span className="text-xs">Travel Dates</span>
                          </div>
                          <div className="font-medium text-gray-900 text-xs">
                            {new Date(booking.start_date).toLocaleDateString()} - {new Date(booking.end_date).toLocaleDateString()}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center gap-2 text-gray-500 mb-1">
                            <DollarSign className="w-4 h-4" />
                            <span className="text-xs">Payment</span>
                          </div>
                          <div className="font-medium text-gray-900">
                            {booking.currency} {booking.total_paid.toFixed(0)} / {booking.total_amount.toFixed(0)}
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                            <div
                              className="bg-green-600 h-1.5 rounded-full"
                              style={{ width: `${paymentProgress}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="ml-6">
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {/* Results Count */}
        {!loading && !error && filteredBookings.length > 0 && (
          <div className="mt-4 text-center text-sm text-gray-600">
            Showing <span className="font-medium">{filteredBookings.length}</span> of{' '}
            <span className="font-medium">{bookings.length}</span> bookings
          </div>
        )}
      </div>
    </div>
  )
}
