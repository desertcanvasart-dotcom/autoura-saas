'use client'

export const dynamic = 'force-dynamic'

import React, { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import {
  Map,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Check,
  LayoutGrid,
  List,
  Table2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Copy,
  Eye,
  Calendar,
  Users,
  Star,
  Layers,
  MapPin,
  Calculator,
  Loader2
} from 'lucide-react'

// Import DayBuilder component
import DayBuilder from './DayBuilder'

// ============================================
// INTERFACES
// ============================================

interface TourCategory {
  id: string
  category_name: string
  category_code: string
}

interface TourVariation {
  id: string
  template_id: string
  variation_code: string
  variation_name: string
  tier: 'budget' | 'standard' | 'deluxe' | 'luxury'
  group_type: 'private' | 'shared'
  min_pax: number
  max_pax: number
  optimal_pax?: number
  inclusions: string[]
  exclusions: string[]
  optional_extras?: string[]
  guide_type?: string
  guide_languages?: string[]
  vehicle_type?: string
  accommodation_standard?: string
  meal_quality?: string
  is_active: boolean
}

interface TourTemplate {
  id: string
  template_code: string
  template_name: string
  category_id?: string
  tour_type: string
  duration_days: number
  duration_nights?: number
  cities_covered?: string[]
  short_description?: string
  long_description?: string
  highlights?: string[]
  main_attractions?: string[]
  best_for?: string[]
  physical_level?: string
  image_url?: string
  is_featured: boolean
  is_active: boolean
  created_at: string
  uses_day_builder?: boolean
  pricing_mode?: string
  category?: TourCategory
  variations?: TourVariation[]
  itinerary?: ItineraryDay[]  // NEW
}

// NEW: Itinerary Day interface
interface ItineraryDay {
  day: number
  title: string
  description: string
  meals: string[]
}

interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

// NEW: Attraction interface from entrance_fees
interface Attraction {
  id: string
  attraction_name: string
  city: string
  eur_rate: number
  non_eur_rate: number
}

type ViewMode = 'table' | 'cards' | 'compact'

// ============================================
// CONSTANTS
// ============================================
const EGYPTIAN_CITIES = [
  'Cairo', 'Giza', 'Alexandria', 'Luxor', 'Aswan', 'Hurghada',
  'Sharm El Sheikh', 'Dahab', 'Marsa Alam', 'El Gouna', 'Siwa',
  'Fayoum', 'Port Said', 'Suez', 'Ismailia', 'Taba', 'Nuweiba',
  'Safaga', 'Ain Sokhna', 'Saint Catherine', 'Bahariya Oasis',
  'White Desert', 'Black Desert', 'Kharga Oasis', 'Dakhla Oasis'
]

const TOUR_TYPES = [
  { value: 'day_tour', label: 'Day Tour' },
  { value: 'full_day', label: 'Full Day' },
  { value: 'multi_day', label: 'Multi-Day Tour' },
  { value: 'cruise', label: 'Nile Cruise' },
  { value: 'safari', label: 'Desert Safari' },
  { value: 'diving', label: 'Diving Trip' },
  { value: 'cultural', label: 'Cultural Experience' },
  { value: 'adventure', label: 'Adventure Tour' }
]

const PHYSICAL_LEVELS = [
  { value: 'easy', label: 'Easy - Suitable for all' },
  { value: 'moderate', label: 'Moderate - Some walking' },
  { value: 'challenging', label: 'Challenging - Active travelers' },
  { value: 'demanding', label: 'Demanding - Fit travelers only' }
]

const BEST_FOR_OPTIONS = [
  'Families', 'Couples', 'Solo Travelers', 'Groups', 'Seniors',
  'History Buffs', 'Adventure Seekers', 'Photography', 'Relaxation',
  'First-time Visitors', 'Repeat Visitors', 'Luxury Travelers', 'Budget Travelers'
]

// UPDATED: Now includes all 4 tiers including Deluxe
const TIER_CONFIG = {
  budget: {
    label: 'Budget',
    icon: '💰',
    description: 'Essential experience at best value',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-200',
    defaults: {
      min_pax: 1,
      max_pax: 15,
      group_type: 'shared' as const,
      vehicle_type: 'standard_van',
      accommodation_standard: '3_star',
      meal_quality: 'basic'
    }
  },
  standard: {
    label: 'Standard',
    icon: '💎',
    description: 'Comfortable experience with quality services',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    defaults: {
      min_pax: 1,
      max_pax: 10,
      group_type: 'private' as const,
      vehicle_type: 'modern_van',
      accommodation_standard: '4_star',
      meal_quality: 'good'
    }
  },
  deluxe: {
    label: 'Deluxe',
    icon: '✨',
    description: 'Enhanced experience with premium touches',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
    defaults: {
      min_pax: 1,
      max_pax: 8,
      group_type: 'private' as const,
      vehicle_type: 'premium_van',
      accommodation_standard: '4_star_plus',
      meal_quality: 'premium'
    }
  },
  luxury: {
    label: 'Luxury',
    icon: '👑',
    description: 'Premium experience with exclusive perks',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-200',
    defaults: {
      min_pax: 1,
      max_pax: 6,
      group_type: 'private' as const,
      vehicle_type: 'luxury_suv',
      accommodation_standard: '5_star',
      meal_quality: 'gourmet'
    }
  }
}

// ============================================
// TOAST COMPONENT
// ============================================
function ToastNotification({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  const bgColor = toast.type === 'success' ? 'bg-green-50 border-green-200' :
                  toast.type === 'error' ? 'bg-red-50 border-red-200' :
                  'bg-blue-50 border-blue-200'
  
  const iconColor = toast.type === 'success' ? 'text-green-600' :
                    toast.type === 'error' ? 'text-red-600' :
                    'text-blue-600'
  
  const textColor = toast.type === 'success' ? 'text-green-800' :
                    toast.type === 'error' ? 'text-red-800' :
                    'text-blue-800'

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${bgColor} animate-slide-in`}>
      {toast.type === 'success' ? (
        <CheckCircle2 className={`w-5 h-5 ${iconColor}`} />
      ) : (
        <AlertCircle className={`w-5 h-5 ${iconColor}`} />
      )}
      <span className={`text-sm font-medium ${textColor}`}>{toast.message}</span>
      <button onClick={onClose} className={`ml-2 ${iconColor} hover:opacity-70`}>
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

// ============================================
// ATTRACTION SEARCH DROPDOWN COMPONENT
// ============================================
interface AttractionDropdownProps {
  attractions: Attraction[]
  selectedAttractions: string[]
  onSelect: (attractionName: string) => void
  onRemove: (index: number) => void
}

function AttractionDropdown({ attractions, selectedAttractions, onSelect, onRemove }: AttractionDropdownProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Filter attractions based on search term and exclude already selected
  const filteredAttractions = attractions.filter(a => 
    a.attraction_name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    !selectedAttractions.includes(a.attraction_name)
  )

  // Group by city
  const groupedAttractions = filteredAttractions.reduce((acc, attr) => {
    const city = attr.city || 'Other'
    if (!acc[city]) acc[city] = []
    acc[city].push(attr)
    return acc
  }, {} as Record<string, Attraction[]>)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (attractionName: string) => {
    onSelect(attractionName)
    setSearchTerm('')
    setIsOpen(false)
  }

  return (
    <div className="space-y-2">
      {/* Search Input with Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
            placeholder="Search attractions to add..."
          />
        </div>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {Object.keys(groupedAttractions).length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500">
                {searchTerm ? 'No attractions found' : 'Type to search attractions...'}
              </div>
            ) : (
              Object.entries(groupedAttractions).map(([city, cityAttractions]) => (
                <div key={city}>
                  <div className="px-3 py-1.5 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {city}
                  </div>
                  {cityAttractions.map(attr => (
                    <button
                      key={attr.id}
                      type="button"
                      onClick={() => handleSelect(attr.attraction_name)}
                      className="w-full px-4 py-2 text-left hover:bg-green-50 transition-colors flex items-center justify-between group"
                    >
                      <div>
                        <p className="text-sm text-gray-900">{attr.attraction_name}</p>
                        <p className="text-xs text-gray-500">
                          EUR: €{attr.eur_rate} / Non-EUR: €{attr.non_eur_rate}
                        </p>
                      </div>
                      <Plus className="w-4 h-4 text-gray-400 group-hover:text-green-600" />
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Selected Attractions Tags */}
      <div className="flex flex-wrap gap-2">
        {selectedAttractions.map((attraction, index) => (
          <span 
            key={index} 
            className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded text-xs border border-green-200"
          >
            🏛️ {attraction}
            <button 
              type="button" 
              onClick={() => onRemove(index)} 
              className="text-green-500 hover:text-green-700 ml-1"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {selectedAttractions.length === 0 && (
          <span className="text-xs text-gray-400 italic">No attractions selected</span>
        )}
      </div>
    </div>
  )
}

// ============================================
// ITINERARY EDITOR - Add one day at a time (like Highlights)
// ============================================
interface ItineraryEditorProps {
  itinerary: ItineraryDay[]
  onChange: (itinerary: ItineraryDay[]) => void
}

function ItineraryEditor({ itinerary, onChange }: ItineraryEditorProps) {
  const [dayTitle, setDayTitle] = useState('')
  const [dayDescription, setDayDescription] = useState('')
  const [dayMeals, setDayMeals] = useState<string[]>([])

  const toggleMeal = (meal: string) => {
    setDayMeals(prev => 
      prev.includes(meal) 
        ? prev.filter(m => m !== meal) 
        : [...prev, meal]
    )
  }

  const addDay = () => {
    if (!dayTitle.trim()) return
    
    const newDay: ItineraryDay = {
      day: itinerary.length + 1,
      title: dayTitle.trim(),
      description: dayDescription.trim(),
      meals: dayMeals
    }
    
    onChange([...itinerary, newDay])
    
    // Reset form
    setDayTitle('')
    setDayDescription('')
    setDayMeals([])
  }

  const removeDay = (index: number) => {
    const newItinerary = itinerary
      .filter((_, i) => i !== index)
      .map((day, i) => ({ ...day, day: i + 1 })) // Re-number days
    onChange(newItinerary)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      addDay()
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-gray-600">
        Day-by-Day Itinerary
        <span className="ml-2 text-gray-400 font-normal">({itinerary.length} day{itinerary.length !== 1 ? 's' : ''} added)</span>
      </label>

      {/* Add Day Form */}
      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex items-center justify-center w-7 h-7 bg-green-100 text-green-700 rounded-full text-sm font-bold">
            {itinerary.length + 1}
          </span>
          <span className="text-sm font-medium text-gray-600">Day {itinerary.length + 1}</span>
        </div>

        {/* Title */}
        <div>
          <input
            type="text"
            value={dayTitle}
            onChange={(e) => setDayTitle(e.target.value)}
            onKeyPress={handleKeyPress}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
            placeholder="Day title (e.g., Cairo - Pyramids & Sphinx)"
          />
        </div>

        {/* Description */}
        <div>
          <textarea
            value={dayDescription}
            onChange={(e) => setDayDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent resize-none"
            placeholder="Day description (optional)"
          />
        </div>

        {/* Meals */}
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">Meals:</span>
          {['Breakfast', 'Lunch', 'Dinner'].map(meal => (
            <label key={meal} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={dayMeals.includes(meal)}
                onChange={() => toggleMeal(meal)}
                className="w-4 h-4 text-green-600 border-gray-300 rounded"
              />
              <span className="text-xs text-gray-700">{meal}</span>
            </label>
          ))}
        </div>

        {/* Add Button */}
        <button
          type="button"
          onClick={addDay}
          disabled={!dayTitle.trim()}
          className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Add Day {itinerary.length + 1}
        </button>
      </div>

      {/* Added Days List */}
      {itinerary.length > 0 && (
        <div className="space-y-2">
          {itinerary.map((day, index) => (
            <div 
              key={index}
              className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg group"
            >
              <span className="flex items-center justify-center w-6 h-6 bg-blue-200 text-blue-800 rounded-full text-xs font-bold flex-shrink-0 mt-0.5">
                {day.day}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{day.title}</p>
                {day.description && (
                  <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{day.description}</p>
                )}
                {day.meals && day.meals.length > 0 && (
                  <p className="text-xs text-blue-600 mt-1">
                    🍽️ {day.meals.join(', ')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeDay(index)}
                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove day"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {itinerary.length === 0 && (
        <p className="text-xs text-gray-400 italic">No days added yet. Add your first day above.</p>
      )}
    </div>
  )
}

// ============================================
// ADD VARIATION MODAL COMPONENT
// ============================================
interface AddVariationModalProps {
  template: TourTemplate
  onClose: () => void
  onSuccess: () => void
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
}

function AddVariationModal({ template, onClose, onSuccess, showToast }: AddVariationModalProps) {
  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(new Set(['standard']))
  const [groupTypes, setGroupTypes] = useState<Record<string, 'private' | 'shared'>>({
    budget: 'shared',
    standard: 'private',
    deluxe: 'private',
    luxury: 'private'
  })
  const [saving, setSaving] = useState(false)

  const toggleTier = (tier: string) => {
    const newSet = new Set(selectedTiers)
    if (newSet.has(tier)) {
      newSet.delete(tier)
    } else {
      newSet.add(tier)
    }
    setSelectedTiers(newSet)
  }

  const handleCreate = async () => {
    if (selectedTiers.size === 0) {
      showToast('error', 'Please select at least one tier')
      return
    }

    setSaving(true)
    
    const variations = Array.from(selectedTiers).map(tier => {
      const config = TIER_CONFIG[tier as keyof typeof TIER_CONFIG]
      const groupType = groupTypes[tier]
      
      return {
        template_id: template.id,
        variation_name: `${template.template_name} - ${config.label}`,
        tier: tier,
        group_type: groupType,
        min_pax: config.defaults.min_pax,
        max_pax: config.defaults.max_pax,
        vehicle_type: config.defaults.vehicle_type,
        accommodation_standard: config.defaults.accommodation_standard,
        meal_quality: config.defaults.meal_quality
      }
    })

    try {
      const response = await fetch('/api/tours/variations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(variations)
      })

      const data = await response.json()

      if (data.success) {
        showToast('success', `Created ${data.data.length} variation(s) for ${template.template_name}`)
        onSuccess()
        onClose()
      } else {
        showToast('error', data.error || 'Failed to create variations')
      }
    } catch (error) {
      showToast('error', 'Failed to create variations')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-lg w-full">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Add Variations</h2>
            <p className="text-xs text-gray-500 mt-0.5">{template.template_name}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4">
          <p className="text-sm text-gray-600 mb-4">
            Select the pricing tiers you want to offer for this tour:
          </p>

          <div className="space-y-3">
            {(Object.entries(TIER_CONFIG) as [string, typeof TIER_CONFIG.budget][]).map(([tier, config]) => (
              <div
                key={tier}
                className={`border rounded-lg p-4 cursor-pointer transition-all ${
                  selectedTiers.has(tier)
                    ? `${config.borderColor} ${config.bgColor}`
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => toggleTier(tier)}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedTiers.has(tier)}
                    onChange={() => toggleTier(tier)}
                    className="mt-1 w-4 h-4 text-green-600 border-gray-300 rounded"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{config.icon}</span>
                      <span className={`font-medium ${selectedTiers.has(tier) ? config.textColor : 'text-gray-900'}`}>
                        {config.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{config.description}</p>
                    
                    {selectedTiers.has(tier) && (
                      <div className="mt-3 pt-3 border-t border-gray-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`group-${tier}`}
                              checked={groupTypes[tier] === 'private'}
                              onChange={() => setGroupTypes(prev => ({ ...prev, [tier]: 'private' }))}
                              className="w-4 h-4 text-green-600"
                            />
                            <span className="text-sm text-gray-700">🔒 Private</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`group-${tier}`}
                              checked={groupTypes[tier] === 'shared'}
                              onChange={() => setGroupTypes(prev => ({ ...prev, [tier]: 'shared' }))}
                              className="w-4 h-4 text-green-600"
                            />
                            <span className="text-sm text-gray-700">👥 Shared</span>
                          </label>
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                          Pax: {config.defaults.min_pax}-{config.defaults.max_pax} • 
                          Vehicle: {config.defaults.vehicle_type.replace('_', ' ')}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {selectedTiers.size} tier{selectedTiers.size !== 1 ? 's' : ''} selected
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 font-medium hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || selectedTiers.size === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Create Variations
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// DAY BUILDER MODAL COMPONENT
// ============================================
interface DayBuilderModalProps {
  template: TourTemplate
  onClose: () => void
  onSave?: () => void
}

function DayBuilderModal({ template, onClose, onSave }: DayBuilderModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between bg-white">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Day Builder</h2>
            <p className="text-xs text-gray-500 mt-0.5">{template.template_name} • {template.duration_days} days</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          <DayBuilder
            templateId={template.id}
            templateName={template.template_name}
            durationDays={template.duration_days}
            onClose={onClose}
            onSave={onSave}
          />
        </div>
      </div>
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function TourManagerContent() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [templates, setTemplates] = useState<TourTemplate[]>([])
  const [categories, setCategories] = useState<TourCategory[]>([])
  const [attractions, setAttractions] = useState<Attraction[]>([])  // NEW: Attractions from DB
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedType, setSelectedType] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<TourTemplate | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'basic' | 'details' | 'variations'>('basic')
  
  // ADD VARIATION MODAL STATE
  const [addVariationTemplate, setAddVariationTemplate] = useState<TourTemplate | null>(null)
  
  // DAY BUILDER MODAL STATE
  const [dayBuilderTemplate, setDayBuilderTemplate] = useState<TourTemplate | null>(null)
  
  // NEW TEMPLATE VARIATIONS STATE (for creating with template)
  const [newTemplateVariations, setNewTemplateVariations] = useState<Set<string>>(new Set(['standard']))
  const [newTemplateGroupTypes, setNewTemplateGroupTypes] = useState<Record<string, 'private' | 'shared'>>({
    budget: 'shared',
    standard: 'private',
    deluxe: 'private',
    luxury: 'private'
  })
  
  const [formData, setFormData] = useState({
    template_code: '',
    template_name: '',
    category_id: '',
    tour_type: 'day_tour',
    duration_days: 1,
    duration_nights: 0,
    cities_covered: [] as string[],
    short_description: '',
    long_description: '',
    highlights: [] as string[],
    main_attractions: [] as string[],
    best_for: [] as string[],
    physical_level: 'moderate',
    age_suitability: 'all_ages',
    pickup_required: true,
    meals_included: [] as string[],
    image_url: '',
    is_featured: false,
    is_active: true,
    uses_day_builder: true,
    pricing_mode: 'auto',
    default_transportation_service: 'day_tour',
    transportation_city: 'Cairo',
    itinerary: [] as ItineraryDay[]  // NEW: Itinerary field
  })

  const [highlightInput, setHighlightInput] = useState('')

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/tours/templates')
      const data = await response.json()
      if (data.success) {
        setTemplates(data.data)
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
      showToast('error', 'Failed to load tour templates')
    }
  }

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/tours/categories')
      const data = await response.json()
      if (data.success) {
        setCategories(data.data)
      }
    } catch (error) {
      console.error('Error fetching categories:', error)
    }
  }

  // NEW: Fetch attractions from entrance_fees table
  const fetchAttractions = async () => {
    try {
      const response = await fetch('/api/rates/entrance-fees?limit=500')
      const data = await response.json()
      if (data.success && data.data) {
        // Filter out add-ons, keep only main attractions
        const mainAttractions = data.data.filter((a: any) => !a.is_addon)
        setAttractions(mainAttractions)
      }
    } catch (error) {
      console.error('Error fetching attractions:', error)
    }
  }

  useEffect(() => {
    Promise.all([
      fetchTemplates(), 
      fetchCategories(),
      fetchAttractions()  // NEW: Fetch attractions on load
    ]).finally(() => setLoading(false))
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) || 0 : value
    }))
  }

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }))
  }

  const toggleCity = (city: string) => {
    setFormData(prev => ({
      ...prev,
      cities_covered: prev.cities_covered.includes(city)
        ? prev.cities_covered.filter(c => c !== city)
        : [...prev.cities_covered, city]
    }))
  }

  const toggleBestFor = (item: string) => {
    setFormData(prev => ({
      ...prev,
      best_for: prev.best_for.includes(item)
        ? prev.best_for.filter(b => b !== item)
        : [...prev.best_for, item]
    }))
  }

  const toggleMeal = (meal: string) => {
    setFormData(prev => ({
      ...prev,
      meals_included: prev.meals_included.includes(meal)
        ? prev.meals_included.filter(m => m !== meal)
        : [...prev.meals_included, meal]
    }))
  }

  const addHighlight = () => {
    if (highlightInput.trim()) {
      setFormData(prev => ({
        ...prev,
        highlights: [...prev.highlights, highlightInput.trim()]
      }))
      setHighlightInput('')
    }
  }

  const removeHighlight = (index: number) => {
    setFormData(prev => ({
      ...prev,
      highlights: prev.highlights.filter((_, i) => i !== index)
    }))
  }

  // NEW: Add attraction from dropdown
  const addAttraction = (attractionName: string) => {
    setFormData(prev => ({
      ...prev,
      main_attractions: [...prev.main_attractions, attractionName]
    }))
  }

  const removeAttraction = (index: number) => {
    setFormData(prev => ({
      ...prev,
      main_attractions: prev.main_attractions.filter((_, i) => i !== index)
    }))
  }

  // NEW: Handle itinerary changes
  const handleItineraryChange = (itinerary: ItineraryDay[]) => {
    setFormData(prev => ({
      ...prev,
      itinerary
    }))
  }

  const generateTemplateCode = () => {
    const city = formData.cities_covered[0] || 'EGYPT'
    const type = formData.tour_type.toUpperCase().replace('_', '-')
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    return `${city.substring(0, 3).toUpperCase()}-${type.substring(0, 3)}-${random}`
  }

  const handleAddNew = () => {
    setEditingTemplate(null)
    setFormData({
      template_code: '',
      template_name: '',
      category_id: categories[0]?.id || '',
      tour_type: 'day_tour',
      duration_days: 1,
      duration_nights: 0,
      cities_covered: [],
      short_description: '',
      long_description: '',
      highlights: [],
      main_attractions: [],
      best_for: [],
      physical_level: 'moderate',
      age_suitability: 'all_ages',
      pickup_required: true,
      meals_included: [],
      image_url: '',
      is_featured: false,
      is_active: true,
      uses_day_builder: true,
      pricing_mode: 'auto',
      default_transportation_service: 'day_tour',
      transportation_city: 'Cairo',
      itinerary: []  // NEW: Reset itinerary
    })
    setNewTemplateVariations(new Set(['standard']))
    setNewTemplateGroupTypes({
      budget: 'shared',
      standard: 'private',
      deluxe: 'private',
      luxury: 'private'
    })
    setActiveTab('basic')
    setShowModal(true)
  }

  const handleEdit = (template: TourTemplate) => {
    setEditingTemplate(template)
    setFormData({
      template_code: template.template_code,
      template_name: template.template_name,
      category_id: template.category_id || '',
      tour_type: template.tour_type,
      duration_days: template.duration_days,
      duration_nights: template.duration_nights || 0,
      cities_covered: template.cities_covered || [],
      short_description: template.short_description || '',
      long_description: template.long_description || '',
      highlights: template.highlights || [],
      main_attractions: template.main_attractions || [],
      best_for: template.best_for || [],
      physical_level: template.physical_level || 'moderate',
      age_suitability: 'all_ages',
      pickup_required: true,
      meals_included: [],
      image_url: template.image_url || '',
      is_featured: template.is_featured,
      is_active: template.is_active,
      uses_day_builder: template.uses_day_builder ?? true,
      pricing_mode: template.pricing_mode || 'auto',
      default_transportation_service: 'day_tour',
      transportation_city: 'Cairo',
      itinerary: template.itinerary || []  // NEW: Load existing itinerary
    })
    setActiveTab('basic')
    setShowModal(true)
  }

  const handleDuplicate = async (template: TourTemplate) => {
    try {
      const response = await fetch('/api/tours/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...template,
          id: undefined,
          template_code: generateTemplateCode(),
          template_name: `${template.template_name} (Copy)`,
          created_at: undefined,
          updated_at: undefined
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        showToast('success', `Duplicated: ${template.template_name}`)
        fetchTemplates()
      } else {
        showToast('error', data.error || 'Failed to duplicate')
      }
    } catch (error) {
      showToast('error', 'Failed to duplicate template')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const dataToSubmit = {
      ...formData,
      template_code: formData.template_code || generateTemplateCode()
    }
    
    try {
      const url = editingTemplate 
        ? `/api/tours/templates/${editingTemplate.id}`
        : '/api/tours/templates'
      
      const method = editingTemplate ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSubmit)
      })
      
      const data = await response.json()
      
      if (data.success) {
        // If creating new template AND variations are selected, create them
        if (!editingTemplate && newTemplateVariations.size > 0 && data.data?.id) {
          const variations = Array.from(newTemplateVariations).map(tier => {
            const config = TIER_CONFIG[tier as keyof typeof TIER_CONFIG]
            return {
              template_id: data.data.id,
              variation_name: `${formData.template_name} - ${config.label}`,
              tier: tier,
              group_type: newTemplateGroupTypes[tier],
              min_pax: config.defaults.min_pax,
              max_pax: config.defaults.max_pax,
              vehicle_type: config.defaults.vehicle_type,
              accommodation_standard: config.defaults.accommodation_standard,
              meal_quality: config.defaults.meal_quality
            }
          })

          const varResponse = await fetch('/api/tours/variations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(variations)
          })
          
          const varData = await varResponse.json()
          
          if (varData.success) {
            showToast('success', `${formData.template_name} created with ${varData.data.length} variation(s)!`)
            // Ask to open Day Builder
            if (data.data) {
              const newTemplate = { ...data.data, duration_days: formData.duration_days }
              setTimeout(() => {
                if (confirm('Would you like to add activities to this tour now?')) {
                  setDayBuilderTemplate(newTemplate)
                }
              }, 500)
            }
          } else {
            showToast('info', `Template created, but failed to create variations: ${varData.error}`)
          }
        } else {
          showToast('success', editingTemplate 
            ? `${formData.template_name} updated!` 
            : `${formData.template_name} created!`)
        }
        
        setShowModal(false)
        fetchTemplates()
      } else {
        showToast('error', data.error || 'Failed to save')
      }
    } catch (error) {
      showToast('error', 'Failed to save template')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This will also delete all variations and days.`)) return
    
    try {
      const response = await fetch(`/api/tours/templates/${id}`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (data.success) {
        showToast('success', `${name} deleted!`)
        fetchTemplates()
      } else {
        showToast('error', data.error || 'Failed to delete')
      }
    } catch (error) {
      showToast('error', 'Failed to delete template')
    }
  }

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = searchTerm === '' || 
      template.template_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.template_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.cities_covered?.some(c => c.toLowerCase().includes(searchTerm.toLowerCase()))
    
    const matchesCategory = selectedCategory === 'all' || template.category_id === selectedCategory
    const matchesType = selectedType === 'all' || template.tour_type === selectedType
    const matchesActive = showInactive || template.is_active
    
    return matchesSearch && matchesCategory && matchesType && matchesActive
  })

  const activeTemplates = templates.filter(t => t.is_active).length
  const totalVariations = templates.reduce((sum, t) => sum + (t.variations?.length || 0), 0)
  const featuredCount = templates.filter(t => t.is_featured).length

  const getTierBadge = (tier: string) => {
    const config = TIER_CONFIG[tier as keyof typeof TIER_CONFIG]
    if (!config) return { style: 'bg-gray-50 text-gray-700', icon: '' }
    return { 
      style: `${config.bgColor} ${config.textColor} ${config.borderColor}`, 
      icon: config.icon 
    }
  }

  const toggleNewVariationTier = (tier: string) => {
    const newSet = new Set(newTemplateVariations)
    if (newSet.has(tier)) {
      newSet.delete(tier)
    } else {
      newSet.add(tier)
    }
    setNewTemplateVariations(newSet)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading tour templates...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <ToastNotification key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>

      <input ref={fileInputRef} type="file" accept=".csv,.json" className="hidden" />

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Map className="w-5 h-5 text-green-600" />
              <h1 className="text-xl font-bold text-gray-900">Tour Programs Manager</h1>
              <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleAddNew} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium">
                <Plus className="w-4 h-4" />
                Add Template
              </button>
              <Link href="/tours" className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                <Eye className="w-4 h-4" />
                Browse Tours
              </Link>
              <Link href="/rates" className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                ← Resources
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 lg:px-6 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Map className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            </div>
            <p className="text-xs text-gray-600">Templates</p>
            <p className="text-2xl font-bold text-gray-900">{templates.length}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
            </div>
            <p className="text-xs text-gray-600">Variations</p>
            <p className="text-2xl font-bold text-gray-900">{totalVariations}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
            </div>
            <p className="text-xs text-gray-600">Active</p>
            <p className="text-2xl font-bold text-gray-900">{activeTemplates}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            </div>
            <p className="text-xs text-gray-600">Featured</p>
            <p className="text-2xl font-bold text-gray-900">{featuredCount}</p>
          </div>
        </div>

        {/* Search, Filters & View Toggle */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-3 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, code, or city..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm"
              />
            </div>
            <div className="md:w-48 relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm appearance-none"
              >
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.category_name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <div className="md:w-40 relative">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm appearance-none"
              >
                <option value="all">All Types</option>
                {TOUR_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <button
              onClick={() => setShowInactive(!showInactive)}
              className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                showInactive
                  ? 'bg-gray-100 border border-gray-300 text-gray-700'
                  : 'bg-white border border-green-300 text-green-700'
              }`}
            >
              {showInactive ? 'Show All' : 'Active Only'}
            </button>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-white shadow text-green-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Table View"
              >
                <Table2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded ${viewMode === 'cards' ? 'bg-white shadow text-green-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Card View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('compact')}
                className={`p-1.5 rounded ${viewMode === 'compact' ? 'bg-white shadow text-green-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Compact View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-600">
              Showing <span className="font-bold text-gray-900">{filteredTemplates.length}</span> of {templates.length} templates
              {attractions.length > 0 && (
                <span className="ml-2 text-gray-400">• {attractions.length} attractions loaded</span>
              )}
            </p>
          </div>
        </div>

        {/* Table View */}
        {viewMode === 'table' && (
          <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Template</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Type</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Duration</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Cities</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Variations</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredTemplates.map((template, index) => (
                    <React.Fragment key={template.id}>
                      <tr
                        className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors cursor-pointer`}
                        onClick={() => setExpandedTemplate(expandedTemplate === template.id ? null : template.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expandedTemplate === template.id ? 'rotate-90' : ''}`} />
                            <div>
                              <p className="text-sm font-medium text-gray-900">{template.template_name}</p>
                              <p className="text-xs text-gray-500 font-mono">{template.template_code}</p>
                            </div>
                            {template.is_featured && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                            {template.uses_day_builder && (
                              <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-[10px] font-medium">Auto</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                            {TOUR_TYPES.find(t => t.value === template.tour_type)?.label || template.tour_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm text-gray-900">
                            {template.duration_days}D{template.duration_nights ? `/${template.duration_nights}N` : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {template.cities_covered?.slice(0, 3).map(city => (
                              <span key={city} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{city}</span>
                            ))}
                            {(template.cities_covered?.length || 0) > 3 && (
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                                +{(template.cities_covered?.length || 0) - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(template.variations?.length || 0) > 0 ? (
                            <span className="text-sm font-medium text-purple-600">{template.variations?.length || 0}</span>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); setAddVariationTemplate(template) }}
                              className="text-xs text-amber-600 hover:text-amber-800 font-medium flex items-center gap-1 mx-auto"
                            >
                              <Plus className="w-3 h-3" />
                              Add
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            template.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {template.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setDayBuilderTemplate(template)}
                              className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                              title="Day Builder"
                            >
                              <Calendar className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleEdit(template)}
                              className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                              title="Edit"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDuplicate(template)}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Duplicate"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(template.id, template.template_name)}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {/* Expanded Row - Variations */}
                      {expandedTemplate === template.id && (
                        <tr className="bg-gray-50">
                          <td colSpan={7} className="px-8 py-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Layers className="w-4 h-4 text-purple-600" />
                              <span className="text-sm font-medium text-gray-700">Variations</span>
                              <button
                                onClick={() => setAddVariationTemplate(template)}
                                className="ml-2 text-xs text-green-600 hover:text-green-800 font-medium flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" />
                                Add Variation
                              </button>
                              <button
                                onClick={() => setDayBuilderTemplate(template)}
                                className="ml-2 text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1"
                              >
                                <Calendar className="w-3 h-3" />
                                Edit Days
                              </button>
                            </div>
                            {template.variations && template.variations.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {template.variations.map(variation => {
                                  const { style, icon } = getTierBadge(variation.tier)
                                  return (
                                    <div key={variation.id} className={`px-3 py-2 rounded-lg border ${style} flex items-center gap-2`}>
                                      <span>{icon}</span>
                                      <div className="flex-1">
                                        <p className="text-xs font-medium">{variation.variation_name}</p>
                                        <p className="text-xs opacity-75">{variation.group_type} • {variation.min_pax}-{variation.max_pax} pax</p>
                                      </div>
                                      <div className="flex items-center gap-1 ml-2">
                                        <Link
                                          href={`/b2b/calculator/${variation.id}`}
                                          className="p-1.5 text-green-600 hover:bg-green-100 rounded transition-colors"
                                          title="Calculate Price"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <Calculator className="w-4 h-4" />
                                        </Link>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <div className="text-center py-4 border-2 border-dashed border-gray-200 rounded-lg">
                                <p className="text-sm text-gray-500 mb-2">No variations yet</p>
                                <button
                                  onClick={() => setAddVariationTemplate(template)}
                                  className="text-sm text-green-600 hover:text-green-800 font-medium flex items-center gap-1 mx-auto"
                                >
                                  <Plus className="w-4 h-4" />
                                  Add Budget / Standard / Deluxe / Luxury Variations
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {filteredTemplates.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                        <Map className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm font-medium">No tour templates found</p>
                        <button onClick={handleAddNew} className="mt-3 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
                          Create Your First Template
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Card View */}
        {viewMode === 'cards' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((template) => (
              <div key={template.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">{template.template_name}</h3>
                      <p className="text-xs text-gray-500 font-mono">{template.template_code}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {template.is_featured && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        template.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {template.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>{template.duration_days} day{template.duration_days > 1 ? 's' : ''}</span>
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                        {TOUR_TYPES.find(t => t.value === template.tour_type)?.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <MapPin className="w-4 h-4" />
                      <span>{template.cities_covered?.join(', ') || 'No cities set'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Layers className="w-4 h-4" />
                      <span>{template.variations?.length || 0} variations</span>
                      {(template.variations?.length || 0) === 0 && (
                        <button
                          onClick={() => setAddVariationTemplate(template)}
                          className="text-xs text-green-600 hover:text-green-800 font-medium"
                        >
                          + Add
                        </button>
                      )}
                    </div>
                  </div>
                  {template.variations && template.variations.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {template.variations.map(v => {
                        const { style, icon } = getTierBadge(v.tier)
                        return (
                          <span key={v.id} className={`px-2 py-0.5 rounded text-xs border ${style}`}>
                            {icon} {v.tier}
                          </span>
                        )
                      })}
                    </div>
                  )}
                  {template.short_description && (
                    <p className="text-xs text-gray-500 line-clamp-2">{template.short_description}</p>
                  )}
                </div>
                <div className="flex border-t border-gray-200 divide-x divide-gray-200">
                  <button
                    onClick={() => setDayBuilderTemplate(template)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-purple-600 hover:bg-purple-50 transition-colors"
                  >
                    <Calendar className="w-4 h-4" />Days
                  </button>
                  <button
                    onClick={() => handleEdit(template)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <Edit className="w-4 h-4" />Edit
                  </button>
                  <button
                    onClick={() => handleDuplicate(template)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Copy className="w-4 h-4" />Copy
                  </button>
                  <button
                    onClick={() => handleDelete(template.id, template.template_name)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />Delete
                  </button>
                </div>
              </div>
            ))}
            {filteredTemplates.length === 0 && (
              <div className="col-span-full bg-white rounded-lg shadow-md border border-gray-200 p-12 text-center">
                <Map className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-500">No tour templates found</p>
                <button onClick={handleAddNew} className="mt-3 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
                  Create Your First Template
                </button>
              </div>
            )}
          </div>
        )}

        {/* Compact View */}
        {viewMode === 'compact' && (
          <div className="bg-white rounded-lg shadow-md border border-gray-200 divide-y divide-gray-100">
            {filteredTemplates.map((template) => (
              <div key={template.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex-shrink-0">
                    <span className={`w-2 h-2 rounded-full inline-block ${template.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-gray-900 truncate block">{template.template_name}</span>
                  </div>
                  <div className="hidden md:block">
                    <span className="text-xs text-gray-500 font-mono">{template.template_code}</span>
                  </div>
                  <div className="hidden md:block">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{template.duration_days}D</span>
                  </div>
                  <div className="hidden md:flex items-center gap-1">
                    {(template.variations?.length || 0) > 0 ? (
                      <span className="text-xs text-purple-600 font-medium">{template.variations?.length || 0} var</span>
                    ) : (
                      <button
                        onClick={() => setAddVariationTemplate(template)}
                        className="text-xs text-amber-600 hover:text-amber-800"
                      >
                        + Add var
                      </button>
                    )}
                  </div>
                  {template.is_featured && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                </div>
                <div className="flex items-center gap-1 ml-4">
                  <button onClick={() => setDayBuilderTemplate(template)} className="p-1 text-gray-400 hover:text-purple-600 transition-colors">
                    <Calendar className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleEdit(template)} className="p-1 text-gray-400 hover:text-green-600 transition-colors">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDuplicate(template)} className="p-1 text-gray-400 hover:text-blue-600 transition-colors">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(template.id, template.template_name)} className="p-1 text-gray-400 hover:text-red-600 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {filteredTemplates.length === 0 && (
              <div className="p-12 text-center">
                <Map className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-500">No tour templates found</p>
                <button onClick={handleAddNew} className="mt-3 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
                  Create Your First Template
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Template Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-gray-900">
                {editingTemplate ? 'Edit Tour Template' : 'Add New Tour Template'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="px-4 pt-3 border-b">
              <div className="flex gap-4">
                <button
                  onClick={() => setActiveTab('basic')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'basic'
                      ? 'border-green-600 text-green-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  1. Basic Info
                </button>
                <button
                  onClick={() => setActiveTab('details')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'details'
                      ? 'border-green-600 text-green-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  2. Details
                </button>
                {!editingTemplate && (
                  <button
                    onClick={() => setActiveTab('variations')}
                    className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'variations'
                        ? 'border-green-600 text-green-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    3. Variations
                  </button>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-4">
              {/* Basic Information Tab */}
              {activeTab === 'basic' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Template Name *</label>
                      <input
                        type="text"
                        name="template_name"
                        value={formData.template_name}
                        onChange={handleChange}
                        required
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
                        placeholder="e.g., Memphis, Sakkara & Dahshur Day Trip"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Template Code</label>
                      <input
                        type="text"
                        name="template_code"
                        value={formData.template_code}
                        onChange={handleChange}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono"
                        placeholder="Auto-generated if empty"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                      <select
                        name="category_id"
                        value={formData.category_id}
                        onChange={handleChange}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                      >
                        <option value="">Select Category...</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.category_name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Tour Type *</label>
                      <select
                        name="tour_type"
                        value={formData.tour_type}
                        onChange={handleChange}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                      >
                        {TOUR_TYPES.map(type => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Duration (Days) *</label>
                      <input
                        type="number"
                        name="duration_days"
                        value={formData.duration_days}
                        onChange={handleChange}
                        min="1"
                        required
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Duration (Nights)</label>
                      <input
                        type="number"
                        name="duration_nights"
                        value={formData.duration_nights}
                        onChange={handleChange}
                        min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Physical Level</label>
                      <select
                        name="physical_level"
                        value={formData.physical_level}
                        onChange={handleChange}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                      >
                        {PHYSICAL_LEVELS.map(level => (
                          <option key={level.value} value={level.value}>{level.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Cities */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">Cities Covered</label>
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                      {EGYPTIAN_CITIES.map(city => (
                        <label key={city} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.cities_covered.includes(city)}
                            onChange={() => toggleCity(city)}
                            className="w-4 h-4 text-green-600 border-gray-300 rounded"
                          />
                          <span className="text-xs text-gray-700">{city}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Descriptions */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Short Description</label>
                    <input
                      type="text"
                      name="short_description"
                      value={formData.short_description}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                      placeholder="Brief summary for cards and listings"
                    />
                  </div>

                  {/* Options Row */}
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        name="is_featured"
                        checked={formData.is_featured}
                        onChange={handleCheckboxChange}
                        className="w-4 h-4 text-green-600 border-gray-300 rounded"
                      />
                      <span className="text-xs text-gray-700">⭐ Featured Tour</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        name="is_active"
                        checked={formData.is_active}
                        onChange={handleCheckboxChange}
                        className="w-4 h-4 text-green-600 border-gray-300 rounded"
                      />
                      <span className="text-xs text-gray-700">Active</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        name="uses_day_builder"
                        checked={formData.uses_day_builder}
                        onChange={handleCheckboxChange}
                        className="w-4 h-4 text-purple-600 border-gray-300 rounded"
                      />
                      <span className="text-xs text-gray-700">⚡ Auto-Pricing (Day Builder)</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Details Tab */}
              {activeTab === 'details' && (
                <div className="space-y-6">
                  {/* 1. Highlights */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">Highlights</label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={highlightInput}
                        onChange={(e) => setHighlightInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addHighlight())}
                        className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg"
                        placeholder="Add a highlight and press Enter"
                      />
                      <button type="button" onClick={addHighlight} className="px-3 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 text-sm font-medium">
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.highlights.map((h, i) => (
                        <span key={i} className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs border border-amber-200">
                          ✨ {h}
                          <button type="button" onClick={() => removeHighlight(i)} className="text-amber-500 hover:text-amber-700">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* 2. Attractions Dropdown */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">
                      Main Attractions
                      <span className="ml-2 text-gray-400 font-normal">({attractions.length} available)</span>
                    </label>
                    <AttractionDropdown
                      attractions={attractions}
                      selectedAttractions={formData.main_attractions}
                      onSelect={addAttraction}
                      onRemove={removeAttraction}
                    />
                  </div>

                  {/* 3. Day-by-Day Itinerary (with meals per day) */}
                  <div className="border-t pt-6">
                    <ItineraryEditor
                      itinerary={formData.itinerary}
                      onChange={handleItineraryChange}
                    />
                  </div>

                  {/* 4. Best For (at the end) */}
                  <div className="border-t pt-6">
                    <label className="block text-xs font-medium text-gray-600 mb-2">Best For</label>
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                      {BEST_FOR_OPTIONS.map(option => (
                        <label key={option} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.best_for.includes(option)}
                            onChange={() => toggleBestFor(option)}
                            className="w-4 h-4 text-green-600 border-gray-300 rounded"
                          />
                          <span className="text-xs text-gray-700">{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Variations Tab (only for new templates) */}
              {activeTab === 'variations' && !editingTemplate && (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-blue-800">
                      <strong>💡 Tip:</strong> Select the pricing tiers you want to offer. After creating the template, use the Day Builder to add activities and enable auto-pricing.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {(Object.entries(TIER_CONFIG) as [string, typeof TIER_CONFIG.budget][]).map(([tier, config]) => (
                      <div
                        key={tier}
                        className={`border rounded-lg p-4 cursor-pointer transition-all ${
                          newTemplateVariations.has(tier)
                            ? `${config.borderColor} ${config.bgColor}`
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => toggleNewVariationTier(tier)}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={newTemplateVariations.has(tier)}
                            onChange={() => toggleNewVariationTier(tier)}
                            className="mt-1 w-4 h-4 text-green-600 border-gray-300 rounded"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{config.icon}</span>
                              <span className={`font-medium ${newTemplateVariations.has(tier) ? config.textColor : 'text-gray-900'}`}>
                                {config.label}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{config.description}</p>
                            
                            {newTemplateVariations.has(tier) && (
                              <div className="mt-3 pt-3 border-t border-gray-200" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center gap-4">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      name={`new-group-${tier}`}
                                      checked={newTemplateGroupTypes[tier] === 'private'}
                                      onChange={() => setNewTemplateGroupTypes(prev => ({ ...prev, [tier]: 'private' }))}
                                      className="w-4 h-4 text-green-600"
                                    />
                                    <span className="text-sm text-gray-700">🔒 Private</span>
                                  </label>
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      name={`new-group-${tier}`}
                                      checked={newTemplateGroupTypes[tier] === 'shared'}
                                      onChange={() => setNewTemplateGroupTypes(prev => ({ ...prev, [tier]: 'shared' }))}
                                      className="w-4 h-4 text-green-600"
                                    />
                                    <span className="text-sm text-gray-700">👥 Shared</span>
                                  </label>
                                </div>
                                <div className="mt-2 text-xs text-gray-500">
                                  Default: {config.defaults.min_pax}-{config.defaults.max_pax} pax • 
                                  Vehicle: {config.defaults.vehicle_type.replace('_', ' ')} • 
                                  {config.defaults.accommodation_standard.replace('_', ' ')}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600">
                      {newTemplateVariations.size} variation{newTemplateVariations.size !== 1 ? 's' : ''} will be created with this template
                    </p>
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-2 pt-4 mt-4 border-t">
                {activeTab !== 'basic' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab(activeTab === 'variations' ? 'details' : 'basic')}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                  >
                    ← Back
                  </button>
                )}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                {!editingTemplate && activeTab !== 'variations' ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab(activeTab === 'basic' ? 'details' : 'variations')}
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                  >
                    Next →
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    {editingTemplate ? 'Update Template' : 'Create Template & Variations'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD VARIATION MODAL (for existing templates) */}
      {addVariationTemplate && (
        <AddVariationModal
          template={addVariationTemplate}
          onClose={() => setAddVariationTemplate(null)}
          onSuccess={fetchTemplates}
          showToast={showToast}
        />
      )}

      {/* DAY BUILDER MODAL */}
      {dayBuilderTemplate && (
        <DayBuilderModal
          template={dayBuilderTemplate}
          onClose={() => setDayBuilderTemplate(null)}
          onSave={fetchTemplates}
        />
      )}

      <style jsx>{`
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
      `}</style>
    </div>
  )
}