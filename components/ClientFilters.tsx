'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/app/supabase'
import Link from 'next/link'
import {
  Filter, X, Star, TrendingUp, Calendar,
  User, Building, Users, ChevronDown, SlidersHorizontal
} from 'lucide-react'

const supabase = createClient()

// Add this filter component at the top of your clients page
export function ClientFilters({ onFilterChange }: { onFilterChange: (filters: any) => void }) {
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    clientType: 'all',
    vipOnly: false,
    sortBy: 'name',
    dateFrom: '',
    dateTo: ''
  })

  const handleFilterChange = (key: string, value: any) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    onFilterChange(newFilters)
  }

  const clearFilters = () => {
    const defaultFilters = {
      search: '',
      status: 'all',
      clientType: 'all',
      vipOnly: false,
      sortBy: 'name',
      dateFrom: '',
      dateTo: ''
    }
    setFilters(defaultFilters)
    onFilterChange(defaultFilters)
  }

  const hasActiveFilters = 
    filters.search || 
    filters.status !== 'all' || 
    filters.clientType !== 'all' || 
    filters.vipOnly || 
    filters.dateFrom || 
    filters.dateTo

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
      {/* Search Bar - Always Visible */}
      <div className="p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full pl-4 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
              showFilters || hasActiveFilters
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {hasActiveFilters && (
              <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {[filters.status !== 'all', filters.clientType !== 'all', filters.vipOnly, filters.dateFrom, filters.dateTo].filter(Boolean).length}
              </span>
            )}
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client Type
              </label>
              <select
                value={filters.clientType}
                onChange={(e) => handleFilterChange('clientType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Types</option>
                <option value="individual">Individual</option>
                <option value="family">Family</option>
                <option value="corporate">Corporate</option>
                <option value="travel_agent">Travel Agent</option>
                <option value="group">Group</option>
              </select>
            </div>

            {/* Sort By */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sort By
              </label>
              <select
                value={filters.sortBy}
                onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="name">Name (A-Z)</option>
                <option value="name_desc">Name (Z-A)</option>
                <option value="revenue">Revenue (High to Low)</option>
                <option value="revenue_asc">Revenue (Low to High)</option>
                <option value="bookings">Bookings (Most)</option>
                <option value="recent">Most Recent</option>
                <option value="oldest">Oldest First</option>
              </select>
            </div>

            {/* VIP Toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                VIP Clients
              </label>
              <label className="flex items-center gap-3 px-3 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={filters.vipOnly}
                  onChange={(e) => handleFilterChange('vipOnly', e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
                <Star className="w-4 h-4 text-yellow-500" />
                <span className="text-sm text-gray-700">VIP Only</span>
              </label>
            </div>
          </div>

          {/* Date Range */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Member Since (From)
              </label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Member Since (To)
              </label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Filter logic to apply to your clients query
export function applyClientFilters(query: any, filters: any) {
  // Search filter
  if (filters.search) {
    query = query.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`)
  }

  // Status filter
  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  // Client type filter
  if (filters.clientType && filters.clientType !== 'all') {
    query = query.eq('client_type', filters.clientType)
  }

  // VIP filter
  if (filters.vipOnly) {
    query = query.eq('vip_status', true)
  }

  // Date range filter
  if (filters.dateFrom) {
    query = query.gte('created_at', filters.dateFrom)
  }
  if (filters.dateTo) {
    query = query.lte('created_at', filters.dateTo + 'T23:59:59')
  }

  // Sort
  switch (filters.sortBy) {
    case 'name':
      query = query.order('first_name', { ascending: true })
      break
    case 'name_desc':
      query = query.order('first_name', { ascending: false })
      break
    case 'revenue':
      query = query.order('total_revenue_generated', { ascending: false })
      break
    case 'revenue_asc':
      query = query.order('total_revenue_generated', { ascending: true })
      break
    case 'bookings':
      query = query.order('total_bookings_count', { ascending: false })
      break
    case 'recent':
      query = query.order('created_at', { ascending: false })
      break
    case 'oldest':
      query = query.order('created_at', { ascending: true })
      break
    default:
      query = query.order('first_name', { ascending: true })
  }

  return query
}