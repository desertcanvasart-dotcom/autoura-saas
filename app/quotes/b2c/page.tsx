'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import {
  FileText, User, Calendar, Eye, CheckCircle, XCircle, Clock,
  DollarSign, Filter, Search, ChevronRight, AlertCircle, Loader2,
  Trash2, Download, Check, X, SlidersHorizontal, ChevronLeft
} from 'lucide-react'
import RequireFeature from '@/components/RequireFeature'

interface B2CQuote {
  id: string
  quote_number: string
  status: string
  num_travelers: number
  tier: string
  selling_price: number
  price_per_person: number
  currency: string
  created_at: string
  valid_until: string | null
  clients: {
    id: string
    full_name: string
    email: string
  } | null
  itineraries: {
    id: string
    itinerary_code: string
    trip_name: string
    start_date: string
  } | null
}

const STATUS_COLORS: Record<string, { bg: string; text: string; icon: any }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock },
  sent: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Eye },
  viewed: { bg: 'bg-purple-100', text: 'text-purple-700', icon: Eye },
  accepted: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
  rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
  expired: { bg: 'bg-orange-100', text: 'text-orange-700', icon: AlertCircle }
}

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  budget: { bg: 'bg-gray-50', text: 'text-gray-700' },
  standard: { bg: 'bg-blue-50', text: 'text-blue-700' },
  deluxe: { bg: 'bg-purple-50', text: 'text-purple-700' },
  luxury: { bg: 'bg-amber-50', text: 'text-amber-700' }
}

export default function B2CQuotesPage() {
  const supabase = createClient()
  const [quotes, setQuotes] = useState<B2CQuote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedQuotes, setSelectedQuotes] = useState<Set<string>>(new Set())
  const [bulkActionLoading, setBulkActionLoading] = useState(false)

  // Advanced filters
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [tierFilter, setTierFilter] = useState<string[]>([])
  const [currencyFilter, setCurrencyFilter] = useState<string[]>([])
  const [createdFrom, setCreatedFrom] = useState<string>('')
  const [createdTo, setCreatedTo] = useState<string>('')
  const [validUntilFrom, setValidUntilFrom] = useState<string>('')
  const [validUntilTo, setValidUntilTo] = useState<string>('')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    fetchQuotes()
  }, [])

  const fetchQuotes = async () => {
    try {
      setLoading(true)
      // Always fetch all quotes to calculate status counts
      const { data, error } = await supabase
        .from('b2c_quotes')
        .select(`
          *,
          clients (
            id,
            full_name,
            email
          ),
          itineraries (
            id,
            itinerary_code,
            trip_name,
            start_date
          )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setQuotes(data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredQuotes = quotes.filter(quote => {
    // Filter by status
    if (statusFilter !== 'all' && quote.status !== statusFilter) return false

    // Filter by tier
    if (tierFilter.length > 0 && !tierFilter.includes(quote.tier)) return false

    // Filter by currency
    if (currencyFilter.length > 0 && !currencyFilter.includes(quote.currency)) return false

    // Filter by created date range
    if (createdFrom) {
      const quoteDate = new Date(quote.created_at)
      const filterDate = new Date(createdFrom)
      if (quoteDate < filterDate) return false
    }
    if (createdTo) {
      const quoteDate = new Date(quote.created_at)
      const filterDate = new Date(createdTo)
      filterDate.setHours(23, 59, 59, 999) // End of day
      if (quoteDate > filterDate) return false
    }

    // Filter by valid until date range
    if (validUntilFrom && quote.valid_until) {
      const quoteDate = new Date(quote.valid_until)
      const filterDate = new Date(validUntilFrom)
      if (quoteDate < filterDate) return false
    }
    if (validUntilTo && quote.valid_until) {
      const quoteDate = new Date(quote.valid_until)
      const filterDate = new Date(validUntilTo)
      filterDate.setHours(23, 59, 59, 999)
      if (quoteDate > filterDate) return false
    }

    // Filter by search query
    if (!searchQuery) return true
    const search = searchQuery.toLowerCase()
    return (
      quote.quote_number.toLowerCase().includes(search) ||
      quote.clients?.full_name?.toLowerCase().includes(search) ||
      quote.itineraries?.trip_name?.toLowerCase().includes(search)
    )
  })

  // Calculate status counts from all quotes
  const statusCounts = {
    all: quotes.length,
    draft: quotes.filter(q => q.status === 'draft').length,
    sent: quotes.filter(q => q.status === 'sent').length,
    viewed: quotes.filter(q => q.status === 'viewed').length,
    accepted: quotes.filter(q => q.status === 'accepted').length,
    rejected: quotes.filter(q => q.status === 'rejected').length,
    expired: quotes.filter(q => q.status === 'expired').length
  }

  const stats = {
    total: quotes.length,
    draft: statusCounts.draft,
    sent: statusCounts.sent + statusCounts.viewed,
    accepted: statusCounts.accepted
  }

  // Get unique tiers and currencies from quotes
  const availableTiers = Array.from(new Set(quotes.map(q => q.tier)))
  const availableCurrencies = Array.from(new Set(quotes.map(q => q.currency)))

  // Count active filters
  const activeFiltersCount =
    (statusFilter !== 'all' ? 1 : 0) +
    tierFilter.length +
    currencyFilter.length +
    (createdFrom ? 1 : 0) +
    (createdTo ? 1 : 0) +
    (validUntilFrom ? 1 : 0) +
    (validUntilTo ? 1 : 0)

  // Clear all filters
  const clearAllFilters = () => {
    setStatusFilter('all')
    setTierFilter([])
    setCurrencyFilter([])
    setCreatedFrom('')
    setCreatedTo('')
    setValidUntilFrom('')
    setValidUntilTo('')
    setSearchQuery('')
  }

  // Toggle filter arrays
  const toggleTierFilter = (tier: string) => {
    setTierFilter(prev =>
      prev.includes(tier) ? prev.filter(t => t !== tier) : [...prev, tier]
    )
  }

  const toggleCurrencyFilter = (currency: string) => {
    setCurrencyFilter(prev =>
      prev.includes(currency) ? prev.filter(c => c !== currency) : [...prev, currency]
    )
  }

  // Pagination logic
  const totalPages = Math.ceil(filteredQuotes.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const paginatedQuotes = filteredQuotes.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [statusFilter, tierFilter, currencyFilter, createdFrom, createdTo, validUntilFrom, validUntilTo, searchQuery])

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  const changePageSize = (size: number) => {
    setPageSize(size)
    setCurrentPage(1)
  }

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedQuotes.size === filteredQuotes.length) {
      setSelectedQuotes(new Set())
    } else {
      setSelectedQuotes(new Set(filteredQuotes.map(q => q.id)))
    }
  }

  const handleSelectQuote = (quoteId: string) => {
    const newSelected = new Set(selectedQuotes)
    if (newSelected.has(quoteId)) {
      newSelected.delete(quoteId)
    } else {
      newSelected.add(quoteId)
    }
    setSelectedQuotes(newSelected)
  }

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedQuotes.size === 0) return

    const confirmed = confirm(
      `Are you sure you want to change ${selectedQuotes.size} quote(s) to "${newStatus}"?`
    )
    if (!confirmed) return

    try {
      setBulkActionLoading(true)

      const response = await fetch('/api/quotes/b2c/bulk-update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote_ids: Array.from(selectedQuotes),
          status: newStatus,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update quotes')
      }

      await fetchQuotes()
      setSelectedQuotes(new Set())
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setBulkActionLoading(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedQuotes.size === 0) return

    const confirmed = confirm(
      `Are you sure you want to delete ${selectedQuotes.size} quote(s)? This action cannot be undone.`
    )
    if (!confirmed) return

    try {
      setBulkActionLoading(true)

      const response = await fetch('/api/quotes/b2c/bulk-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote_ids: Array.from(selectedQuotes),
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to delete quotes')
      }

      await fetchQuotes()
      setSelectedQuotes(new Set())
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setBulkActionLoading(false)
    }
  }

  const handleExportCSV = () => {
    const quotesToExport = filteredQuotes.filter(q => selectedQuotes.has(q.id))
    if (quotesToExport.length === 0) return

    const csvHeaders = [
      'Quote Number',
      'Client',
      'Email',
      'Trip',
      'Start Date',
      'Travelers',
      'Tier',
      'Status',
      'Total Price',
      'Currency',
      'Created At',
      'Valid Until'
    ]

    const csvRows = quotesToExport.map(quote => [
      quote.quote_number,
      quote.clients?.full_name || '',
      quote.clients?.email || '',
      quote.itineraries?.trip_name || '',
      quote.itineraries?.start_date || '',
      quote.num_travelers,
      quote.tier,
      quote.status,
      quote.selling_price,
      quote.currency,
      new Date(quote.created_at).toLocaleDateString(),
      quote.valid_until ? new Date(quote.valid_until).toLocaleDateString() : ''
    ])

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `b2c-quotes-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <RequireFeature feature="b2c">
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">B2C Quotes</h1>
                <p className="text-sm text-gray-500">Direct client quotes with margin pricing</p>
              </div>
            </div>

            <Link
              href="/whatsapp-parser"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              New Quote
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mt-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-xs text-gray-500">Total Quotes</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-700">{stats.draft}</div>
              <div className="text-xs text-gray-500">Drafts</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-blue-700">{stats.sent}</div>
              <div className="text-xs text-blue-600">Sent/Viewed</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-700">{stats.accepted}</div>
              <div className="text-xs text-green-600">Accepted</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-4">
            {/* Select All Checkbox */}
            {filteredQuotes.length > 0 && (
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedQuotes.size === filteredQuotes.length && filteredQuotes.length > 0}
                  onChange={handleSelectAll}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  aria-label="Select all quotes"
                />
              </div>
            )}

            {/* Search */}
            <div className="flex-1 relative">
              <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by quote #, client name, or trip..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                aria-label="Filter by status"
              >
                <option value="all">All Status ({statusCounts.all})</option>
                <option value="draft">Draft ({statusCounts.draft})</option>
                <option value="sent">Sent ({statusCounts.sent})</option>
                <option value="viewed">Viewed ({statusCounts.viewed})</option>
                <option value="accepted">Accepted ({statusCounts.accepted})</option>
                <option value="rejected">Rejected ({statusCounts.rejected})</option>
                <option value="expired">Expired ({statusCounts.expired})</option>
              </select>
            </div>

            {/* Advanced Filters Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`px-4 py-2 border rounded-lg text-sm font-medium flex items-center gap-2 ${
                activeFiltersCount > 0
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {activeFiltersCount > 0 && (
                <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Tier Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tier
                </label>
                <div className="flex flex-wrap gap-2">
                  {['budget', 'standard', 'deluxe', 'luxury'].map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => toggleTierFilter(tier)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors ${
                        tierFilter.includes(tier)
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {tier.charAt(0).toUpperCase() + tier.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Currency Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Currency
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableCurrencies.map((currency) => (
                    <button
                      key={currency}
                      type="button"
                      onClick={() => toggleCurrencyFilter(currency)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors ${
                        currencyFilter.includes(currency)
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {currency}
                    </button>
                  ))}
                </div>
              </div>

              {/* Created Date Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Created Date
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={createdFrom}
                    onChange={(e) => setCreatedFrom(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    aria-label="Created from date"
                  />
                  <span className="text-gray-500 text-sm">to</span>
                  <input
                    type="date"
                    value={createdTo}
                    onChange={(e) => setCreatedTo(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    aria-label="Created to date"
                  />
                </div>
              </div>

              {/* Valid Until Date Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Valid Until
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={validUntilFrom}
                    onChange={(e) => setValidUntilFrom(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    aria-label="Valid from date"
                  />
                  <span className="text-gray-500 text-sm">to</span>
                  <input
                    type="date"
                    value={validUntilTo}
                    onChange={(e) => setValidUntilTo(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    aria-label="Valid to date"
                  />
                </div>
              </div>
            </div>

            {/* Clear Filters Button */}
            {activeFiltersCount > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* Active Filter Chips */}
        {activeFiltersCount > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {statusFilter !== 'all' && (
              <div className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm">
                <span>Status: {statusFilter}</span>
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className="hover:bg-blue-200 rounded p-0.5"
                  aria-label={`Remove status filter: ${statusFilter}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {tierFilter.map((tier) => (
              <div
                key={tier}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm"
              >
                <span>Tier: {tier}</span>
                <button
                  type="button"
                  onClick={() => toggleTierFilter(tier)}
                  className="hover:bg-blue-200 rounded p-0.5"
                  aria-label={`Remove tier filter: ${tier}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {currencyFilter.map((currency) => (
              <div
                key={currency}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm"
              >
                <span>Currency: {currency}</span>
                <button
                  type="button"
                  onClick={() => toggleCurrencyFilter(currency)}
                  className="hover:bg-blue-200 rounded p-0.5"
                  aria-label={`Remove currency filter: ${currency}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {createdFrom && (
              <div className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm">
                <span>From: {new Date(createdFrom).toLocaleDateString()}</span>
                <button
                  type="button"
                  onClick={() => setCreatedFrom('')}
                  className="hover:bg-blue-200 rounded p-0.5"
                  aria-label="Remove created from date filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {createdTo && (
              <div className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm">
                <span>To: {new Date(createdTo).toLocaleDateString()}</span>
                <button
                  type="button"
                  onClick={() => setCreatedTo('')}
                  className="hover:bg-blue-200 rounded p-0.5"
                  aria-label="Remove created to date filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {validUntilFrom && (
              <div className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm">
                <span>Valid from: {new Date(validUntilFrom).toLocaleDateString()}</span>
                <button
                  type="button"
                  onClick={() => setValidUntilFrom('')}
                  className="hover:bg-blue-200 rounded p-0.5"
                  aria-label="Remove valid from date filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {validUntilTo && (
              <div className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm">
                <span>Valid to: {new Date(validUntilTo).toLocaleDateString()}</span>
                <button
                  type="button"
                  onClick={() => setValidUntilTo('')}
                  className="hover:bg-blue-200 rounded p-0.5"
                  aria-label="Remove valid to date filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Bulk Actions Bar */}
        {selectedQuotes.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-blue-900">
                    {selectedQuotes.size} quote{selectedQuotes.size > 1 ? 's' : ''} selected
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedQuotes(new Set())}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Clear selection
                </button>
              </div>

              <div className="flex items-center gap-2">
                {/* Change Status Dropdown */}
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleBulkStatusChange(e.target.value)
                      e.target.value = ''
                    }
                  }}
                  disabled={bulkActionLoading}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                  aria-label="Change status for selected quotes"
                >
                  <option value="">Change Status...</option>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="viewed">Viewed</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                  <option value="expired">Expired</option>
                </select>

                {/* Export CSV */}
                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={bulkActionLoading}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={bulkActionLoading}
                  className="px-4 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 flex items-center gap-2 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quotes List */}
      <div className="max-w-7xl mx-auto px-4 pb-8">
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading quotes...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Error loading quotes</p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
            </div>
          </div>
        ) : filteredQuotes.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-sm font-medium text-gray-600 mb-1">
              {searchQuery ? 'No quotes found' : 'No B2C quotes yet'}
            </h3>
            <p className="text-xs text-gray-400">
              {searchQuery ? 'Try adjusting your search filters' : 'Create your first quote from the WhatsApp parser'}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {paginatedQuotes.map((quote) => {
              const statusConfig = STATUS_COLORS[quote.status] || STATUS_COLORS.draft
              const tierConfig = TIER_COLORS[quote.tier] || TIER_COLORS.standard
              const StatusIcon = statusConfig.icon
              const isSelected = selectedQuotes.has(quote.id)

              return (
                <div
                  key={quote.id}
                  className={`bg-white rounded-xl border-2 p-4 transition-all ${
                    isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Checkbox */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSelectQuote(quote.id)
                      }}
                      className="flex-shrink-0 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleSelectQuote(quote.id)}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                        aria-label={`Select quote ${quote.quote_number}`}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>

                    {/* Quote Content - Clickable Link */}
                    <Link
                      href={`/quotes/b2c/${quote.id}`}
                      className="flex-1 hover:opacity-80 transition-opacity"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-lg font-bold text-gray-900">{quote.quote_number}</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text} flex items-center gap-1`}>
                          <StatusIcon className="w-3 h-3" />
                          {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${tierConfig.bg} ${tierConfig.text}`}>
                          {quote.tier.charAt(0).toUpperCase() + quote.tier.slice(1)}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="flex items-center gap-2 text-gray-500 mb-1">
                            <User className="w-4 h-4" />
                            <span className="text-xs">Client</span>
                          </div>
                          <div className="font-medium text-gray-900">
                            {quote.clients?.full_name || 'No client'}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center gap-2 text-gray-500 mb-1">
                            <FileText className="w-4 h-4" />
                            <span className="text-xs">Trip</span>
                          </div>
                          <div className="font-medium text-gray-900">
                            {quote.itineraries?.trip_name || 'No itinerary'}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center gap-2 text-gray-500 mb-1">
                            <Calendar className="w-4 h-4" />
                            <span className="text-xs">Start Date</span>
                          </div>
                          <div className="font-medium text-gray-900">
                            {quote.itineraries?.start_date
                              ? new Date(quote.itineraries.start_date).toLocaleDateString()
                              : 'TBD'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 ml-6">
                      <div className="text-right">
                        <div className="text-xs text-gray-500 mb-1">Total Price</div>
                        <div className="text-2xl font-bold text-gray-900">
                          {quote.currency} {quote.selling_price.toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500">
                          {quote.currency} {quote.price_per_person.toLocaleString()} / person × {quote.num_travelers}
                        </div>
                      </div>

                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </div>
                    </div>
                  </Link>
                  </div>
                </div>
              )
              })}
            </div>

            {/* Pagination Controls */}
            {filteredQuotes.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 mt-4">
                <div className="flex items-center justify-between">
                  {/* Results Info */}
                  <div className="text-sm text-gray-600">
                    Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                    <span className="font-medium">{Math.min(endIndex, filteredQuotes.length)}</span> of{' '}
                    <span className="font-medium">{filteredQuotes.length}</span> quotes
                  </div>

                  {/* Page Size Selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Show:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => changePageSize(Number(e.target.value))}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      aria-label="Results per page"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  {/* Page Navigation */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </button>

                    {/* Page Numbers */}
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        let pageNum
                        if (totalPages <= 5) {
                          pageNum = i + 1
                        } else if (currentPage <= 3) {
                          pageNum = i + 1
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i
                        } else {
                          pageNum = currentPage - 2 + i
                        }

                        return (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => goToPage(pageNum)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                              currentPage === pageNum
                                ? 'bg-blue-600 text-white'
                                : 'border border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {pageNum}
                          </button>
                        )
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      </div>
    </RequireFeature>
  )
}
