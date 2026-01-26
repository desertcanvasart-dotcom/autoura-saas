// =====================================================
// CONTENT LIBRARY - MAIN PAGE
// =====================================================
// 📁 COPY TO: app/content-library/page.tsx
// =====================================================

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/app/supabase'
import Link from 'next/link'
import {
  Search,
  Plus,
  Landmark,
  Hotel,
  Sparkles,
  UtensilsCrossed,
  Car,
  Ship,
  Calendar,
  MessageSquare,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  ChevronRight,
  BookOpen,
  AlertCircle,
  CheckCircle2,
  X,
  Library
} from 'lucide-react'

// Icon mapping for categories
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'Landmark': Landmark,
  'Hotel': Hotel,
  'Sparkles': Sparkles,
  'UtensilsCrossed': UtensilsCrossed,
  'Car': Car,
  'Ship': Ship,
  'Calendar': Calendar,
  'MessageSquare': MessageSquare,
}

// Tier badge colors
const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  budget: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  standard: { bg: 'bg-blue-50', text: 'text-blue-700' },
  deluxe: { bg: 'bg-purple-50', text: 'text-purple-700' },
  luxury: { bg: 'bg-amber-50', text: 'text-amber-700' },
}

interface Category {
  id: string
  name: string
  slug: string
  icon: string | null
  content_count?: number
}

interface ContentItem {
  id: string
  name: string
  slug: string
  short_description: string | null
  location: string | null
  duration: string | null
  tags: string[]
  is_active: boolean
  category: {
    id: string
    name: string
    slug: string
    icon: string | null
  }
  variation_count: number
  missing_tiers: string[]
}

export default function ContentLibraryPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [content, setContent] = useState<ContentItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const supabase = createClient()

  // Fetch categories with counts
  useEffect(() => {
    fetchCategories()
  }, [])

  // Fetch content when category or search changes
  useEffect(() => {
    fetchContent()
  }, [selectedCategory, searchQuery])

  async function fetchCategories() {
    try {
      const response = await fetch('/api/content-library/categories?include_count=true')
      if (!response.ok) throw new Error('Failed to fetch categories')
      const data = await response.json()
      setCategories(data)
    } catch (err) {
      console.error('Error fetching categories:', err)
      setError('Failed to load categories')
    }
  }

  async function fetchContent() {
    setLoading(true)
    try {
      let url = '/api/content-library?'
      if (selectedCategory) url += `category_id=${selectedCategory}&`
      if (searchQuery) url += `search=${encodeURIComponent(searchQuery)}&`
      
      const response = await fetch(url)
      if (!response.ok) throw new Error('Failed to fetch content')
      const data = await response.json()
      setContent(data.data || [])
    } catch (err) {
      console.error('Error fetching content:', err)
      setError('Failed to load content')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const response = await fetch(`/api/content-library?id=${id}`, {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error('Failed to delete')
      
      setContent(content.filter(c => c.id !== id))
      setShowDeleteConfirm(false)
      setDeleteId(null)
      fetchCategories() // Refresh counts
    } catch (err) {
      console.error('Error deleting content:', err)
      setError('Failed to delete content')
    }
  }

  const totalContent = categories.reduce((sum, cat) => sum + (cat.content_count || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#647C47]/10 rounded-lg">
                <Library className="w-6 h-6 text-[#647C47]" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">Content Library</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {totalContent} items across {categories.length} categories
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/content-library/rules"
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <BookOpen className="w-4 h-4" />
                Writing Rules
              </Link>
              <Link
                href="/content-library/new"
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f613a] transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Content
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Category Filters */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === null
                  ? 'bg-[#647C47] text-white'
                  : 'bg-white text-gray-700 border border-gray-200 hover:border-[#647C47]'
              }`}
            >
              All
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                selectedCategory === null ? 'bg-white/20' : 'bg-gray-100'
              }`}>
                {totalContent}
              </span>
            </button>
            {categories.map(category => {
              const IconComponent = CATEGORY_ICONS[category.icon || ''] || Landmark
              return (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedCategory === category.id
                      ? 'bg-[#647C47] text-white'
                      : 'bg-white text-gray-700 border border-gray-200 hover:border-[#647C47]'
                  }`}
                >
                  <IconComponent className="w-4 h-4" />
                  {category.name}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    selectedCategory === category.id ? 'bg-white/20' : 'bg-gray-100'
                  }`}>
                    {category.content_count || 0}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search content by name, description, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Content Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-3"></div>
                <div className="h-4 bg-gray-100 rounded w-1/2 mb-4"></div>
                <div className="h-16 bg-gray-100 rounded mb-4"></div>
                <div className="flex gap-2">
                  <div className="h-6 bg-gray-100 rounded w-16"></div>
                  <div className="h-6 bg-gray-100 rounded w-16"></div>
                </div>
              </div>
            ))}
          </div>
        ) : content.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <Library className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No content found</h3>
            <p className="text-gray-500 mb-6">
              {searchQuery 
                ? `No results for "${searchQuery}"`
                : selectedCategory 
                  ? 'No content in this category yet'
                  : 'Start building your content library'
              }
            </p>
            <Link
              href="/content-library/new"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f613a] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add First Content
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {content.map(item => {
              const IconComponent = CATEGORY_ICONS[item.category?.icon || ''] || Landmark
              const hasAllTiers = item.missing_tiers.length === 0
              
              return (
                <div
                  key={item.id}
                  className="bg-white rounded-xl border border-gray-200 hover:border-[#647C47]/50 hover:shadow-md transition-all group"
                >
                  <div className="p-5">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-gray-100 rounded-lg">
                          <IconComponent className="w-4 h-4 text-gray-600" />
                        </div>
                        <span className="text-xs text-gray-500">{item.category?.name}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link
                          href={`/content-library/${item.id}`}
                          className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => {
                            setDeleteId(item.id)
                            setShowDeleteConfirm(true)
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Title & Location */}
                    <Link href={`/content-library/${item.id}`}>
                      <h3 className="font-semibold text-gray-900 mb-1 hover:text-[#647C47] transition-colors">
                        {item.name}
                      </h3>
                    </Link>
                    {item.location && (
                      <p className="text-sm text-gray-500 mb-2">{item.location}</p>
                    )}

                    {/* Description */}
                    {item.short_description && (
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                        {item.short_description}
                      </p>
                    )}

                    {/* Tier Status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {hasAllTiers ? (
                          <div className="flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>All tiers</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-xs text-amber-600">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>{item.variation_count}/4 tiers</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Tier Indicators - B S D L */}
                      <div className="flex gap-0.5">
                        {[
                          { key: 'budget', label: 'B', color: 'bg-emerald-500' },
                          { key: 'standard', label: 'S', color: 'bg-blue-500' },
                          { key: 'deluxe', label: 'D', color: 'bg-purple-500' },
                          { key: 'luxury', label: 'L', color: 'bg-amber-500' }
                        ].map(tier => {
                          const hasTier = !item.missing_tiers.includes(tier.key)
                          return (
                            <div
                              key={tier.key}
                              className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center ${
                                hasTier
                                  ? `${tier.color} text-white`
                                  : 'bg-gray-200 text-gray-400'
                              }`}
                              title={`${tier.key.charAt(0).toUpperCase() + tier.key.slice(1)}: ${hasTier ? 'Complete' : 'Missing'}`}
                            >
                              {tier.label}
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Tags */}
                    {item.tags && item.tags.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-1">
                        {item.tags.slice(0, 4).map(tag => (
                          <span
                            key={tag}
                            className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                        {item.tags.length > 4 && (
                          <span className="text-xs px-2 py-0.5 text-gray-400">
                            +{item.tags.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Content?</h3>
            <p className="text-gray-600 mb-6">
              This will permanently delete this content and all its tier variations. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeleteId(null)
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteId && handleDelete(deleteId)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}