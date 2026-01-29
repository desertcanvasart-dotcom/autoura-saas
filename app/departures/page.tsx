'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Calendar,
  Plus,
  Users,
  Loader2,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  X,
  Search,
  Filter,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  Clock,
  MapPin
} from 'lucide-react'

// ============================================
// TYPES
// ============================================

interface TourDeparture {
  id: string
  template_id: string | null
  tour_name: string
  tour_code: string | null
  duration_days: number
  start_date: string
  end_date: string
  max_pax: number
  booked_pax: number
  min_pax: number
  status: 'draft' | 'open' | 'limited' | 'full' | 'guaranteed' | 'cancelled'
  price_per_person: number | null
  currency: string
  public_notes: string | null
  internal_notes: string | null
  created_at: string
  tour_template?: {
    id: string
    template_name: string
    template_code: string
    duration_days: number
  }
}

interface TourTemplate {
  id: string
  template_name: string
  template_code: string
  duration_days: number
}

// ============================================
// STATUS CONFIG
// ============================================

const STATUS_CONFIG = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
  open: { label: 'Open', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  limited: { label: 'Limited', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  full: { label: 'Full', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  guaranteed: { label: 'Guaranteed', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500 line-through', dot: 'bg-gray-400' }
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function DeparturesPage() {
  const [loading, setLoading] = useState(true)
  const [departures, setDepartures] = useState<TourDeparture[]>([])
  const [templates, setTemplates] = useState<TourTemplate[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('upcoming')
  const [searchQuery, setSearchQuery] = useState('')

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newDeparture, setNewDeparture] = useState({
    template_id: '',
    tour_name: '',
    start_date: '',
    duration_days: 1,
    max_pax: 20,
    min_pax: 2,
    price_per_person: '',
    status: 'open'
  })

  // Edit/Delete
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ============================================
  // DATA LOADING
  // ============================================

  useEffect(() => {
    loadData()
  }, [statusFilter])

  const loadData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Load departures
      let url = '/api/departures?'
      if (statusFilter === 'upcoming') {
        url += 'upcoming=true'
      } else if (statusFilter !== 'all') {
        url += `status=${statusFilter}`
      }

      const [depResponse, templateResponse] = await Promise.all([
        fetch(url),
        fetch('/api/tours/templates?is_active=true')
      ])

      if (!depResponse.ok) throw new Error('Failed to load departures')

      const depResult = await depResponse.json()
      setDepartures(depResult.data || [])

      if (templateResponse.ok) {
        const templateResult = await templateResponse.json()
        setTemplates(templateResult.data || [])
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load data'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  // ============================================
  // CREATE DEPARTURE
  // ============================================

  const handleCreate = async () => {
    if (!newDeparture.start_date) {
      setError('Start date is required')
      return
    }

    if (!newDeparture.template_id && !newDeparture.tour_name) {
      setError('Select a tour template or enter a tour name')
      return
    }

    setCreating(true)
    setError(null)

    try {
      const response = await fetch('/api/departures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newDeparture,
          template_id: newDeparture.template_id || null,
          price_per_person: newDeparture.price_per_person ? parseFloat(newDeparture.price_per_person) : null
        })
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to create departure')
      }

      setSuccess('Departure created successfully!')
      setShowCreateModal(false)
      setNewDeparture({
        template_id: '',
        tour_name: '',
        start_date: '',
        duration_days: 1,
        max_pax: 20,
        min_pax: 2,
        price_per_person: '',
        status: 'open'
      })
      loadData()

      setTimeout(() => setSuccess(null), 3000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create departure'
      setError(message)
    } finally {
      setCreating(false)
    }
  }

  // ============================================
  // UPDATE STATUS
  // ============================================

  const updateStatus = async (id: string, status: string) => {
    try {
      const response = await fetch(`/api/departures/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to update status')
      }

      loadData()
      setSuccess('Status updated!')
      setTimeout(() => setSuccess(null), 2000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update'
      setError(message)
    }
  }

  // ============================================
  // DELETE DEPARTURE
  // ============================================

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this departure?')) return

    setDeletingId(id)
    try {
      const response = await fetch(`/api/departures/${id}`, {
        method: 'DELETE'
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete')
      }

      setSuccess('Departure deleted')
      loadData()
      setTimeout(() => setSuccess(null), 2000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete'
      setError(message)
    } finally {
      setDeletingId(null)
    }
  }

  // ============================================
  // TEMPLATE SELECTION
  // ============================================

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId)
    if (template) {
      setNewDeparture(prev => ({
        ...prev,
        template_id: templateId,
        tour_name: template.template_name,
        duration_days: template.duration_days
      }))
    } else {
      setNewDeparture(prev => ({
        ...prev,
        template_id: '',
        tour_name: ''
      }))
    }
  }

  // ============================================
  // FILTER DEPARTURES
  // ============================================

  const filteredDepartures = departures.filter(dep => {
    if (!searchQuery) return true
    return dep.tour_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
           dep.tour_code?.toLowerCase().includes(searchQuery.toLowerCase())
  })

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#647C47]/10 rounded-lg flex items-center justify-center">
            <Calendar className="w-5 h-5 text-[#647C47]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Tour Departures</h1>
            <p className="text-sm text-gray-500">Manage scheduled group tour departures</p>
          </div>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Departure
        </button>
      </div>

      {/* Success Toast */}
      {success && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg shadow-lg">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-medium">{success}</span>
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

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search tours..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
            >
              <option value="upcoming">Upcoming</option>
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="limited">Limited</option>
              <option value="full">Full</option>
              <option value="guaranteed">Guaranteed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Departures List */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-[#647C47] animate-spin" />
          </div>
        ) : filteredDepartures.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Calendar className="w-12 h-12 mb-3 text-gray-300" />
            <p className="font-medium">No departures found</p>
            <p className="text-sm">Create a new departure to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredDepartures.map((departure) => {
              const statusConfig = STATUS_CONFIG[departure.status]
              const availableSpots = departure.max_pax - departure.booked_pax
              const occupancyPercent = Math.round((departure.booked_pax / departure.max_pax) * 100)

              return (
                <div
                  key={departure.id}
                  className="p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Tour Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-gray-900 truncate">
                          {departure.tour_name}
                        </h3>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusConfig.color}`}>
                          {statusConfig.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(departure.start_date + 'T12:00:00').toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {departure.duration_days} days
                        </span>
                        {departure.tour_code && (
                          <span className="text-gray-400">
                            {departure.tour_code}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Capacity */}
                    <div className="text-right">
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-900">
                          {departure.booked_pax}/{departure.max_pax}
                        </span>
                        <span className="text-sm text-gray-500">
                          ({availableSpots} left)
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="w-32 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            occupancyPercent >= 100 ? 'bg-red-500' :
                            occupancyPercent >= 80 ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(occupancyPercent, 100)}%` }}
                        />
                      </div>

                      {departure.price_per_person && (
                        <p className="text-sm font-medium text-gray-700 mt-1">
                          {departure.currency} {departure.price_per_person}/person
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      {departure.status !== 'cancelled' && departure.status !== 'full' && (
                        <select
                          value={departure.status}
                          onChange={(e) => updateStatus(departure.id, e.target.value)}
                          className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#647C47] bg-white"
                        >
                          <option value="draft">Draft</option>
                          <option value="open">Open</option>
                          <option value="limited">Limited</option>
                          <option value="full">Full</option>
                          <option value="guaranteed">Guaranteed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      )}

                      <button
                        onClick={() => handleDelete(departure.id)}
                        disabled={deletingId === departure.id}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                      >
                        {deletingId === departure.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">New Departure</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Template Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tour Template
                </label>
                <select
                  value={newDeparture.template_id}
                  onChange={(e) => handleTemplateSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                >
                  <option value="">-- Select a template or enter custom --</option>
                  {templates.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.template_name} ({template.duration_days} days)
                    </option>
                  ))}
                </select>
              </div>

              {/* Tour Name (if no template) */}
              {!newDeparture.template_id && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tour Name *
                  </label>
                  <input
                    type="text"
                    value={newDeparture.tour_name}
                    onChange={(e) => setNewDeparture(prev => ({ ...prev, tour_name: e.target.value }))}
                    placeholder="e.g., 7-Day Cairo & Nile Cruise"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
              )}

              {/* Start Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  value={newDeparture.start_date}
                  onChange={(e) => setNewDeparture(prev => ({ ...prev, start_date: e.target.value }))}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                />
              </div>

              {/* Duration */}
              {!newDeparture.template_id && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Duration (days)
                  </label>
                  <input
                    type="number"
                    value={newDeparture.duration_days}
                    onChange={(e) => setNewDeparture(prev => ({ ...prev, duration_days: parseInt(e.target.value) || 1 }))}
                    min="1"
                    max="30"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
              )}

              {/* Capacity */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Pax
                  </label>
                  <input
                    type="number"
                    value={newDeparture.max_pax}
                    onChange={(e) => setNewDeparture(prev => ({ ...prev, max_pax: parseInt(e.target.value) || 1 }))}
                    min="1"
                    max="100"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Pax
                  </label>
                  <input
                    type="number"
                    value={newDeparture.min_pax}
                    onChange={(e) => setNewDeparture(prev => ({ ...prev, min_pax: parseInt(e.target.value) || 1 }))}
                    min="1"
                    max={newDeparture.max_pax}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>
              </div>

              {/* Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price per Person (EUR)
                </label>
                <input
                  type="number"
                  value={newDeparture.price_per_person}
                  onChange={(e) => setNewDeparture(prev => ({ ...prev, price_per_person: e.target.value }))}
                  placeholder="Optional"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={newDeparture.status}
                  onChange={(e) => setNewDeparture(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                >
                  <option value="draft">Draft (not visible)</option>
                  <option value="open">Open (accepting bookings)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white text-sm rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Create Departure
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
