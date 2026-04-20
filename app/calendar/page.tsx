'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  List,
  LayoutGrid,
  AlertCircle,
  Move,
  Filter,
  X,
  Search,
  TrendingUp,
  Users,
  DollarSign,
  PieChart,
  Download,
  Eye,
  EyeOff,
  User,
  Car
} from 'lucide-react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isWithinInterval,
  parseISO,
  differenceInDays,
  startOfDay,
  endOfDay,
  isAfter,
  isBefore
} from 'date-fns'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  closestCenter
} from '@dnd-kit/core'

interface BookingResource {
  id: string
  resource_type: string
  resource_id: string
  resource_name: string
  start_date: string
  end_date: string
  status: string
}

interface Booking {
  id: string
  itinerary_code: string
  client_name: string
  start_date: string
  end_date: string
  num_travelers: number
  payment_status: string
  total_cost: number
  destinations: string
  assigned_guide_id?: string | null
  assigned_vehicle_id?: string | null
  guide_name?: string
  vehicle_name?: string
  resources: BookingResource[]
}

interface Guide {
  id: string
  name: string
}

interface Vehicle {
  id: string
  name: string
}

type ViewMode = 'month' | 'week' | 'timeline'

interface Filters {
  paymentStatus: string[]
  searchQuery: string
  dateFrom: string
  dateTo: string
  showConflictsOnly: boolean
  hideCompleted: boolean
  guideId: string
  vehicleId: string
}

interface Stats {
  totalBookings: number
  totalRevenue: number
  totalTravelers: number
  statusBreakdown: { [key: string]: number }
  upcomingBookings: number
  conflictCount: number
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [bookings, setBookings] = useState<Booking[]>([])
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([])
  const [guides, setGuides] = useState<Guide[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [conflicts, setConflicts] = useState<string[]>([])
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [pendingMove, setPendingMove] = useState<{ bookingId: string, newDate: Date } | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showStats, setShowStats] = useState(true)
  const [stats, setStats] = useState<Stats>({
    totalBookings: 0,
    totalRevenue: 0,
    totalTravelers: 0,
    statusBreakdown: {},
    upcomingBookings: 0,
    conflictCount: 0
  })

  const [filters, setFilters] = useState<Filters>({
    paymentStatus: [],
    searchQuery: '',
    dateFrom: '',
    dateTo: '',
    showConflictsOnly: false,
    hideCompleted: false,
    guideId: '',
    vehicleId: ''
  })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (bookings.length > 0) {
      detectConflicts()
      applyFilters()
    }
  }, [bookings, filters])

  useEffect(() => {
    calculateStats()
  }, [filteredBookings, conflicts])

  const fetchData = async () => {
    try {
      const [bookingsResponse, resourcesResponse, guidesResponse, vehiclesResponse] = await Promise.all([
        fetch('/api/itineraries'),
        fetch('/api/itinerary-resources'),
        fetch('/api/guides?is_active=true'),
        fetch('/api/vehicles?is_active=true'),
      ])

      const [bookingsData, resourcesData, guidesData, vehiclesData] = await Promise.all([
        bookingsResponse.json(),
        resourcesResponse.json(),
        guidesResponse.json(),
        vehiclesResponse.json(),
      ])

      if (guidesData.success) setGuides(guidesData.data)
      if (vehiclesData.success) setVehicles(vehiclesData.data)

      if (bookingsData.success) {
        // Build resource map: itinerary_id -> resources[]
        const resourceMap = new Map<string, BookingResource[]>()
        if (resourcesData.success && resourcesData.data) {
          for (const r of resourcesData.data) {
            const list = resourceMap.get(r.itinerary_id) || []
            list.push({
              id: r.id,
              resource_type: r.resource_type,
              resource_id: r.resource_id,
              resource_name: r.resource_name || '',
              start_date: r.start_date,
              end_date: r.end_date,
              status: r.status || 'confirmed',
            })
            resourceMap.set(r.itinerary_id, list)
          }
        }

        // Enrich bookings with resource data
        const validBookings = bookingsData.data
          .filter((b: any) => b.start_date && b.end_date)
          .map((b: any) => {
            const resources = resourceMap.get(b.id) || []
            const guide = resources.find(r => r.resource_type === 'guide')
            const vehicle = resources.find(r => r.resource_type === 'vehicle')
            return {
              ...b,
              resources,
              guide_name: guide?.resource_name || null,
              vehicle_name: vehicle?.resource_name || null,
            }
          })
        setBookings(validBookings)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const detectConflicts = () => {
    const conflictIds: string[] = []

    for (let i = 0; i < bookings.length; i++) {
      for (let j = i + 1; j < bookings.length; j++) {
        const b1 = bookings[i]
        const b2 = bookings[j]

        const start1 = parseISO(b1.start_date)
        const end1 = parseISO(b1.end_date)
        const start2 = parseISO(b2.start_date)
        const end2 = parseISO(b2.end_date)

        const datesOverlap = start1 <= end2 && end1 >= start2
        if (!datesOverlap) continue

        // Check if any resource is shared between the two bookings
        const hasSharedResource = b1.resources.some(r1 =>
          r1.resource_id && b2.resources.some(r2 =>
            r2.resource_type === r1.resource_type && r2.resource_id === r1.resource_id
          )
        )

        // Also check legacy fields
        const sharedGuide = b1.assigned_guide_id && b2.assigned_guide_id && b1.assigned_guide_id === b2.assigned_guide_id
        const sharedVehicle = b1.assigned_vehicle_id && b2.assigned_vehicle_id && b1.assigned_vehicle_id === b2.assigned_vehicle_id

        if (hasSharedResource || sharedGuide || sharedVehicle) {
          if (!conflictIds.includes(b1.id)) conflictIds.push(b1.id)
          if (!conflictIds.includes(b2.id)) conflictIds.push(b2.id)
        }
      }
    }

    setConflicts(conflictIds)
  }

  const applyFilters = () => {
    let filtered = [...bookings]

    if (filters.paymentStatus.length > 0) {
      filtered = filtered.filter(b => filters.paymentStatus.includes(b.payment_status))
    }

    if (filters.guideId) {
      if (filters.guideId === 'unassigned') {
        filtered = filtered.filter(b => !b.assigned_guide_id && !b.resources.some(r => r.resource_type === 'guide'))
      } else {
        filtered = filtered.filter(b => b.assigned_guide_id === filters.guideId || b.resources.some(r => r.resource_type === 'guide' && r.resource_id === filters.guideId))
      }
    }

    if (filters.vehicleId) {
      if (filters.vehicleId === 'unassigned') {
        filtered = filtered.filter(b => !b.assigned_vehicle_id && !b.resources.some(r => r.resource_type === 'vehicle'))
      } else {
        filtered = filtered.filter(b => b.assigned_vehicle_id === filters.vehicleId || b.resources.some(r => r.resource_type === 'vehicle' && r.resource_id === filters.vehicleId))
      }
    }

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase()
      filtered = filtered.filter(b => 
        b.client_name.toLowerCase().includes(query) ||
        b.itinerary_code.toLowerCase().includes(query) ||
        b.destinations?.toLowerCase().includes(query) ||
        b.guide_name?.toLowerCase().includes(query) ||
        b.vehicle_name?.toLowerCase().includes(query)
      )
    }

    if (filters.dateFrom) {
      const fromDate = parseISO(filters.dateFrom)
      filtered = filtered.filter(b => {
        const bookingStart = parseISO(b.start_date)
        return isAfter(bookingStart, fromDate) || isSameDay(bookingStart, fromDate)
      })
    }

    if (filters.dateTo) {
      const toDate = parseISO(filters.dateTo)
      filtered = filtered.filter(b => {
        const bookingEnd = parseISO(b.end_date)
        return isBefore(bookingEnd, toDate) || isSameDay(bookingEnd, toDate)
      })
    }

    if (filters.showConflictsOnly) {
      filtered = filtered.filter(b => conflicts.includes(b.id))
    }

    if (filters.hideCompleted) {
      filtered = filtered.filter(b => b.payment_status !== 'completed')
    }

    setFilteredBookings(filtered)
  }

  const calculateStats = () => {
    const totalBookings = filteredBookings.length
    const totalRevenue = filteredBookings.reduce((sum, b) => sum + (b.total_cost || 0), 0)
    const totalTravelers = filteredBookings.reduce((sum, b) => sum + (b.num_travelers || 0), 0)
    
    const statusBreakdown: { [key: string]: number } = {}
    filteredBookings.forEach(b => {
      statusBreakdown[b.payment_status] = (statusBreakdown[b.payment_status] || 0) + 1
    })

    const today = startOfDay(new Date())
    const upcomingBookings = filteredBookings.filter(b => {
      const bookingStart = parseISO(b.start_date)
      return isAfter(bookingStart, today) || isSameDay(bookingStart, today)
    }).length

    setStats({
      totalBookings,
      totalRevenue,
      totalTravelers,
      statusBreakdown,
      upcomingBookings,
      conflictCount: conflicts.length
    })
  }

  const clearFilters = () => {
    setFilters({
      paymentStatus: [],
      searchQuery: '',
      dateFrom: '',
      dateTo: '',
      showConflictsOnly: false,
      hideCompleted: false,
      guideId: '',
      vehicleId: ''
    })
  }

  const activeFilterCount = () => {
    let count = 0
    if (filters.paymentStatus.length > 0) count++
    if (filters.searchQuery) count++
    if (filters.dateFrom || filters.dateTo) count++
    if (filters.showConflictsOnly) count++
    if (filters.hideCompleted) count++
    if (filters.guideId) count++
    if (filters.vehicleId) count++
    return count
  }

  const exportToCSV = () => {
    const headers = ['Code', 'Client', 'Start Date', 'End Date', 'Travelers', 'Payment Status', 'Total Cost', 'Destinations', 'Guide', 'Vehicle']
    const rows = filteredBookings.map(b => [
      b.itinerary_code,
      b.client_name,
      b.start_date,
      b.end_date,
      b.num_travelers,
      b.payment_status,
      b.total_cost,
      b.destinations || '',
      b.guide_name || 'Unassigned',
      b.vehicle_name || 'Unassigned'
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bookings-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
  }

  const getBookingsForDate = (date: Date) => {
    return filteredBookings.filter(booking => {
      const start = startOfDay(parseISO(booking.start_date))
      const end = endOfDay(parseISO(booking.end_date))
      return isWithinInterval(date, { start, end })
    })
  }

  const getStatusColor = (status: string) => {
    const colors: any = {
      'not_paid': 'bg-gray-400',
      'deposit_received': 'bg-blue-500',
      'partially_paid': 'bg-yellow-500',
      'paid': 'bg-green-500',
      'completed': 'bg-green-600'
    }
    return colors[status] || 'bg-gray-400'
  }

  const getStatusLabel = (status: string) => {
    const labels: any = {
      'not_paid': 'Not Paid',
      'deposit_received': 'Deposit',
      'partially_paid': 'Partial',
      'paid': 'Paid',
      'completed': 'Completed'
    }
    return labels[status] || status
  }

  const handleDragStart = (event: DragStartEvent) => {
    const booking = filteredBookings.find(b => b.id === event.active.id)
    setActiveBooking(booking || null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveBooking(null)
    
    const { active, over } = event
    
    if (!over) return
    
    const bookingId = active.id as string
    const newDateStr = over.id as string
    
    if (!newDateStr.startsWith('date-')) return
    
    const newDate = new Date(newDateStr.replace('date-', ''))
    const booking = filteredBookings.find(b => b.id === bookingId)
    
    if (!booking) return
    
    if (newDate < startOfDay(new Date())) {
      alert('Cannot move booking to a past date')
      return
    }
    
    const currentStart = startOfDay(parseISO(booking.start_date))
    if (isSameDay(currentStart, newDate)) {
      return
    }
    
    setPendingMove({ bookingId, newDate })
    setShowConfirmModal(true)
  }

  const confirmMove = async () => {
    if (!pendingMove) return
    
    const { bookingId, newDate } = pendingMove
    const booking = filteredBookings.find(b => b.id === bookingId)
    
    if (!booking) return
    
    const currentStart = parseISO(booking.start_date)
    const currentEnd = parseISO(booking.end_date)
    const duration = differenceInDays(currentEnd, currentStart)
    const newEndDate = addDays(newDate, duration)
    
    try {
      const response = await fetch(`/api/itineraries/${bookingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_date: format(newDate, 'yyyy-MM-dd'),
          end_date: format(newEndDate, 'yyyy-MM-dd')
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setBookings(prev => prev.map(b => 
          b.id === bookingId 
            ? { 
                ...b, 
                start_date: format(newDate, 'yyyy-MM-dd'),
                end_date: format(newEndDate, 'yyyy-MM-dd')
              }
            : b
        ))
        
        setShowConfirmModal(false)
        setPendingMove(null)
      } else {
        alert('Failed to update booking: ' + data.error)
      }
    } catch (error) {
      console.error('Error updating booking:', error)
      alert('Failed to update booking')
    }
  }

  const cancelMove = () => {
    setShowConfirmModal(false)
    setPendingMove(null)
  }

  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1))
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1))
  const today = () => setCurrentDate(new Date())

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading calendar...</p>
        </div>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="p-4 lg:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Booking Calendar</h1>
            <p className="text-sm text-gray-600 mt-1">
              View and manage all your bookings • Drag to reschedule
              {activeFilterCount() > 0 && ` • ${activeFilterCount()} filter${activeFilterCount() > 1 ? 's' : ''} active`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowStats(!showStats)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors"
            >
              {showStats ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span className="font-medium">{showStats ? 'Hide' : 'Show'} Stats</span>
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors relative"
            >
              <Filter className="w-4 h-4" />
              <span className="font-medium">Filters</span>
              {activeFilterCount() > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary-600 text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {activeFilterCount()}
                </span>
              )}
            </button>
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="font-medium">Export</span>
            </button>
          </div>
        </div>

        {/* Statistics Panel */}
        {showStats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              icon={<CalendarIcon className="w-4 h-4" />}
              label="Total Bookings"
              value={stats.totalBookings}
              color="blue"
            />
            <StatCard
              icon={<DollarSign className="w-4 h-4" />}
              label="Total Revenue"
              value={`€${stats.totalRevenue.toLocaleString()}`}
              color="green"
            />
            <StatCard
              icon={<Users className="w-4 h-4" />}
              label="Total Travelers"
              value={stats.totalTravelers}
              color="purple"
            />
            <StatCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Upcoming"
              value={stats.upcomingBookings}
              color="orange"
              badge={stats.conflictCount > 0 ? `${stats.conflictCount} conflicts` : undefined}
            />
          </div>
        )}

        {/* Payment Status Breakdown */}
        {showStats && Object.keys(stats.statusBreakdown).length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <PieChart className="w-4 h-4 text-primary-600" />
              <h3 className="text-base font-bold text-gray-900">Payment Status Breakdown</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {Object.entries(stats.statusBreakdown).map(([status, count]) => (
                <div key={status} className="text-center">
                  <div className={`w-12 h-12 mx-auto mb-2 rounded-full ${getStatusColor(status)} flex items-center justify-center text-white font-bold text-base`}>
                    {count}
                  </div>
                  <div className="text-xs font-medium text-gray-900">{getStatusLabel(status)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary-600" />
                <h3 className="text-base font-bold text-gray-900">Filters</h3>
              </div>
              {activeFilterCount() > 0 && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-2 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <X className="w-3 h-3" />
                  Clear All
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Search */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Client, code, destination..."
                    value={filters.searchQuery}
                    onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Guide Filter */}
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1">
                  <User className="w-3 h-3" />
                  Filter by Guide
                </label>
                <select
                  value={filters.guideId}
                  onChange={(e) => setFilters({ ...filters, guideId: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                >
                  <option value="">All Guides</option>
                  <option value="unassigned">Unassigned</option>
                  {guides.map(guide => (
                    <option key={guide.id} value={guide.id}>{guide.name}</option>
                  ))}
                </select>
              </div>

              {/* Vehicle Filter */}
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1">
                  <Car className="w-3 h-3" />
                  Filter by Vehicle
                </label>
                <select
                  value={filters.vehicleId}
                  onChange={(e) => setFilters({ ...filters, vehicleId: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                >
                  <option value="">All Vehicles</option>
                  <option value="unassigned">Unassigned</option>
                  {vehicles.map(vehicle => (
                    <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>
                  ))}
                </select>
              </div>

              {/* Payment Status */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Payment Status
                </label>
                <select
                  multiple
                  value={filters.paymentStatus}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, option => option.value)
                    setFilters({ ...filters, paymentStatus: selected })
                  }}
                  className="w-full p-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  style={{ height: '38px' }}
                >
                  <option value="not_paid">Not Paid</option>
                  <option value="deposit_received">Deposit Received</option>
                  <option value="partially_paid">Partially Paid</option>
                  <option value="paid">Paid</option>
                  <option value="completed">Completed</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple</p>
              </div>

              {/* Date From */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                />
              </div>
            </div>

            {/* Toggle Filters */}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-200">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.showConflictsOnly}
                  onChange={(e) => setFilters({ ...filters, showConflictsOnly: e.target.checked })}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-600"
                />
                <span className="text-xs font-medium text-gray-700">Show conflicts only</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.hideCompleted}
                  onChange={(e) => setFilters({ ...filters, hideCompleted: e.target.checked })}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-600"
                />
                <span className="text-xs font-medium text-gray-700">Hide completed bookings</span>
              </label>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={today}
                className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 font-medium"
              >
                Today
              </button>
              <button
                onClick={nextMonth}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <h2 className="text-lg font-bold text-gray-900 ml-3">
                {format(currentDate, 'MMMM yyyy')}
              </h2>
            </div>

            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('month')}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium flex items-center gap-2 transition-colors ${
                  viewMode === 'month' 
                    ? 'bg-white text-primary-600 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                Month
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium flex items-center gap-2 transition-colors ${
                  viewMode === 'week' 
                    ? 'bg-white text-primary-600 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <CalendarIcon className="w-4 h-4" />
                Week
              </button>
              <button
                onClick={() => setViewMode('timeline')}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium flex items-center gap-2 transition-colors ${
                  viewMode === 'timeline' 
                    ? 'bg-white text-primary-600 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <List className="w-4 h-4" />
                Timeline
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-200 flex-wrap text-xs">
            <div className="flex items-center gap-1.5">
              <Move className="w-3 h-3 text-primary-600" />
              <span className="text-gray-600">Drag to reschedule</span>
            </div>
            <div className="flex items-center gap-1.5">
              <User className="w-3 h-3 text-blue-600" />
              <span className="text-gray-600">Has Guide</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Car className="w-3 h-3 text-green-600" />
              <span className="text-gray-600">Has Vehicle</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-gray-400 rounded"></div>
              <span className="text-gray-600">Not Paid</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span className="text-gray-600">Deposit Received</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-yellow-500 rounded"></div>
              <span className="text-gray-600">Partially Paid</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span className="text-gray-600">Paid</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-orange-500 rounded border-2 border-orange-700"></div>
              <span className="text-gray-600">Conflict</span>
            </div>
          </div>

          {/* Results Summary */}
          {activeFilterCount() > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-600">
                Showing <span className="font-semibold text-gray-900">{filteredBookings.length}</span> of{' '}
                <span className="font-semibold text-gray-900">{bookings.length}</span> bookings
              </p>
            </div>
          )}
        </div>

        {/* Calendar Views */}
        {viewMode === 'month' && <MonthView currentDate={currentDate} bookings={filteredBookings} conflicts={conflicts} getBookingsForDate={getBookingsForDate} getStatusColor={getStatusColor} />}
        {viewMode === 'week' && <WeekView currentDate={currentDate} bookings={filteredBookings} conflicts={conflicts} getBookingsForDate={getBookingsForDate} getStatusColor={getStatusColor} />}
        {viewMode === 'timeline' && <TimelineView bookings={filteredBookings} conflicts={conflicts} getStatusColor={getStatusColor} />}

        {/* Drag Overlay */}
        <DragOverlay>
          {activeBooking && (
            <div className={`p-2 rounded-lg ${getStatusColor(activeBooking.payment_status)} text-white shadow-2xl opacity-90 cursor-grabbing`}>
              <div className="font-semibold text-xs">{activeBooking.client_name}</div>
              <div className="text-xs opacity-90">{activeBooking.itinerary_code}</div>
              {activeBooking.guide_name && (
                <div className="text-xs opacity-90 flex items-center gap-1 mt-1">
                  <User className="w-3 h-3" />
                  {activeBooking.guide_name}
                </div>
              )}
            </div>
          )}
        </DragOverlay>

        {/* Confirmation Modal */}
        {showConfirmModal && pendingMove && (
          <ConfirmMoveModal
            booking={bookings.find(b => b.id === pendingMove.bookingId)!}
            newDate={pendingMove.newDate}
            onConfirm={confirmMove}
            onCancel={cancelMove}
          />
        )}
      </div>
    </DndContext>
  )
}

// Stat Card Component
function StatCard({ icon, label, value, color, badge }: any) {
  const dotColors: any = {
    blue: 'bg-blue-600',
    green: 'bg-green-600',
    purple: 'bg-purple-600',
    orange: 'bg-orange-600',
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-gray-400">{icon}</div>
          <div className={`w-1.5 h-1.5 rounded-full ${dotColors[color]}`} />
        </div>
        {badge && (
          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">
            {badge}
          </span>
        )}
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-600 mt-1">{label}</div>
      </div>
    </div>
  )
}

function MonthView({ currentDate, bookings, conflicts, getBookingsForDate, getStatusColor }: any) {
  const { useDroppable } = require('@dnd-kit/core')
  
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(monthStart)
  const startDate = startOfWeek(monthStart)
  const endDate = endOfWeek(monthEnd)

  const rows = []
  let days = []
  let day = startDate

  while (day <= endDate) {
    for (let i = 0; i < 7; i++) {
      const currentDay = day
      const dayBookings = getBookingsForDate(currentDay)
      const isCurrentMonth = isSameMonth(currentDay, monthStart)
      const isToday = isSameDay(currentDay, new Date())
      const isPast = currentDay < startOfDay(new Date())

      days.push(
        <CalendarCell
          key={currentDay.toString()}
          date={currentDay}
          bookings={dayBookings}
          isCurrentMonth={isCurrentMonth}
          isToday={isToday}
          isPast={isPast}
          conflicts={conflicts}
          getStatusColor={getStatusColor}
        />
      )
      day = addDays(day, 1)
    }
    rows.push(
      <div key={day.toString()} className="grid grid-cols-7">
        {days}
      </div>
    )
    days = []
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-7 bg-gray-50">
        {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
          <div key={day} className="p-2 text-center font-semibold text-xs text-gray-600">
            {day}
          </div>
        ))}
      </div>
      <div>{rows}</div>
    </div>
  )
}

function CalendarCell({ date, bookings, isCurrentMonth, isToday, isPast, conflicts, getStatusColor }: any) {
  const { useDroppable } = require('@dnd-kit/core')
  
  const { setNodeRef, isOver } = useDroppable({
    id: `date-${format(date, 'yyyy-MM-dd')}`,
    disabled: isPast
  })

  return (
    <div
      ref={setNodeRef}
      className={`min-h-24 border border-gray-200 p-1.5 transition-colors ${
        !isCurrentMonth ? 'bg-gray-50' : 'bg-white'
      } ${isToday ? 'ring-2 ring-primary-600' : ''} ${
        isOver && !isPast ? 'bg-primary-50 ring-2 ring-primary-400' : ''
      } ${isPast ? 'bg-gray-100 opacity-60' : ''}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-xs font-medium ${
          !isCurrentMonth ? 'text-gray-400' : isToday ? 'text-primary-600 font-bold' : 'text-gray-900'
        }`}>
          {format(date, 'd')}
        </span>
        {bookings.length > 0 && (
          <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full font-medium">
            {bookings.length}
          </span>
        )}
      </div>
      
      <div className="space-y-1">
        {bookings.slice(0, 3).map((booking: any) => (
          <DraggableBooking
            key={booking.id}
            booking={booking}
            getStatusColor={getStatusColor}
            conflicts={conflicts}
          />
        ))}
        {bookings.length > 3 && (
          <div className="text-xs text-gray-500 text-center">
            +{bookings.length - 3} more
          </div>
        )}
      </div>
    </div>
  )
}

function DraggableBooking({ booking, getStatusColor, conflicts }: any) {
  const { useDraggable } = require('@dnd-kit/core')
  
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: booking.id,
  })

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`text-xs p-1 rounded ${getStatusColor(booking.payment_status)} text-white hover:opacity-80 transition-opacity cursor-grab active:cursor-grabbing ${
        conflicts.includes(booking.id) ? 'ring-2 ring-orange-700' : ''
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="font-medium truncate flex items-center justify-between gap-1">
        <span className="truncate">{booking.client_name}</span>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {booking.guide_name && <span className="flex items-center gap-0.5" title={booking.guide_name}><User className="w-3 h-3" /></span>}
          {booking.vehicle_name && <span className="flex items-center gap-0.5" title={booking.vehicle_name}><Car className="w-3 h-3" /></span>}
        </div>
      </div>
      <div className="text-xs opacity-90 truncate">{booking.itinerary_code}</div>
    </div>
  )
}

function WeekView({ currentDate, bookings, conflicts, getBookingsForDate, getStatusColor }: any) {
  const weekStart = startOfWeek(currentDate)
  const weekDays = []
  
  for (let i = 0; i < 7; i++) {
    weekDays.push(addDays(weekStart, i))
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-7 gap-3 p-4">
        {weekDays.map(day => {
          const dayBookings = getBookingsForDate(day)
          const isToday = isSameDay(day, new Date())
          
          return (
            <div key={day.toString()} className="space-y-2">
              <div className={`text-center pb-2 border-b-2 ${
                isToday ? 'border-primary-600' : 'border-gray-200'
              }`}>
                <div className="text-xs text-gray-600 font-medium">
                  {format(day, 'EEE')}
                </div>
                <div className={`text-xl font-bold mt-1 ${
                  isToday ? 'text-primary-600' : 'text-gray-900'
                }`}>
                  {format(day, 'd')}
                </div>
              </div>

              <div className="space-y-1.5">
                {dayBookings.length === 0 ? (
                  <div className="text-center text-xs text-gray-400 py-6">
                    No bookings
                  </div>
                ) : (
                  dayBookings.map((booking: any) => (
                    <Link
                      key={booking.id}
                      href={`/itineraries/${booking.id}`}
                      className={`block p-2 rounded-lg ${getStatusColor(booking.payment_status)} text-white hover:opacity-80 transition-opacity ${
                        conflicts.includes(booking.id) ? 'ring-2 ring-orange-700' : ''
                      }`}
                    >
                      <div className="font-semibold text-xs mb-1">
                        {booking.client_name}
                      </div>
                      <div className="text-xs opacity-90 mb-1">
                        {booking.itinerary_code}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs opacity-75">
                        <span>{booking.num_travelers} pax</span>
                        {booking.guide_name && (
                          <span className="flex items-center gap-0.5" title={booking.guide_name}>
                            <User className="w-3 h-3" />
                            {booking.guide_name.split(' ')[0]}
                          </span>
                        )}
                        {booking.vehicle_name && (
                          <span className="flex items-center gap-0.5" title={booking.vehicle_name}>
                            <Car className="w-3 h-3" />
                            {booking.vehicle_name.split(' ')[0]}
                          </span>
                        )}
                      </div>
                      {conflicts.includes(booking.id) && (
                        <div className="flex items-center gap-1 mt-1.5 text-xs">
                          <AlertCircle className="w-3 h-3" />
                          <span>Conflict</span>
                        </div>
                      )}
                    </Link>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TimelineView({ bookings, conflicts, getStatusColor }: any) {
  const sortedBookings = [...bookings].sort((a, b) => 
    new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  )

  const allDates:Date[] = bookings.flatMap((b: Booking) => [
    parseISO(b.start_date),
    parseISO(b.end_date)
  ])
  const minDate = allDates.length > 0 ? new Date(Math.min(...allDates.map(d => d.getTime()))) : new Date()
  const maxDate = allDates.length > 0 ? new Date(Math.max(...allDates.map(d => d.getTime()))) : new Date()
  const totalDays = differenceInDays(maxDate, minDate) + 1

  const getBookingPosition = (booking: Booking) => {
    const start = parseISO(booking.start_date)
    const end = parseISO(booking.end_date)
    const daysFromStart = differenceInDays(start, minDate)
    const duration = differenceInDays(end, start) + 1
    
    return {
      left: `${(daysFromStart / totalDays) * 100}%`,
      width: `${(duration / totalDays) * 100}%`
    }
  }

  if (bookings.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <CalendarIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Bookings Match Filters</h3>
        <p className="text-sm text-gray-600">Try adjusting your filters to see more bookings</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 p-3">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span className="font-medium">{format(minDate, 'MMM d, yyyy')}</span>
          <span className="font-medium">{totalDays} days span</span>
          <span className="font-medium">{format(maxDate, 'MMM d, yyyy')}</span>
        </div>
      </div>

      <div className="p-4">
        <div className="space-y-3">
          {sortedBookings.map((booking: Booking) => {
            const position = getBookingPosition(booking)
            const hasConflict = conflicts.includes(booking.id)
            const duration = differenceInDays(parseISO(booking.end_date), parseISO(booking.start_date)) + 1
            
            return (
              <div key={booking.id} className="relative">
                <div className="flex items-center mb-1.5">
                  <div className="w-40 flex-shrink-0">
                    <Link 
                      href={`/itineraries/${booking.id}`}
                      className="text-sm font-medium text-gray-900 hover:text-primary-600 transition-colors"
                    >
                      {booking.client_name}
                    </Link>
                    <div className="text-xs text-gray-500 flex items-center gap-1.5">
                      <span>{booking.itinerary_code}</span>
                      {booking.guide_name && <span className="flex items-center gap-0.5" title={booking.guide_name}><User className="w-3 h-3" /></span>}
                      {booking.vehicle_name && <span className="flex items-center gap-0.5" title={booking.vehicle_name}><Car className="w-3 h-3" /></span>}
                    </div>
                  </div>
                </div>

                <div className="relative h-12 bg-gray-100 rounded-lg overflow-hidden">
                  <Link
                    href={`/itineraries/${booking.id}`}
                    className={`absolute top-1.5 h-9 rounded-lg ${getStatusColor(booking.payment_status)} hover:opacity-80 transition-all ${
                      hasConflict ? 'ring-2 ring-orange-700 z-10' : ''
                    }`}
                    style={position}
                  >
                    <div className="h-full flex items-center justify-between px-2 text-white text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{duration}d</span>
                        {hasConflict && (
                          <AlertCircle className="w-3 h-3 text-orange-300" />
                        )}
                      </div>
                      <div className="text-xs opacity-90">
                        {booking.num_travelers} pax
                      </div>
                    </div>
                  </Link>
                </div>

                <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                  <span>{format(parseISO(booking.start_date), 'MMM d')}</span>
                  <span>{format(parseISO(booking.end_date), 'MMM d')}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="bg-orange-50 border-t border-orange-200 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-orange-900 mb-1">
                {conflicts.length} Booking Conflict{conflicts.length > 1 ? 's' : ''} Detected
              </h4>
              <p className="text-xs text-orange-700">
                Some bookings have overlapping dates. Review these bookings to ensure you have adequate resources.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ConfirmMoveModal({ booking, newDate, onConfirm, onCancel }: any) {
  const currentStart = parseISO(booking.start_date)
  const currentEnd = parseISO(booking.end_date)
  const duration = differenceInDays(currentEnd, currentStart)
  const newEndDate = addDays(newDate, duration)

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-5">
        <div className="flex items-start gap-2 mb-4">
          <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Move className="w-5 h-5 text-primary-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Confirm Reschedule</h3>
            <p className="text-sm text-gray-600">Are you sure you want to move this booking?</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-2">
          <div>
            <p className="text-xs text-gray-600 mb-1">Booking</p>
            <p className="text-sm font-semibold text-gray-900">{booking.client_name}</p>
            <p className="text-xs text-gray-600">{booking.itinerary_code}</p>
          </div>

          <div className="border-t border-gray-200 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-600 mb-1">Current Dates</p>
                <p className="text-xs font-medium text-gray-900">
                  {format(currentStart, 'MMM d')} - {format(currentEnd, 'MMM d')}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">New Dates</p>
                <p className="text-xs font-medium text-primary-600">
                  {format(newDate, 'MMM d')} - {format(newEndDate, 'MMM d')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-3 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 font-medium transition-colors"
          >
            Confirm Move
          </button>
        </div>
      </div>
    </div>
  )
}