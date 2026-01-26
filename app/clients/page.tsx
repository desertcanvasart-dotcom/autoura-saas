'use client'

import { 
  Users, UserPlus, Search, Filter, Star, TrendingUp, Calendar,
  Phone, Mail, MessageSquare, AlertCircle, CheckCircle, Clock,
  Trash2, SlidersHorizontal, X, Globe, Smartphone
} from 'lucide-react'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import RequireFeature from '@/components/RequireFeature'

interface ClientSummary {
  id: string
  client_code: string
  full_name: string
  email: string
  phone?: string
  whatsapp?: string
  nationality?: string
  client_type: string
  vip_status: boolean
  status: string
  lead_source?: string
  created_at: string
}

interface DeleteModalState {
  isOpen: boolean
  clientId: string
  clientName: string
}

const LEAD_SOURCES = [
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬', color: 'bg-green-100 text-green-700' },
  { value: 'email', label: 'Email', icon: '✉️', color: 'bg-blue-100 text-blue-700' },
  { value: 'website', label: 'Website', icon: '🌐', color: 'bg-purple-100 text-purple-700' },
  { value: 'referral', label: 'Referral', icon: '👥', color: 'bg-orange-100 text-orange-700' },
  { value: 'phone', label: 'Phone', icon: '📞', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'social_media', label: 'Social Media', icon: '📱', color: 'bg-pink-100 text-pink-700' },
  { value: 'trade_show', label: 'Trade Show', icon: '🎪', color: 'bg-amber-100 text-amber-700' },
  { value: 'other', label: 'Other', icon: '➕', color: 'bg-gray-100 text-gray-700' }
]

export default function ClientsPage() {
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
    active: 0,
    vip: 0,
    newThisMonth: 0,
    totalRevenue: 0
  })

  const supabase = createClient()

  useEffect(() => {
    fetchClients()
    fetchStats()
  }, [filters])

  const fetchClients = async () => {
    try {
      setLoading(true)
      let query = supabase
        .from('clients')
        .select('*')

      // Apply search filter
      if (filters.search) {
        query = query.or(`full_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,client_code.ilike.%${filters.search}%`)
      }

      // Apply status filter
      if (filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }

      // Apply client type filter
      if (filters.clientType !== 'all') {
        query = query.eq('client_type', filters.clientType)
      }

      // Apply lead source filter
      if (filters.leadSource !== 'all') {
        query = query.eq('lead_source', filters.leadSource)
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

      // Apply sorting
      switch (filters.sortBy) {
        case 'name':
          query = query.order('full_name', { ascending: true })
          break
        case 'name_desc':
          query = query.order('full_name', { ascending: false })
          break
        case 'revenue':
          query = query.order('created_at', { ascending: false })
          break
        case 'revenue_asc':
          query = query.order('created_at', { ascending: true })
          break
        case 'bookings':
          query = query.order('created_at', { ascending: false })
          break
        case 'recent':
          query = query.order('created_at', { ascending: false })
          break
        case 'oldest':
          query = query.order('created_at', { ascending: true })
          break
        default:
          query = query.order('created_at', { ascending: false })
      }

      const { data, error } = await query

      if (error) throw error
      setClients(data || [])
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
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', deleteModal.clientId)

      if (error) throw error
      
      closeDeleteModal()
      fetchClients()
    } catch (error) {
      console.error('Error deleting client:', error)
      alert('Failed to delete client. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const fetchStats = async () => {
    try {
      const { data: allClients } = await supabase
        .from('clients')
        .select('status, vip_status, created_at')

      if (allClients) {
        const now = new Date()
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

        setStats({
          total: allClients.length,
          active: allClients.filter(c => c.status === 'active').length,
          vip: allClients.filter(c => c.vip_status).length,
          newThisMonth: allClients.filter(c => new Date(c.created_at) >= firstDayOfMonth).length,
          totalRevenue: 0 // Revenue tracking not yet implemented
        })
      }
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'inactive': return 'bg-gray-100 text-gray-800'
      case 'prospect': return 'bg-primary-100 text-primary-800'
      case 'blacklisted': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'individual': return 'bg-purple-100 text-purple-800'
      case 'family': return 'bg-pink-100 text-pink-800'
      case 'group': return 'bg-orange-100 text-orange-800'
      case 'corporate': return 'bg-primary-100 text-primary-800'
      case 'agent': return 'bg-indigo-100 text-indigo-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getLeadSourceConfig = (source: string | undefined) => {
    return LEAD_SOURCES.find(s => s.value === source) || null
  }

  return (
    <RequireFeature feature="b2c">
      <div className="min-h-screen bg-gray-50">
      {/* Delete Confirmation Modal */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Delete Client</h3>
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
            <p className="text-xs text-gray-600">Active</p>
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
            <p className="text-xs text-gray-600">Total Revenue</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              €{stats.totalRevenue.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Enhanced Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4">
          {/* Search Bar - Always Visible */}
          <div className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search by name, email, phone, or client code..."
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent shadow-sm"
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
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="prospect">Prospect</option>
                    <option value="blacklisted">Blacklisted</option>
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
                    max={new Date().toISOString().split('T')[0]}
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
                    const leadSourceConfig = getLeadSourceConfig(client.lead_source)
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
                              {client.status}
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
                          <div className="font-semibold">0</div>
                          <div className="text-xs text-gray-500">bookings</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <div className="font-semibold text-green-600">
                            €0
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
                              onClick={() => openDeleteModal(client.id, client.full_name)}
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
    </RequireFeature>
  )
}