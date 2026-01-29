'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Save,
  AlertCircle,
  CheckCircle,
  X,
  Users,
  Car,
  Clock,
  Info,
  Map as MapIcon,
  Filter
} from 'lucide-react'

// ============================================
// TYPES
// ============================================

interface CapacityEntry {
  id?: string
  date: string
  status: 'available' | 'limited' | 'busy' | 'blackout'
  max_groups: number
  booked_groups: number
  max_guides?: number
  booked_guides?: number
  max_vehicles?: number
  booked_vehicles?: number
  notes?: string
  reason?: string
}

interface TourTemplate {
  id: string
  template_name: string
  template_code: string | null
  duration_days: number
}

interface Itinerary {
  id: string
  itinerary_code: string
  trip_name: string
  client_name: string
  start_date: string
  end_date: string
  total_days: number
  status: string
}

interface TourDeparture {
  id: string
  template_id: string | null
  tour_name: string
  tour_code: string | null
  start_date: string
  end_date: string
  duration_days: number
  status: 'draft' | 'open' | 'limited' | 'full' | 'guaranteed' | 'cancelled'
  max_pax: number
  booked_pax: number
  price_per_person: number | null
  currency: string
}

// ============================================
// STATUS CONFIGURATION
// ============================================

const STATUS_CONFIG = {
  available: {
    label: 'Available',
    color: 'bg-green-100 text-green-800 border-green-200',
    dotColor: 'bg-green-500',
    description: 'Open for new bookings'
  },
  limited: {
    label: 'Limited',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    dotColor: 'bg-yellow-500',
    description: 'Some availability remaining'
  },
  busy: {
    label: 'Busy',
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    dotColor: 'bg-orange-500',
    description: 'Nearly at capacity'
  },
  blackout: {
    label: 'Blackout',
    color: 'bg-red-100 text-red-800 border-red-200',
    dotColor: 'bg-red-500',
    description: 'No bookings accepted'
  }
}

const DEPARTURE_STATUS_CONFIG = {
  draft: {
    label: 'Draft',
    color: 'bg-gray-100 text-gray-800 border-gray-200',
    dotColor: 'bg-gray-400'
  },
  open: {
    label: 'Open',
    color: 'bg-green-100 text-green-800 border-green-200',
    dotColor: 'bg-green-500'
  },
  limited: {
    label: 'Limited',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    dotColor: 'bg-yellow-500'
  },
  full: {
    label: 'Full',
    color: 'bg-red-100 text-red-800 border-red-200',
    dotColor: 'bg-red-500'
  },
  guaranteed: {
    label: 'Guaranteed',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    dotColor: 'bg-blue-500'
  },
  cancelled: {
    label: 'Cancelled',
    color: 'bg-gray-100 text-gray-600 border-gray-200',
    dotColor: 'bg-gray-400'
  }
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function CapacityPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [capacityData, setCapacityData] = useState<Map<string, CapacityEntry>>(new Map())
  const [pendingChanges, setPendingChanges] = useState<Map<string, CapacityEntry>>(new Map())

  // Selection state
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [editingEntry, setEditingEntry] = useState<CapacityEntry | null>(null)

  // Default settings
  const [defaultMaxGroups, setDefaultMaxGroups] = useState(3)

  // Tour filtering state
  const [tourTemplates, setTourTemplates] = useState<TourTemplate[]>([])
  const [itineraries, setItineraries] = useState<Itinerary[]>([])
  const [selectedTourId, setSelectedTourId] = useState<string>('') // Format: "template:id" or "itinerary:id"
  const [tourDepartures, setTourDepartures] = useState<TourDeparture[]>([])
  const [selectedItinerary, setSelectedItinerary] = useState<Itinerary | null>(null)
  const [loadingDepartures, setLoadingDepartures] = useState(false)
  const [viewMode, setViewMode] = useState<'capacity' | 'tours'>('capacity')

  // ============================================
  // DATA LOADING
  // ============================================

  useEffect(() => {
    loadCapacityData()
  }, [currentMonth])

  // Load tour templates and itineraries on mount
  useEffect(() => {
    loadTourTemplates()
    loadItineraries()
  }, [])

  // Load tour departures when tour is selected or month changes
  useEffect(() => {
    if (selectedTourId) {
      const [type, id] = selectedTourId.split(':')
      if (type === 'template') {
        loadTourDepartures(id)
        setSelectedItinerary(null)
      } else if (type === 'itinerary') {
        // For itineraries, show the itinerary dates on calendar
        const itinerary = itineraries.find(i => i.id === id)
        setSelectedItinerary(itinerary || null)
        setTourDepartures([])
      }
    } else {
      setTourDepartures([])
      setSelectedItinerary(null)
    }
  }, [selectedTourId, currentMonth, itineraries])

  const loadTourTemplates = async () => {
    try {
      const response = await fetch('/api/tour-templates')
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setTourTemplates(result.data || [])
        }
      }
    } catch (err) {
      console.error('Failed to load tour templates:', err)
    }
  }

  const loadItineraries = async () => {
    try {
      const response = await fetch('/api/itineraries')
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setItineraries(result.data || [])
        }
      }
    } catch (err) {
      console.error('Failed to load itineraries:', err)
    }
  }

  const loadTourDepartures = async (templateId: string) => {
    if (!templateId) return

    setLoadingDepartures(true)
    try {
      const startDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
      const endDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)

      const params = new URLSearchParams({
        template_id: templateId,
        start_date: formatDate(startDate),
        end_date: formatDate(endDate)
      })

      const response = await fetch(`/api/departures?${params}`)
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setTourDepartures(result.data || [])
        }
      }
    } catch (err) {
      console.error('Failed to load tour departures:', err)
    } finally {
      setLoadingDepartures(false)
    }
  }

  const loadCapacityData = async () => {
    setLoading(true)
    setError(null)

    try {
      const startDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
      const endDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)

      const response = await fetch(
        `/api/capacity?start_date=${formatDate(startDate)}&end_date=${formatDate(endDate)}`
      )

      if (!response.ok) {
        throw new Error('Failed to load capacity data')
      }

      const result = await response.json()

      if (result.success) {
        const dataMap = new Map<string, CapacityEntry>()
        result.data.forEach((entry: CapacityEntry) => {
          dataMap.set(entry.date, entry)
        })
        setCapacityData(dataMap)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load capacity data'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  // ============================================
  // SAVE CHANGES
  // ============================================

  const saveChanges = async () => {
    if (pendingChanges.size === 0) return

    setSaving(true)
    setError(null)

    try {
      const entries = Array.from(pendingChanges.values())

      const response = await fetch('/api/capacity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries })
      })

      if (!response.ok) {
        throw new Error('Failed to save changes')
      }

      const result = await response.json()

      if (result.success) {
        // Merge pending changes into main data
        const newData = new Map(capacityData)
        pendingChanges.forEach((entry, date) => {
          newData.set(date, entry)
        })
        setCapacityData(newData)
        setPendingChanges(new Map())
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save changes'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  // ============================================
  // UPDATE CAPACITY
  // ============================================

  const updateCapacity = (date: string, updates: Partial<CapacityEntry>) => {
    const existing = pendingChanges.get(date) || capacityData.get(date) || {
      date,
      status: 'available' as const,
      max_groups: defaultMaxGroups,
      booked_groups: 0
    }

    const updated = { ...existing, ...updates, date }
    setPendingChanges(new Map(pendingChanges).set(date, updated))
  }

  const setQuickStatus = (date: string, status: CapacityEntry['status']) => {
    updateCapacity(date, { status })
  }

  // ============================================
  // CALENDAR HELPERS
  // ============================================

  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0]
  }

  const getDaysInMonth = (date: Date): Date[] => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    const days: Date[] = []

    // Add padding days from previous month
    const startDayOfWeek = firstDay.getDay()
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month, -i)
      days.push(d)
    }

    // Add days of current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i))
    }

    // Add padding days from next month
    const endDayOfWeek = lastDay.getDay()
    for (let i = 1; i < 7 - endDayOfWeek; i++) {
      days.push(new Date(year, month + 1, i))
    }

    return days
  }

  const isCurrentMonth = (date: Date): boolean => {
    return date.getMonth() === currentMonth.getMonth()
  }

  const isToday = (date: Date): boolean => {
    const today = new Date()
    return formatDate(date) === formatDate(today)
  }

  const isPast = (date: Date): boolean => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return date < today
  }

  const getEntryForDate = (date: string): CapacityEntry | undefined => {
    return pendingChanges.get(date) || capacityData.get(date)
  }

  const hasPendingChange = (date: string): boolean => {
    return pendingChanges.has(date)
  }

  // Get departures that include this date (start or during the trip)
  const getDeparturesForDate = (date: string): TourDeparture[] => {
    return tourDepartures.filter(dep => {
      return date >= dep.start_date && date <= dep.end_date
    })
  }

  // Get departure starting on this date
  const getDepartureStartingOn = (date: string): TourDeparture | undefined => {
    return tourDepartures.find(dep => dep.start_date === date)
  }

  // Check if date is within selected itinerary
  const isDateInItinerary = (date: string): boolean => {
    if (!selectedItinerary) return false
    return date >= selectedItinerary.start_date && date <= selectedItinerary.end_date
  }

  // Check if date is itinerary start date
  const isItineraryStartDate = (date: string): boolean => {
    return selectedItinerary?.start_date === date
  }

  // Get day number within itinerary
  const getItineraryDayNumber = (date: string): number | null => {
    if (!selectedItinerary || !isDateInItinerary(date)) return null
    const start = new Date(selectedItinerary.start_date)
    const current = new Date(date)
    return Math.floor((current.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  }

  // ============================================
  // RENDER
  // ============================================

  const days = getDaysInMonth(currentMonth)
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#647C47]/10 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-[#647C47]" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Capacity Calendar</h1>
              <p className="text-sm text-gray-500">Manage availability and view tour departures</p>
            </div>
          </div>

          {pendingChanges.size > 0 && (
            <button
              onClick={saveChanges}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save {pendingChanges.size} Change{pendingChanges.size > 1 ? 's' : ''}
            </button>
          )}
        </div>

        {/* View Mode Toggle and Tour Filter */}
        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('capacity')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'capacity'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                General Capacity
              </span>
            </button>
            <button
              onClick={() => setViewMode('tours')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'tours'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <MapIcon className="w-4 h-4" />
                Tour Departures
              </span>
            </button>
          </div>

          {/* Tour/Itinerary Selector - Only show in tours mode */}
          {viewMode === 'tours' && (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={selectedTourId}
                onChange={(e) => setSelectedTourId(e.target.value)}
                aria-label="Select tour or itinerary to view"
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] min-w-[250px]"
              >
                <option value="">Select a tour or itinerary...</option>
                {itineraries.length > 0 && (
                  <optgroup label="📋 Itineraries">
                    {itineraries.map(itinerary => (
                      <option key={itinerary.id} value={`itinerary:${itinerary.id}`}>
                        {itinerary.trip_name} ({itinerary.itinerary_code}) - {itinerary.client_name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {tourTemplates.length > 0 && (
                  <optgroup label="🗺️ Tour Templates">
                    {tourTemplates.map(template => (
                      <option key={template.id} value={`template:${template.id}`}>
                        {template.template_name} {template.template_code ? `(${template.template_code})` : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {loadingDepartures && (
                <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Success Toast */}
      {success && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg shadow-lg">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-medium">Changes saved successfully!</span>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg shadow-lg">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm font-medium">{error}</span>
          <button onClick={() => setError(null)} className="ml-2 p-1 hover:bg-red-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-sm">
          {/* Calendar Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>

            <h2 className="text-lg font-semibold text-gray-900">
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h2>

            <button
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="p-4">
            {loading ? (
              <div className="flex items-center justify-center h-80">
                <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
              </div>
            ) : (
              <>
                {/* Week Days Header */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {weekDays.map(day => (
                    <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 gap-1">
                  {days.map((date, idx) => {
                    const dateStr = formatDate(date)
                    const entry = getEntryForDate(dateStr)
                    const status = entry?.status || 'available'
                    const config = STATUS_CONFIG[status]
                    const inCurrentMonth = isCurrentMonth(date)
                    const today = isToday(date)
                    const past = isPast(date)
                    const pending = hasPendingChange(dateStr)

                    // Tour departure info
                    const departuresOnDate = getDeparturesForDate(dateStr)
                    const departureStarting = getDepartureStartingOn(dateStr)
                    const hasDepartures = departuresOnDate.length > 0

                    // Itinerary info
                    const inItinerary = isDateInItinerary(dateStr)
                    const isItinStart = isItineraryStartDate(dateStr)
                    const itinDayNum = getItineraryDayNumber(dateStr)

                    // In tours view mode, show departure or itinerary info
                    if (viewMode === 'tours') {
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            setSelectedDate(dateStr)
                          }}
                          className={`
                            relative p-2 min-h-[70px] rounded-lg border text-left transition-all
                            ${!inCurrentMonth ? 'opacity-40' : ''}
                            ${today ? 'ring-2 ring-[#647C47]' : ''}
                            ${selectedDate === dateStr ? 'border-[#647C47] bg-[#647C47]/5' : 'border-gray-200'}
                            ${hasDepartures ? 'bg-blue-50/50' : ''}
                            ${inItinerary ? 'bg-purple-50/50' : ''}
                            hover:border-[#647C47] cursor-pointer
                          `}
                        >
                          <div className="flex items-start justify-between">
                            <span className={`text-sm font-medium ${today ? 'text-[#647C47]' : 'text-gray-700'}`}>
                              {date.getDate()}
                            </span>
                            {hasDepartures && (
                              <div className="flex -space-x-1">
                                {departuresOnDate.slice(0, 2).map((dep, i) => {
                                  const depConfig = DEPARTURE_STATUS_CONFIG[dep.status]
                                  return (
                                    <div key={i} className={`w-2 h-2 rounded-full ${depConfig.dotColor} ring-1 ring-white`} />
                                  )
                                })}
                                {departuresOnDate.length > 2 && (
                                  <span className="text-[8px] text-gray-500 ml-1">+{departuresOnDate.length - 2}</span>
                                )}
                              </div>
                            )}
                            {inItinerary && !hasDepartures && (
                              <div className="w-2 h-2 rounded-full bg-purple-500" />
                            )}
                          </div>

                          {/* Show tour departure info */}
                          {departureStarting && (
                            <div className="mt-1">
                              <span className={`text-[9px] px-1.5 py-0.5 rounded ${DEPARTURE_STATUS_CONFIG[departureStarting.status].color} block truncate`}>
                                {departureStarting.tour_code || departureStarting.tour_name.slice(0, 12)}
                              </span>
                              <div className="flex items-center gap-1 mt-0.5 text-[9px] text-gray-500">
                                <Users className="w-2.5 h-2.5" />
                                {departureStarting.booked_pax}/{departureStarting.max_pax}
                              </div>
                            </div>
                          )}

                          {hasDepartures && !departureStarting && (
                            <div className="mt-1">
                              <span className="text-[9px] text-gray-400 italic">
                                in trip
                              </span>
                            </div>
                          )}

                          {/* Show itinerary info */}
                          {inItinerary && !hasDepartures && (
                            <div className="mt-1">
                              {isItinStart ? (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 block truncate">
                                  🚀 Start
                                </span>
                              ) : (
                                <span className="text-[9px] text-purple-600">
                                  Day {itinDayNum}
                                </span>
                              )}
                            </div>
                          )}
                        </button>
                      )
                    }

                    // Default capacity view
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          if (!past) {
                            setSelectedDate(dateStr)
                            setEditingEntry(entry || {
                              date: dateStr,
                              status: 'available',
                              max_groups: defaultMaxGroups,
                              booked_groups: 0
                            })
                          }
                        }}
                        disabled={past}
                        className={`
                          relative p-2 min-h-[60px] rounded-lg border text-left transition-all
                          ${!inCurrentMonth ? 'opacity-40' : ''}
                          ${past ? 'opacity-40 cursor-not-allowed' : 'hover:border-[#647C47] cursor-pointer'}
                          ${today ? 'ring-2 ring-[#647C47]' : ''}
                          ${selectedDate === dateStr ? 'border-[#647C47] bg-[#647C47]/5' : 'border-gray-200'}
                          ${pending ? 'ring-1 ring-amber-400' : ''}
                        `}
                      >
                        <div className="flex items-start justify-between">
                          <span className={`text-sm font-medium ${today ? 'text-[#647C47]' : 'text-gray-700'}`}>
                            {date.getDate()}
                          </span>
                          <div className={`w-2 h-2 rounded-full ${config.dotColor}`} />
                        </div>

                        {entry && !past && (
                          <div className="mt-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${config.color}`}>
                              {config.label}
                            </span>
                          </div>
                        )}

                        {pending && (
                          <div className="absolute bottom-1 right-1">
                            <div className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* Legend */}
          <div className="px-4 pb-4">
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
              {viewMode === 'capacity' ? (
                // Capacity status legend
                Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${config.dotColor}`} />
                    <span>{config.label}</span>
                  </div>
                ))
              ) : (
                // Departure status legend
                Object.entries(DEPARTURE_STATUS_CONFIG).map(([key, config]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${config.dotColor}`} />
                    <span>{config.label}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div className="space-y-4">
          {/* Itinerary Info Panel - Show when itinerary is selected in tours mode */}
          {viewMode === 'tours' && selectedItinerary && (
            <div className="bg-white border border-purple-200 rounded-xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                <h3 className="text-sm font-semibold text-gray-900">Selected Itinerary</h3>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{selectedItinerary.trip_name}</p>
                  <p className="text-xs text-gray-500">{selectedItinerary.itinerary_code}</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded ${
                    selectedItinerary.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                    selectedItinerary.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                    selectedItinerary.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {selectedItinerary.status.charAt(0).toUpperCase() + selectedItinerary.status.slice(1)}
                  </span>
                </div>

                <div className="text-xs text-gray-600 space-y-1">
                  <p><strong>Client:</strong> {selectedItinerary.client_name}</p>
                  <p><strong>Dates:</strong> {selectedItinerary.start_date} → {selectedItinerary.end_date}</p>
                  <p><strong>Duration:</strong> {selectedItinerary.total_days} days</p>
                </div>

                {/* Show day info if date selected within itinerary */}
                {selectedDate && isDateInItinerary(selectedDate) && (
                  <div className="pt-2 border-t border-purple-100">
                    <p className="text-xs text-purple-700">
                      <strong>Selected:</strong> Day {getItineraryDayNumber(selectedDate)} of {selectedItinerary.total_days}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => router.push(`/itineraries/${selectedItinerary.id}`)}
                  className="mt-2 w-full text-xs text-[#647C47] hover:underline text-center"
                >
                  View Full Itinerary →
                </button>
              </div>
            </div>
          )}

          {/* Tour Departures Panel - Show in tours mode when template selected */}
          {viewMode === 'tours' && selectedDate && !selectedItinerary && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Departures on {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric'
                })}
              </h3>

              {(() => {
                const deps = getDeparturesForDate(selectedDate)
                if (deps.length === 0) {
                  return (
                    <p className="text-sm text-gray-500">No departures on this date</p>
                  )
                }

                return (
                  <div className="space-y-3">
                    {deps.map(dep => {
                      const depConfig = DEPARTURE_STATUS_CONFIG[dep.status]
                      const isStart = dep.start_date === selectedDate
                      const availableSpots = dep.max_pax - dep.booked_pax
                      const fillPercent = Math.round((dep.booked_pax / dep.max_pax) * 100)

                      return (
                        <div key={dep.id} className="p-3 border border-gray-200 rounded-lg">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{dep.tour_name}</p>
                              {dep.tour_code && (
                                <p className="text-xs text-gray-500">{dep.tour_code}</p>
                              )}
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded ${depConfig.color}`}>
                              {depConfig.label}
                            </span>
                          </div>

                          <div className="text-xs text-gray-600 space-y-1">
                            <p>
                              {isStart ? '🚀 Starts today' : `Day ${Math.floor((new Date(selectedDate).getTime() - new Date(dep.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1} of ${dep.duration_days}`}
                            </p>
                            <p>{dep.start_date} → {dep.end_date}</p>
                          </div>

                          {/* Capacity bar */}
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-gray-600">
                                <Users className="w-3 h-3 inline mr-1" />
                                {dep.booked_pax}/{dep.max_pax} booked
                              </span>
                              <span className={availableSpots > 0 ? 'text-green-600' : 'text-red-600'}>
                                {availableSpots} spots left
                              </span>
                            </div>
                            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  fillPercent >= 100 ? 'bg-red-500' :
                                  fillPercent >= 80 ? 'bg-yellow-500' : 'bg-green-500'
                                }`}
                                style={{ width: `${Math.min(fillPercent, 100)}%` }}
                              />
                            </div>
                          </div>

                          {dep.price_per_person && (
                            <p className="text-xs text-gray-600 mt-2">
                              {dep.currency} {dep.price_per_person.toLocaleString()} per person
                            </p>
                          )}

                          <button
                            type="button"
                            onClick={() => router.push(`/departures?id=${dep.id}`)}
                            className="mt-2 w-full text-xs text-[#647C47] hover:underline text-center"
                          >
                            View Details →
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}

          {/* Quick Actions - Show in capacity mode */}
          {viewMode === 'capacity' && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Status</h3>

              {selectedDate ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    {(Object.entries(STATUS_CONFIG) as [CapacityEntry['status'], typeof STATUS_CONFIG[keyof typeof STATUS_CONFIG]][]).map(([key, config]) => {
                      const entry = getEntryForDate(selectedDate)
                      const isActive = (entry?.status || 'available') === key

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setQuickStatus(selectedDate, key)}
                          className={`
                            p-2 rounded-lg border-2 text-xs font-medium transition-all
                            ${isActive ? config.color + ' border-current' : 'border-gray-200 hover:border-gray-300'}
                          `}
                        >
                          <div className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${config.dotColor}`} />
                            {config.label}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Select a date to set status</p>
              )}
            </div>
          )}

          {/* Edit Entry - Only show in capacity mode */}
          {viewMode === 'capacity' && editingEntry && selectedDate && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Edit Capacity</h3>

              <div className="space-y-4">
                {/* Group Capacity */}
                <div>
                  <label htmlFor="maxGroups" className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-1">
                    <Users className="w-3.5 h-3.5" />
                    Max Groups
                  </label>
                  <input
                    id="maxGroups"
                    type="number"
                    value={editingEntry.max_groups}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 0
                      setEditingEntry({ ...editingEntry, max_groups: value })
                      updateCapacity(selectedDate, { max_groups: value })
                    }}
                    min="0"
                    max="20"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>

                {/* Booked Groups */}
                <div>
                  <label htmlFor="bookedGroups" className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-1">
                    <Clock className="w-3.5 h-3.5" />
                    Booked Groups
                  </label>
                  <input
                    id="bookedGroups"
                    type="number"
                    value={editingEntry.booked_groups}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 0
                      setEditingEntry({ ...editingEntry, booked_groups: value })
                      updateCapacity(selectedDate, { booked_groups: value })
                    }}
                    min="0"
                    max={editingEntry.max_groups}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>

                {/* Reason (for blackout) */}
                {editingEntry.status === 'blackout' && (
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-1">
                      <Info className="w-3.5 h-3.5" />
                      Reason (optional)
                    </label>
                    <input
                      type="text"
                      value={editingEntry.reason || ''}
                      onChange={(e) => {
                        setEditingEntry({ ...editingEntry, reason: e.target.value })
                        updateCapacity(selectedDate, { reason: e.target.value })
                      }}
                      placeholder="e.g., National holiday"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                    />
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Notes</label>
                  <textarea
                    value={editingEntry.notes || ''}
                    onChange={(e) => {
                      setEditingEntry({ ...editingEntry, notes: e.target.value })
                      updateCapacity(selectedDate, { notes: e.target.value })
                    }}
                    rows={2}
                    placeholder="Internal notes..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* How It Works */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-1.5">
              <Info className="w-4 h-4" />
              {viewMode === 'capacity' ? 'How It Works' : 'Tour Departures'}
            </h3>
            {viewMode === 'capacity' ? (
              <>
                <ul className="text-xs text-blue-800 space-y-1.5">
                  <li>• <strong>Available:</strong> WhatsApp AI confirms dates work</li>
                  <li>• <strong>Limited:</strong> AI suggests booking soon</li>
                  <li>• <strong>Busy:</strong> AI may suggest alternatives</li>
                  <li>• <strong>Blackout:</strong> AI tells customer those dates are unavailable</li>
                </ul>
                <p className="text-xs text-blue-700 mt-3">
                  The AI is honest with customers - it will say &quot;dates work on our end&quot; and note that hotel
                  availability needs confirmation.
                </p>
              </>
            ) : (
              <>
                <ul className="text-xs text-blue-800 space-y-1.5">
                  <li>• <strong>Open:</strong> Accepting bookings normally</li>
                  <li>• <strong>Limited:</strong> Few spots remaining (80%+ full)</li>
                  <li>• <strong>Full:</strong> No more spots available</li>
                  <li>• <strong>Guaranteed:</strong> Trip will definitely run</li>
                </ul>
                <p className="text-xs text-blue-700 mt-3">
                  Select a tour above to filter departures. The WhatsApp AI uses this data to check group tour availability.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/departures')}
                  className="mt-3 text-xs font-medium text-blue-700 hover:underline"
                >
                  Manage departures →
                </button>
              </>
            )}
          </div>

          {/* Default Settings - Only show in capacity mode */}
          {viewMode === 'capacity' && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Default Settings</h3>
              <div>
                <label htmlFor="defaultMaxGroups" className="text-xs font-medium text-gray-700 mb-1 block">
                  Default Max Groups per Day
                </label>
                <input
                  id="defaultMaxGroups"
                  type="number"
                  value={defaultMaxGroups}
                  onChange={(e) => setDefaultMaxGroups(parseInt(e.target.value) || 3)}
                  min="1"
                  max="20"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Applied to new dates without explicit capacity set
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
