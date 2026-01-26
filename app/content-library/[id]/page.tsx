// =====================================================
// CONTENT LIBRARY - DYNAMIC EDITOR PAGE
// =====================================================
// 📁 REPLACE: app/content-library/[id]/page.tsx
// =====================================================

'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  Save, 
  Loader2,
  Wallet,
  Star,
  Gem,
  Crown,
  Plus,
  X,
  Check,
  Info,
  Landmark,
  Hotel,
  Sparkles,
  UtensilsCrossed,
  Car,
  Ship,
  Calendar,
  MessageSquare
} from 'lucide-react'
import { 
  CATEGORY_SCHEMAS, 
  getCategorySchema, 
  getSchemaBySlug,
  getDefaultMetadata,
  type CategorySchema,
  type CategoryField 
} from '@/lib/content-library/category-schemas'

// =====================================================
// TYPES
// =====================================================

interface ContentCategory {
  id: string
  name: string
  slug: string
  icon: string | null
}

interface ContentVariation {
  id?: string
  tier: 'budget' | 'standard' | 'deluxe' | 'luxury'
  title: string
  description: string
  highlights: string[]
  inclusions: string[]
  internal_notes: string
  is_active: boolean
}

interface ContentItem {
  id?: string
  category_id: string
  name: string
  slug: string
  short_description: string
  location: string
  duration: string
  tags: string[]
  metadata: Record<string, unknown>
  is_active: boolean
  variations: ContentVariation[]
}

const TIERS = ['budget', 'standard', 'deluxe', 'luxury'] as const
type Tier = typeof TIERS[number]

const TIER_CONFIG: Record<Tier, { label: string; icon: typeof Wallet; color: string; bgColor: string }> = {
  budget: { label: 'Budget', icon: Wallet, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  standard: { label: 'Standard', icon: Star, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  deluxe: { label: 'Deluxe', icon: Gem, color: 'text-purple-600', bgColor: 'bg-purple-50' },
  luxury: { label: 'Luxury', icon: Crown, color: 'text-amber-600', bgColor: 'bg-amber-50' }
}

const CATEGORY_ICONS: Record<string, typeof Landmark> = {
  'Landmark': Landmark,
  'Hotel': Hotel,
  'Sparkles': Sparkles,
  'UtensilsCrossed': UtensilsCrossed,
  'Car': Car,
  'Ship': Ship,
  'Calendar': Calendar,
  'MessageSquare': MessageSquare
}

// =====================================================
// DYNAMIC FORM FIELD COMPONENT
// =====================================================

interface DynamicFieldProps {
  field: CategoryField
  value: unknown
  onChange: (name: string, value: unknown) => void
}

function DynamicField({ field, value, onChange }: DynamicFieldProps) {
  const handleChange = (newValue: unknown) => {
    onChange(field.name, newValue)
  }

  switch (field.type) {
    case 'text':
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          <input
            type="text"
            value={(value as string) || ''}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={field.placeholder}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
          />
          {field.helpText && (
            <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
              <Info className="w-3 h-3" />
              {field.helpText}
            </p>
          )}
        </div>
      )

    case 'textarea':
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          <textarea
            value={(value as string) || ''}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47] resize-none"
          />
          {field.helpText && (
            <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
              <Info className="w-3 h-3" />
              {field.helpText}
            </p>
          )}
        </div>
      )

    case 'number':
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          <input
            type="number"
            value={(value as number) || ''}
            onChange={(e) => handleChange(parseInt(e.target.value) || 0)}
            min={field.min}
            max={field.max}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
          />
        </div>
      )

    case 'select':
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          <select
            value={(value as string) || ''}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47] bg-white"
          >
            <option value="">Select...</option>
            {(field.options as string[])?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      )

    case 'multi-select':
      const selectedValues = (value as string[]) || []
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          <div className="flex flex-wrap gap-2 p-3 border border-gray-200 rounded-lg min-h-[48px] bg-white">
            {(field.options as string[])?.map((opt) => {
              const isSelected = selectedValues.includes(opt)
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      handleChange(selectedValues.filter(v => v !== opt))
                    } else {
                      handleChange([...selectedValues, opt])
                    }
                  }}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-all whitespace-nowrap ${
                    isSelected 
                      ? 'bg-[#647C47] text-white shadow-sm' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {opt}
                </button>
              )
            })}
          </div>
          {selectedValues.length > 0 && (
            <p className="mt-1.5 text-xs text-gray-500">
              {selectedValues.length} selected
            </p>
          )}
        </div>
      )

    case 'checkboxes':
      const checkedValues = (value as string[]) || []
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(field.options as string[])?.map((opt) => {
              const isChecked = checkedValues.includes(opt)
              return (
                <label
                  key={opt}
                  className={`flex items-center gap-3 px-3 py-2.5 border rounded-lg cursor-pointer transition-all ${
                    isChecked 
                      ? 'border-[#647C47] bg-[#647C47]/5 shadow-sm' 
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        handleChange([...checkedValues, opt])
                      } else {
                        handleChange(checkedValues.filter(v => v !== opt))
                      }
                    }}
                    className="w-4 h-4 text-[#647C47] rounded border-gray-300 focus:ring-[#647C47] flex-shrink-0"
                  />
                  <span className="text-sm text-gray-700 leading-tight">{opt}</span>
                </label>
              )
            })}
          </div>
        </div>
      )

    case 'boolean':
      return (
        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                checked={(value as boolean) || false}
                onChange={(e) => handleChange(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-10 h-6 rounded-full transition-colors ${
                value ? 'bg-[#647C47]' : 'bg-gray-200'
              }`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow absolute top-1 transition-transform ${
                  value ? 'translate-x-5' : 'translate-x-1'
                }`} />
              </div>
            </div>
            <span className="text-sm font-medium text-gray-700">{field.label}</span>
          </label>
        </div>
      )

    case 'time':
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          <input
            type="time"
            value={(value as string) || ''}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
          />
        </div>
      )

    case 'rating':
      const rating = (value as number) || 0
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          <div className="flex gap-1">
            {Array.from({ length: field.max || 5 }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleChange(i + 1)}
                className={`w-8 h-8 rounded transition-colors ${
                  i < rating 
                    ? 'bg-amber-400 text-white' 
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
              >
                <Star className="w-4 h-4 mx-auto" fill={i < rating ? 'currentColor' : 'none'} />
              </button>
            ))}
            {rating > 0 && (
              <button
                type="button"
                onClick={() => handleChange(0)}
                className="ml-2 text-xs text-gray-400 hover:text-gray-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )

    case 'list':
      const listItems = (value as string[]) || []
      const [newItem, setNewItem] = useState('')
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          <div className="space-y-2">
            {listItems.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={item}
                  onChange={(e) => {
                    const updated = [...listItems]
                    updated[index] = e.target.value
                    handleChange(updated)
                  }}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                />
                <button
                  type="button"
                  onClick={() => handleChange(listItems.filter((_, i) => i !== index))}
                  className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder={field.placeholder}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItem.trim()) {
                    e.preventDefault()
                    handleChange([...listItems, newItem.trim()])
                    setNewItem('')
                  }
                }}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
              />
              <button
                type="button"
                onClick={() => {
                  if (newItem.trim()) {
                    handleChange([...listItems, newItem.trim()])
                    setNewItem('')
                  }
                }}
                className="p-2 text-[#647C47] hover:bg-[#647C47]/10 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          {field.helpText && (
            <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
              <Info className="w-3 h-3" />
              {field.helpText}
            </p>
          )}
        </div>
      )

    default:
      return null
  }
}

// =====================================================
// LIST INPUT COMPONENT (for highlights, inclusions)
// =====================================================

interface ListInputProps {
  label: string
  items: string[]
  onChange: (items: string[]) => void
  placeholder?: string
}

function ListInput({ label, items, onChange, placeholder = 'Add item...' }: ListInputProps) {
  const [newItem, setNewItem] = useState('')

  const addItem = () => {
    if (newItem.trim()) {
      onChange([...items, newItem.trim()])
      setNewItem('')
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={item}
              onChange={(e) => {
                const updated = [...items]
                updated[index] = e.target.value
                onChange(updated)
              }}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addItem()
              }
            }}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
          />
          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-1 px-3 py-2 text-sm text-[#647C47] hover:bg-[#647C47]/10 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// MAIN EDITOR COMPONENT
// =====================================================

export default function ContentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const isNew = id === 'new'

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState<ContentCategory[]>([])
  const [activeTier, setActiveTier] = useState<Tier>('budget')
  const [categorySchema, setCategorySchema] = useState<CategorySchema | null>(null)

  // Form state
  const [formData, setFormData] = useState<ContentItem>({
    category_id: '',
    name: '',
    slug: '',
    short_description: '',
    location: '',
    duration: '',
    tags: [],
    metadata: {},
    is_active: true,
    variations: TIERS.map(tier => ({
      tier,
      title: '',
      description: '',
      highlights: [],
      inclusions: [],
      internal_notes: '',
      is_active: true
    }))
  })

  const [tagInput, setTagInput] = useState('')

  useEffect(() => {
    setMounted(true)
  }, [])

  // Load categories
  useEffect(() => {
    async function loadCategories() {
      try {
        const res = await fetch('/api/content-library/categories')
        if (res.ok) {
          const data = await res.json()
          setCategories(data)
        }
      } catch (error) {
        console.error('Error loading categories:', error)
      }
    }
    loadCategories()
  }, [])

  // Load content if editing
  useEffect(() => {
    async function loadContent() {
      if (isNew) {
        setLoading(false)
        return
      }

      try {
        const res = await fetch(`/api/content-library/${id}`)
        if (res.ok) {
          const data = await res.json()
          
          // Ensure all tiers exist with proper defaults
          const variations = TIERS.map(tier => {
            const existing = data.variations?.find((v: ContentVariation) => v.tier === tier)
            if (existing) {
              return {
                ...existing,
                title: existing.title || '',
                description: existing.description || '',
                highlights: existing.highlights || [],
                inclusions: existing.inclusions || [],
                internal_notes: existing.internal_notes || '',
                is_active: existing.is_active ?? true
              }
            }
            return {
              tier,
              title: '',
              description: '',
              highlights: [],
              inclusions: [],
              internal_notes: '',
              is_active: true
            }
          })

          setFormData({
            ...data,
            name: data.name || '',
            slug: data.slug || '',
            short_description: data.short_description || '',
            location: data.location || '',
            duration: data.duration || '',
            tags: data.tags || [],
            metadata: data.metadata || {},
            is_active: data.is_active ?? true,
            variations
          })

          // Load schema for existing category
          if (data.category?.slug) {
            const schema = getSchemaBySlug(data.category.slug)
            setCategorySchema(schema)
          }
        }
      } catch (error) {
        console.error('Error loading content:', error)
      } finally {
        setLoading(false)
      }
    }
    loadContent()
  }, [id, isNew])

  // Update schema when category changes
  useEffect(() => {
    if (formData.category_id) {
      const category = categories.find(c => c.id === formData.category_id)
      if (category) {
        const schema = getSchemaBySlug(category.slug)
        setCategorySchema(schema)
        
        // Initialize default metadata if switching category
        if (schema && Object.keys(formData.metadata).length === 0) {
          setFormData(prev => ({
            ...prev,
            metadata: getDefaultMetadata(schema.slug)
          }))
        }
      }
    }
  }, [formData.category_id, categories])

  // Auto-generate slug
  useEffect(() => {
    if (isNew && formData.name) {
      const slug = formData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      setFormData(prev => ({ ...prev, slug }))
    }
  }, [formData.name, isNew])

  // Get current variation
  const currentVariation = formData.variations.find(v => v.tier === activeTier)

  // Update variation
  const updateVariation = (field: keyof ContentVariation, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      variations: prev.variations.map(v =>
        v.tier === activeTier ? { ...v, [field]: value } : v
      )
    }))
  }

  // Update metadata
  const updateMetadata = (field: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        [field]: value
      }
    }))
  }

  // Add tag
  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim().toLowerCase())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim().toLowerCase()]
      }))
      setTagInput('')
    }
  }

  // Save content
  const handleSave = async () => {
    if (!formData.name || !formData.category_id) {
      alert('Please fill in required fields')
      return
    }

    setSaving(true)
    try {
      const url = isNew ? '/api/content-library' : `/api/content-library/${id}`
      const method = isNew ? 'POST' : 'PUT'

      // Only include variations that have actual content (description filled)
      const variationsToSave = formData.variations.filter(v => v.description && v.description.trim() !== '')

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          variations: variationsToSave
        })
      })

      if (res.ok) {
        router.push('/content-library')
      } else {
        const error = await res.json()
        alert(error.message || 'Error saving content')
      }
    } catch (error) {
      console.error('Error saving:', error)
      alert('Error saving content')
    } finally {
      setSaving(false)
    }
  }

  // Check variation completeness
  const getVariationStatus = (tier: Tier) => {
    const variation = formData.variations.find(v => v.tier === tier)
    if (!variation) return 'empty'
    if (variation.description) return 'complete'
    return 'empty'
  }

  if (!mounted || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#647C47]" />
      </div>
    )
  }

  const selectedCategory = categories.find(c => c.id === formData.category_id)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/content-library"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {isNew ? 'New Content' : formData.name}
              </h1>
              <p className="text-sm text-gray-500">
                {formData.variations.filter(v => v.description).length}/4 tier variations
              </p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#566b3d] transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Basic Info & Category Fields */}
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center">📄</span>
                Basic Information
              </h2>

              <div className="space-y-4">
                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      category_id: e.target.value,
                      metadata: {} // Reset metadata when category changes
                    }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47] bg-white"
                  >
                    <option value="">Select category...</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Pyramids of Giza"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                  />
                </div>

                {/* Slug */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                  />
                </div>

                {/* Short Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Short Description</label>
                  <textarea
                    value={formData.short_description}
                    onChange={(e) => setFormData(prev => ({ ...prev, short_description: e.target.value }))}
                    placeholder="Brief summary for listings..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47] resize-none"
                  />
                </div>

                {/* Location - Show for most categories */}
                {categorySchema?.slug !== 'phrases-expressions' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                      placeholder="e.g., Giza, Cairo"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                    />
                  </div>
                )}

                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {formData.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({
                            ...prev,
                            tags: prev.tags.filter((_, i) => i !== index)
                          }))}
                          className="hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addTag()
                        }
                      }}
                      placeholder="Add tag..."
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                    />
                    <button
                      type="button"
                      onClick={addTag}
                      className="px-3 py-2 text-[#647C47] hover:bg-[#647C47]/10 rounded-lg transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Category-Specific Fields */}
            {categorySchema && categorySchema.fields.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-900 mb-6 flex items-center gap-2">
                  <span className="w-6 h-6 bg-[#647C47]/10 rounded flex items-center justify-center">
                    {(() => {
                      const IconComponent = CATEGORY_ICONS[categorySchema.icon] || Landmark
                      return <IconComponent className="w-4 h-4 text-[#647C47]" />
                    })()}
                  </span>
                  {categorySchema.label} Details
                </h2>

                <div className="space-y-6">
                  {categorySchema.fields.map((field) => (
                    <DynamicField
                      key={field.name}
                      field={field}
                      value={formData.metadata[field.name]}
                      onChange={updateMetadata}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Tier Variations */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-gray-200">
              {/* Tier Tabs */}
              <div className="flex border-b border-gray-200">
                {TIERS.map((tier) => {
                  const config = TIER_CONFIG[tier]
                  const Icon = config.icon
                  const status = getVariationStatus(tier)

                  return (
                    <button
                      key={tier}
                      onClick={() => setActiveTier(tier)}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
                        activeTier === tier
                          ? `${config.color} border-b-2 border-current`
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {config.label}
                      {status === 'complete' && (
                        <Check className="w-3.5 h-3.5 text-green-500" />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Tier Content */}
              <div className="p-6 space-y-6">
                {currentVariation && (
                  <>
                    {/* Title */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Title (Optional)
                      </label>
                      <input
                        type="text"
                        value={currentVariation.title}
                        onChange={(e) => updateVariation('title', e.target.value)}
                        placeholder={`${TIER_CONFIG[activeTier].label} experience title...`}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47]"
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={currentVariation.description}
                        onChange={(e) => updateVariation('description', e.target.value)}
                        placeholder={`How you describe this at the ${activeTier} tier...`}
                        rows={6}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47] resize-none"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        {currentVariation.description.length} characters
                      </p>
                    </div>

                    {/* Highlights - Show if schema allows */}
                    {categorySchema?.tierConfig.showHighlights !== false && (
                      <ListInput
                        label="Highlights"
                        items={currentVariation.highlights}
                        onChange={(items) => updateVariation('highlights', items)}
                        placeholder="Add highlight..."
                      />
                    )}

                    {/* Inclusions - Only show if schema allows */}
                    {categorySchema?.tierConfig.showInclusions && (
                      <ListInput
                        label="Inclusions"
                        items={currentVariation.inclusions}
                        onChange={(items) => updateVariation('inclusions', items)}
                        placeholder="Add inclusion..."
                      />
                    )}

                    {/* Internal Notes */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Internal Notes
                      </label>
                      <textarea
                        value={currentVariation.internal_notes}
                        onChange={(e) => updateVariation('internal_notes', e.target.value)}
                        placeholder="Notes for your team (not shown in itineraries)..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#647C47]/20 focus:border-[#647C47] resize-none bg-amber-50/50"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Tips Card */}
            <div className="mt-6 bg-[#647C47]/5 rounded-xl border border-[#647C47]/20 p-6">
              <h3 className="text-sm font-semibold text-[#647C47] mb-2">
                💡 Tier Writing Tips
              </h3>
              <div className="text-sm text-gray-600 space-y-2">
                {activeTier === 'budget' && (
                  <p>Focus on <strong>value and essentials</strong>. Highlight what's included, emphasize good-value experiences, and use straightforward language.</p>
                )}
                {activeTier === 'standard' && (
                  <p>Balance <strong>comfort and experience</strong>. Mention quality aspects, comfortable arrangements, and reliable service without excessive luxury language.</p>
                )}
                {activeTier === 'deluxe' && (
                  <p>Emphasize <strong>enhanced experiences and refinement</strong>. Highlight superior quality, added comforts, and exclusive touches that elevate the experience.</p>
                )}
                {activeTier === 'luxury' && (
                  <p>Convey <strong>exclusivity and ultimate comfort</strong>. Use sophisticated language, emphasize private access, personalized service, and exceptional quality.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}