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
  Info
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

  // ============================================
  // DATA LOADING
  // ============================================

  useEffect(() => {
    loadCapacityData()
  }, [currentMonth])

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

  // ============================================
  // RENDER
  // ============================================

  const days = getDaysInMonth(currentMonth)
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#647C47]/10 rounded-lg flex items-center justify-center">
            <Calendar className="w-5 h-5 text-[#647C47]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Operator Capacity</h1>
            <p className="text-sm text-gray-500">Manage your availability for WhatsApp AI responses</p>
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
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${config.dotColor}`} />
                  <span>{config.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div className="space-y-4">
          {/* Quick Actions */}
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

          {/* Edit Entry */}
          {editingEntry && selectedDate && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Edit Capacity</h3>

              <div className="space-y-4">
                {/* Group Capacity */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-1">
                    <Users className="w-3.5 h-3.5" />
                    Max Groups
                  </label>
                  <input
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
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-1">
                    <Clock className="w-3.5 h-3.5" />
                    Booked Groups
                  </label>
                  <input
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
              How It Works
            </h3>
            <ul className="text-xs text-blue-800 space-y-1.5">
              <li>- <strong>Available:</strong> WhatsApp AI confirms dates work</li>
              <li>- <strong>Limited:</strong> AI suggests booking soon</li>
              <li>- <strong>Busy:</strong> AI may suggest alternatives</li>
              <li>- <strong>Blackout:</strong> AI tells customer those dates are unavailable</li>
            </ul>
            <p className="text-xs text-blue-700 mt-3">
              The AI is honest with customers - it will say "dates work on our end" and note that hotel
              availability needs confirmation.
            </p>
          </div>

          {/* Default Settings */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Default Settings</h3>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">
                Default Max Groups per Day
              </label>
              <input
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
        </div>
      </div>
    </div>
  )
}
