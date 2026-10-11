'use client'

import { todayLocal } from '@/lib/today'

import {
  Users, UserPlus, Star, TrendingUp,
  AlertCircle, CheckCircle, Trash2, SlidersHorizontal, X
} from 'lucide-react'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/app/supabase'
import { CLIENT_STAGES, clientStageBadge, clientStageLabel } from '@/lib/client-stage'
import Link from 'next/link'
import { showToast } from '@/app/contexts/ToastContext'
import { useTenant } from '@/app/contexts/TenantContext'
import { fetchAllPages } from '@/lib/db/fetch-all-pages'
import { LEAD_SOURCES, clientLeadSource, orSearchTerm } from '@/lib/clients/client-fields'
import { formatCurrency } from '@/lib/currency'

interface ClientSummary {
  id: string
  client_code: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  nationality: string | null
  client_type: string | null
  vip_status: boolean | null
  status: string | null
  lead_source: string | null
  client_source: string | null
  total_bookings_count: number | null
  total_revenue_generated: number | null
  created_at: string | null
}

interface DeleteModalState {
  isOpen: boolean
  clientId: string
  clientName: string
}


const LIST_COLUMNS = 'id, client_code, full_name, email, phone, whatsapp, nationality, client_type, vip_status, status, lead_source, client_source, total_bookings_count, total_revenue_generated, created_at'

export default function ClientsPage() {
  const { tenant } = useTenant()
  // Revenue is kept in the agency's own currency (migration 284).
  const agencyCurrency = tenant?.default_currency || 'EUR'
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({
    isOpen: false,
    clientId: '',
    clientName: ''
  })
  const [deleting, setDeleting] = useState(false)
  
  // Enhanced Filters
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    clientType: 'all',
    leadSource: 'all',
    vipOnly: false,
    sortBy: 'recent',
    dateFrom: '',
    dateTo: ''
  })
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    leads: 0,
    active: 0,
    vip: 0,
    newThisMonth: 0,
    totalRevenue: 0
  })

  const supabase = createClient()

  // Debounced search value
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search)
    }, 300) // 300ms debounce

    return () => clearTimeout(timer)
  }, [filters.search])

  // Fetch clients when filters change (but use debounced search)
  useEffect(() => {
    fetchClients()
  }, [debouncedSearch, filters.status, filters.clientType, filters.leadSource, filters.vipOnly, filters.sortBy, filters.dateFrom, filters.dateTo])

  // Fetch stats only once on mount
  useEffect(() => {
    fetchStats()
  }, [])

  const fetchClients = async () => {
    try {
      setLoading(true)
      // Every matching client, a page at a time: one request stopped at the
      // database's 1000-row cap, so a large agency's list was silently cut.
      const { data, error } = await fetchAllPages<ClientSummary>((from, to) => {
      let query = supabase
        .from('clients')
        .select(LIST_COLUMNS)

      // Apply search filter (use debounced value). Escaped: a comma or a
      // bracket in the text broke the filter and % matched everything.
      const term = orSearchTerm(debouncedSearch)
      if (term) {
        query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,client_code.ilike.%${term}%`)
      }

      // Apply status filter
      if (filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }

      // Apply client type filter
      if (filters.clientType !== 'all') {
        query = query.eq('client_type', filters.clientType)
      }

      // Apply lead source filter — the source shown is the lead source, else
      // the one an automatic writer (WhatsApp, email, concierge) recorded.
      if (filters.leadSource !== 'all') {
        query = query.or(`lead_source.eq.${filters.leadSource},and(lead_source.is.null,client_source.eq.${filters.leadSource})`)
      }

      // Apply VIP filter
      if (filters.vipOnly) {
        query = query.eq('vip_status', true)
      }

      // Apply date range filter
      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom)
      }
      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo + 'T23:59:59')
      }

      // Apply sorting. Bookings and revenue are the counts the database keeps
      // (migrations 280 and 284); they sorted by date before.
      switch (filters.sortBy) {
        case 'name':
          query = query.order('full_name', { ascending: true })
          break
        case 'name_desc':
          query = query.order('full_name', { ascending: false })
          break
        case 'revenue':
          query = query.order('total_revenue_generated', { ascending: false, nullsFirst: false })
          break
        case 'revenue_asc':
          query = query.order('total_revenue_generated', { ascending: true, nullsFirst: false })
          break
        case 'bookings':
          query = query.order('total_bookings_count', { ascending: false, nullsFirst: false })
          break
        case 'oldest':
          query = query.order('created_at', { ascending: true })
          break
        default:
          query = query.order('created_at', { ascending: false })
      }

      return query.order('id', { ascending: true }).range(from, to)
      })

      if (error) throw error
      setClients(data)
    } catch (error) {
      console.error('Error fetching clients:', error)
    } finally {
      setLoading(false)
    }
  }

  const openDeleteModal = (clientId: string, clientName: string) => {
    setDeleteModal({
      isOpen: true,
      clientId,
      clientName
    })
  }

  const closeDeleteModal = () => {
    setDeleteModal({
      isOpen: false,
      clientId: '',
      clientName: ''
    })
  }

  const confirmDelete = async () => {
    if (!deleteModal.clientId) return
    
    try {
      setDeleting(true)
      // Through the API, which refuses a client with trips, invoices,
      // payments, bookings or email history (deleting it would orphan them)
      // and says why — the direct delete failed on some and silently did
      // nothing for a role that may not delete.
      const res = await fetch(`/api/clients/${deleteModal.clientId}`, { method: 'DELETE' })
      const result = await res.json().catch(() => ({}))
      if (!res.ok || !result.success) {
        showToast('error', result.error || 'Failed to delete client. Please try again.')
        return
      }
      showToast('success', `${deleteModal.clientName || 'Client'} deleted`)

      closeDeleteModal()
      fetchClients()
      // Stat cards fetched "only once on mount" went stale the moment a
      // client was deleted (GET-M03): Total kept its old count until a
      // manual reload.
      fetchStats()
    } catch (error) {
      console.error('Error deleting client:', error)
      showToast('error', 'Failed to delete client. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const fetchStats = async () => {
    try {
      // Counted by the database: reading every row stopped at 1000.
      const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const head = () => supabase.from('clients').select('id', { count: 'exact', head: true })
      const [total, leads, active, vip, newThisMonth] = (await Promise.all([
        head(),
        head().or('status.is.null,status.in.(lead,prospect)'),
        head().eq('status', 'active'),
        head().eq('vip_status', true),
        head().gte('created_at', firstDayOfMonth),
      ])).map(r => r.count ?? 0)
      setStats({ total, leads, active, vip, newThisMonth, totalRevenue: 0 })
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const clearFilters = () => {
    setFilters({
      search: '',
      status: 'all',
      clientType: 'all',
      leadSource: 'all',
      vipOnly: false,
      sortBy: 'recent',
      dateFrom: '',
      dateTo: ''
    })
  }

  const hasActiveFilters = 
    filters.search || 
    filters.status !== 'all' || 
    filters.clientType !== 'all' || 
    filters.leadSource !== 'all' ||
    filters.vipOnly || 
    filters.dateFrom || 
    filters.dateTo ||
    filters.sortBy !== 'recent'

  // Lead → Customer (lib/client-stage): the badge colour and word in one place.
  const getStatusColor = (status: string | null) => clientStageBadge(status)

  const getTypeColor = (type: string | null) => {
    switch (type) {
      case 'individual': return 'bg-purple-100 text-purple-800'
      case 'family': return 'bg-pink-100 text-pink-800'
      case 'group': return 'bg-orange-100 text-orange-800'
      case 'corporate': return 'bg-primary-100 text-primary-800'
      case 'agent': return 'bg-indigo-100 text-indigo-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getLeadSourceConfig = (source: string | null) => {
    return LEAD_SOURCES.find(s => s.value === source) || null
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50">
      {/* Delete Confirmation Modal */}
      {deleteModal.isOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !deleting && closeDeleteModal()}
        >
          {/* GET-H03: the dialog was invisible to the accessibility tree — a
              bare div with no role, no aria-modal, no name — and the backdrop
              swallowed clicks without closing. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-client-title"
            className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 id="delete-client-title" className="text-lg font-semibold text-gray-900">Delete Client</h3>
                  <p className="text-sm text-gray-500">This action cannot be undone</p>
                </div>
              </div>
              
              <p className="text-sm text-gray-700 mb-4">
                Are you sure you want to delete <strong>{deleteModal.clientName}</strong>?
              </p>
              
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-red-800 font-medium mb-2">This will also delete:</p>
                <ul className="text-sm text-red-700 space-y-1 ml-4 list-disc">
                  <li>All client notes</li>
                  <li>All communications history</li>
                  <li>All follow-ups</li>
                  <li>Client preferences</li>
                </ul>
                <p className="text-xs text-red-700 mt-2">
                  A client with trips, bookings, invoices, payments or email history cannot be deleted.
                </p>
              </div>
              
              <div className="flex justify-end gap-3">
                <button
                  onClick={closeDeleteModal}
                  disabled={deleting}
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm flex items-center gap-2"
                >
                  {deleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete Client
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-gray-400" />
                Client Management
              </h1>
              <p className="mt-1 text-xs text-gray-500">
                Manage your clients, track communications, and monitor relationships
              </p>
            </div>
            <Link
              href="/clients/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              New Client
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
          {/* Total Clients */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
              </div>
            </div>
            <p className="text-xs text-gray-600">Total Clients</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
          </div>

          {/* Active */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-gray-400" />
                <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
              </div>
            </div>
            <p className="text-xs text-gray-600">Customers</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.active}</p>
          </div>

          {/* VIP */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-gray-400" />
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
              </div>
            </div>
            <p className="text-xs text-gray-600">VIP Clients</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.vip}</p>
          </div>

          {/* New This Month */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-gray-400" />
                <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
              </div>
            </div>
            <p className="text-xs text-gray-600">New (This Month)</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.newThisMonth}</p>
          </div>

          {/* Total Revenue */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-gray-400" />
                <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
              </div>
            </div>
            <p className="text-xs text-gray-600">Leads</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.leads}</p>
          </div>
        </div>

        {/* Enhanced Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4">
          {/* Search Bar - Always Visible */}
          <div className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Search by name, email, phone, or client code..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="w-full pl-4 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent shadow-sm"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors shadow-sm ${
                  showFilters || hasActiveFilters
                    ? 'bg-primary-50 border-primary-300 text-primary-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filters
                {hasActiveFilters && (
                  <span className="bg-primary-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {[filters.status !== 'all', filters.clientType !== 'all', filters.leadSource !== 'all', filters.vipOnly, filters.dateFrom, filters.dateTo, filters.sortBy !== 'recent'].filter(Boolean).length}
                  </span>
                )}
              </button>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Advanced Filters - Collapsible */}
          {showFilters && (
            <div className="px-4 pb-4 border-t border-gray-200 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Status Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Status
                  </label>
                  <select
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white shadow-sm"
                  >
                    <option value="all">All stages</option>
                    {CLIENT_STAGES.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
                  </select>
                </div>

                {/* Client Type Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Client Type
                  </label>
                  <select
                    value={filters.clientType}
                    onChange={(e) => handleFilterChange('clientType', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white shadow-sm"
                  >
                    <option value="all">All Types</option>
                    <option value="individual">Individual</option>
                    <option value="family">Family</option>
                    <option value="corporate">Corporate</option>
                    <option value="agent">Travel Agent</option>
                    <option value="group">Group</option>
                  </select>
                </div>

                {/* Lead Source Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Lead Source
                  </label>
                  <select
                    value={filters.leadSource}
                    onChange={(e) => handleFilterChange('leadSource', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white shadow-sm"
                  >
                    <option value="all">All Sources</option>
                    {LEAD_SOURCES.map(source => (
                      <option key={source.value} value={source.value}>
                        {source.icon} {source.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sort By */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Sort By
                  </label>
                  <select
                    value={filters.sortBy}
                    onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white shadow-sm"
                  >
                    <option value="recent">Most Recent</option>
                    <option value="oldest">Oldest First</option>
                    <option value="name">Name (A-Z)</option>
                    <option value="name_desc">Name (Z-A)</option>
                    <option value="revenue">Revenue (High to Low)</option>
                    <option value="revenue_asc">Revenue (Low to High)</option>
                    <option value="bookings">Bookings (Most)</option>
                  </select>
                </div>

                {/* VIP Toggle */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    VIP Clients
                  </label>
                  <label className="flex items-center gap-2 px-3 py-2.5 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 shadow-sm">
                    <input
                      type="checkbox"
                      checked={filters.vipOnly}
                      onChange={(e) => handleFilterChange('vipOnly', e.target.checked)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                    />
                    <Star className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm text-gray-700">VIP Only</span>
                  </label>
                </div>
              </div>

              {/* Date Range */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Member Since (From)
                  </label>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Member Since (To)
                  </label>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                    max={todayLocal()}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent shadow-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Clients Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              <p className="mt-3 text-sm text-gray-600">Loading clients...</p>
            </div>
          ) : clients.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-gray-900 mb-2">No clients found</h3>
              <p className="text-sm text-gray-600 mb-4">
                {hasActiveFilters
                  ? 'Try adjusting your search or filters'
                  : 'Get started by adding your first client'}
              </p>
              {hasActiveFilters ? (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700 shadow-sm"
                >
                  <X className="w-4 h-4" />
                  Clear Filters
                </button>
              ) : (
                <Link
                  href="/clients/new"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 shadow-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  Add First Client
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type & Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Lead Source
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Bookings
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Revenue
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {clients.map((client) => {
                    const leadSourceConfig = getLeadSourceConfig(clientLeadSource(client))
                    return (
                      <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-9 w-9 rounded-full bg-primary-100 flex items-center justify-center">
                              <span className="text-primary-600 font-semibold text-xs">
                                {client.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'CL'}
                              </span>
                            </div>
                            <div className="ml-3">
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/clients/${client.id}`}
                                  className="text-sm font-medium text-gray-900 hover:text-primary-600"
                                >
                                  {client.full_name}
                                </Link>
                                {client.vip_status && (
                                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                                )}
                              </div>
                              <div className="text-xs text-gray-500">{client.client_code}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{client.email}</div>
                          {client.phone && (
                            <div className="text-xs text-gray-500">{client.phone}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getTypeColor(client.client_type)}`}>
                              {client.client_type}
                            </span>
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusColor(client.status)}`}>
                              {clientStageLabel(client.status)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {leadSourceConfig ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${leadSourceConfig.color}`}>
                              <span>{leadSourceConfig.icon}</span>
                              {leadSourceConfig.label}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          <div className="font-semibold">{client.total_bookings_count ?? 0}</div>
                          <div className="text-xs text-gray-500">booking{client.total_bookings_count === 1 ? '' : 's'}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {/* null = a booking in a currency that could not be converted (migration 284) */}
                          <div className="font-semibold text-green-600">
                            {client.total_revenue_generated == null ? '—' : formatCurrency(client.total_revenue_generated, agencyCurrency)}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/clients/${client.id}`}
                              className="text-primary-600 hover:text-primary-800 font-medium"
                            >
                              View
                            </Link>
                            <span className="text-gray-300">|</span>
                            <Link
                              href={`/clients/${client.id}/edit`}
                              className="text-gray-600 hover:text-gray-800 font-medium"
                            >
                              Edit
                            </Link>
                            <span className="text-gray-300">|</span>
                            <button
                              onClick={() => openDeleteModal(client.id, client.full_name ?? '')}
                              className="text-red-600 hover:text-red-800 font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Results Count */}
        {!loading && clients.length > 0 && (
          <div className="mt-3 text-center text-xs text-gray-600">
            Showing {clients.length} client{clients.length !== 1 ? 's' : ''}
            {hasActiveFilters && ' (filtered)'}
          </div>
        )}
      </div>
    </div>
    </>
  )
}