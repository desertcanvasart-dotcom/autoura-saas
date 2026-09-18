'use client'

import { useRateRowFormat } from '@/hooks/useRateCurrencySymbol'

export const dynamic = 'force-dynamic'

import React, { useEffect, useMemo, useState, useRef } from 'react'
import Link from 'next/link'
import { sampleTemplateCsv } from '@/lib/tours/template-csv'
import { sampleDaysCsv } from '@/lib/tours/itinerary-csv'
import { readDayMeals, summarizeMeals, mealStatusLabel, MEAL_SLOTS, type DayMeals, type DayMealStatus, type MealSlot } from '@/lib/tours/day-meals'
import {
  Map,
  Plus,
  Download,
  Upload,
  FileText,
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
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useTierConfigs, useVocabulary } from '@/components/vocabulary'
import { suggestTourType, durationForType, isSingleDayType } from '@/lib/tours/tour-type'
import { useSubmitGuard } from '@/app/hooks/useSubmitGuard'

// ============================================
// INTERFACES
// ============================================

interface TourVariation {
  id: string
  template_id: string
  variation_code: string
  variation_name: string
  tier: string
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
  tour_theme?: string
  tour_type: string
  duration_days: number
  duration_nights?: number
  duration_hours?: number | null
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
  variations?: TourVariation[]
  itinerary?: ItineraryDay[]
  meals_included?: string[]
  pickup_required?: boolean
  age_suitability?: string
  inclusions?: string[]   // NEW: What's included
  exclusions?: string[]   // NEW: What's not included
}

// NEW: Itinerary Day interface
interface ItineraryDay {
  day: number
  title: string
  description: string
  /** Where the day IS. Stored, not read out of the title: an unplaced day
   *  used to be priced as Cairo, and now records a gap instead. */
  city?: string
  /** Where the night is spent. Stored, not guessed from the words: one day
   *  saying "cruise" used to make every night in the programme a cruise
   *  night (11 of 12 on a live 12-day tour). */
  accommodation_type?: 'hotel' | 'cruise' | 'none'
  meals: DayMeals
  /** Names, for display and for the engine's text fallback. */
  attractions?: string[]
  /** Explicit entrance_fees ids — the engine prices THESE and ignores
   *  wording when present (A-item 13). */
  attraction_ids?: string[]
  /** How this day travels (B-item 2). Absent = road. flight/train = the
   *  previous day's city → this day's; sleeping train = this day's city →
   *  the next day's (board tonight, wake there — no hotel that night). */
  transport_type?: 'flight' | 'train' | 'sleeping_train'
  /** The EXACT ticket row when several serve the route ("Auto" = resolve
   *  by route at pricing time; ambiguity becomes a named hole). */
  transport_rate_id?: string
}

/** A ticket row the Travel picker can name (B-item 2). */
interface TicketOption {
  id: string
  label: string
}
/** A ticket rate row as the rates APIs return it. */
type TicketRow = Record<string, unknown>

interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

// NEW: Attraction interface from entrance_fees
interface Attraction {
  rate_currency?: string | null
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

// The WORDS for tour types, physical levels, "best for" and themes are the
// agency's own now — Settings → Your vocabulary (migration 358). The KEYS
// below are still the app's: day_tour and stopover are what make a tour
// measured in hours instead of days, so that logic stays keyed, not worded.
// Which types are measured in HOURS is the agency's own answer now: a type
// whose vocabulary entry says it covers at most one day (migration 363). The
// hardcoded list this replaced treated Sawa Tours' "OverDay Trip" — a day
// trip — as multi-day, and held it to 2 days and a night.
const isSingleDayTourType = (tourType: string | null | undefined, singleDayKeys: ReadonlySet<string>) =>
  !!tourType && singleDayKeys.has(tourType)

// Human-readable duration: hours for a single-day tour that has them, else the
// classic "days/nights" shorthand.
const formatTourDuration = (t: {
  tour_type?: string | null
  duration_days?: number | null
  duration_nights?: number | null
  duration_hours?: number | null
}, singleDayKeys: ReadonlySet<string>): string => {
  if (t.duration_hours && isSingleDayTourType(t.tour_type, singleDayKeys)) {
    return `${t.duration_hours}h`
  }
  const days = t.duration_days || 0
  const nights = t.duration_nights || 0
  return `${days}D${nights ? `/${nights}N` : ''}`
}

// ============================================
// TOAST COMPONENT
// ============================================
function ToastNotification({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    // Anything that is not a plain success now carries something to act on —
    // an instruction, a refusal reason, a list of columns that were not read.
    // Four seconds is not long enough to read one, and a toast that vanishes
    // mid-sentence is the same as no message at all.
    const timer = setTimeout(onClose, toast.type === 'success' ? 4000 : 12000)
    return () => clearTimeout(timer)
  }, [onClose, toast.type])

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
    <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg max-w-xl ${bgColor} animate-slide-in`}>
      {toast.type === 'success' ? (
        <CheckCircle2 className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
      ) : (
        <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
      )}
      <span className={`text-sm font-medium ${textColor}`}>{toast.message}</span>
      <button onClick={onClose} className={`ml-2 flex-shrink-0 ${iconColor} hover:opacity-70`}>
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
  const { fmtRate } = useRateRowFormat()
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
    // Keep the dropdown OPEN so the operator can add several attractions in a
    // row without reopening after each pick. Clear the search so the full
    // remaining list is scrollable, and keep focus on the input.
    setSearchTerm('')
    setIsOpen(true)
    inputRef.current?.focus()
  }

  return (
    <div className="space-y-2">
      {/* Search Input with Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
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
                          EUR passport: {fmtRate(attr.eur_rate, attr, 0)} / Non-EUR: {fmtRate(attr.non_eur_rate, attr, 0)}
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
  /** The entrance-fee catalogue, for picking attractions BY ID. */
  attractionOptions: Attraction[]
  /** Ticket catalogues for the Travel picker (B-item 2). */
  ticketOptions: Record<'flight' | 'train' | 'sleeping_train', TicketOption[]>
}

function ItineraryEditor({ itinerary, onChange, attractionOptions, ticketOptions }: ItineraryEditorProps) {
  const [dayTitle, setDayTitle] = useState('')
  const [dayDescription, setDayDescription] = useState('')
  // Tri-state per meal. The checkboxes could only say included-or-nothing,
  // so a restaurant lunch the operator prices separately had no way to be
  // recorded here, only via the days sheet.
  // '' = not yet stated. THE RULE: a day is not added until all three meals are
  // stated — hotel, restaurant, or not provided. A cost line is never defaulted.
  const [dayMeals, setDayMeals] = useState<Record<MealSlot, DayMealStatus | ''>>({ breakfast: '', lunch: '', dinner: '' })
  const [dayMealsError, setDayMealsError] = useState<string | null>(null)
  // Picked BY ID from the entrance-fee catalogue: the engine prices these
  // rows exactly and ignores the title's wording (A-item 13).
  const [dayAttractions, setDayAttractions] = useState<Array<{ id: string; name: string }>>([])
  // Travel mode + optional exact row (B-item 2). '' = road, as before.
  const [dayTransportType, setDayTransportType] = useState<'' | 'flight' | 'train' | 'sleeping_train'>('')
  const [dayTransportRateId, setDayTransportRateId] = useState('')
  // Where the day is, and where the night is spent. Both were guessed from
  // the title before: an unplaced day priced as Cairo, and one mention of a
  // cruise made every night a cruise night.
  const [dayCity, setDayCity] = useState('')
  const [dayNight, setDayNight] = useState<'' | 'hotel' | 'cruise' | 'none'>('')
  /** The day being edited, or null when the form is adding a new one. */
  const [editingDayIndex, setEditingDayIndex] = useState<number | null>(null)

  const setMeal = (slot: MealSlot, status: DayMealStatus | '') => {
    setDayMealsError(null)
    setDayMeals(prev => ({ ...prev, [slot]: status }))
  }

  const addDayAttraction = (id: string) => {
    if (!id) return
    const attr = attractionOptions.find(a => a.id === id)
    if (!attr || dayAttractions.some(a => a.id === id)) return
    setDayAttractions(prev => [...prev, { id: attr.id, name: attr.attraction_name }])
  }

  const resetDayForm = () => {
    setDayTitle('')
    setDayDescription('')
    setDayMeals({ breakfast: '', lunch: '', dinner: '' })
    setDayAttractions([])
    setDayTransportType('')
    setDayTransportRateId('')
    setDayCity('')
    setDayNight('')
    setEditingDayIndex(null)
  }

  /** Load a day back into the form to change it. Until now a day could only
   *  be added or removed, so correcting a typo meant rebuilding it. */
  const editDay = (index: number) => {
    const day = itinerary[index]
    if (!day) return
    const meals = readDayMeals(day.meals)
    setEditingDayIndex(index)
    setDayTitle(day.title || '')
    setDayDescription(day.description || '')
    setDayMeals({ breakfast: meals.breakfast, lunch: meals.lunch, dinner: meals.dinner } as typeof dayMeals)
    setDayAttractions((day.attraction_ids || []).map((id, i) => ({ id, name: (day.attractions || [])[i] || id })))
    setDayTransportType((day.transport_type as typeof dayTransportType) || '')
    setDayTransportRateId(day.transport_rate_id || '')
    setDayCity(day.city || '')
    setDayNight((day.accommodation_type as typeof dayNight) || '')
    setDayMealsError(null)
  }

  const addDay = () => {
    const unstated = MEAL_SLOTS.filter(k => dayMeals[k] === '')
    if (unstated.length) {
      setDayMealsError(`State ${unstated.join(', ')} for this day — hotel, restaurant, or not provided. A meal is a cost line and part of the agreement with the customer.`)
      return
    }
    if (!dayTitle.trim()) return
    
    const newDay: ItineraryDay = {
      day: editingDayIndex === null ? itinerary.length + 1 : itinerary[editingDayIndex].day,
      title: dayTitle.trim(),
      description: dayDescription.trim(),
      // Written in the object shape, not the legacy array: it is what the
      // pricing engine calls the new format, what the days CSV round-trips,
      // and the only one that can say 'external'. Existing array days keep
      // working — readDayMeals() handles both.
      meals: { ...dayMeals } as DayMeals,
      ...(dayAttractions.length > 0
        ? {
            attractions: dayAttractions.map(a => a.name),
            attraction_ids: dayAttractions.map(a => a.id),
          }
        : {}),
      ...(dayTransportType
        ? {
            transport_type: dayTransportType,
            ...(dayTransportRateId ? { transport_rate_id: dayTransportRateId } : {}),
          }
        : {}),
      // Written only when stated. An empty city or night leaves the day
      // exactly as it was, so nothing here silently overwrites a day the
      // engine was reading from its words.
      ...(dayCity.trim() ? { city: dayCity.trim() } : {}),
      ...(dayNight ? { accommodation_type: dayNight } : {}),
    }

    if (editingDayIndex === null) {
      onChange([...itinerary, newDay])
    } else {
      onChange(itinerary.map((d, i) => (i === editingDayIndex ? newDay : d)))
    }

    resetDayForm()
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

      {/* Add / edit a day */}
      <div className={`border rounded-lg p-4 space-y-3 ${editingDayIndex === null ? 'border-gray-200 bg-gray-50' : 'border-amber-300 bg-amber-50'}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
            editingDayIndex === null ? 'bg-green-100 text-green-700' : 'bg-amber-200 text-amber-800'
          }`}>
            {editingDayIndex === null ? itinerary.length + 1 : itinerary[editingDayIndex]?.day}
          </span>
          <span className="text-sm font-medium text-gray-600">
            {editingDayIndex === null
              ? `Day ${itinerary.length + 1}`
              : `Editing day ${itinerary[editingDayIndex]?.day}`}
          </span>
          {editingDayIndex !== null && (
            <button
              type="button"
              onClick={resetDayForm}
              className="ml-auto text-xs text-gray-500 hover:text-gray-800 underline"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Where the day is, and where the night is spent. Both used to be
            read out of the title: an unplaced day was priced as Cairo, and a
            single mention of a cruise made every night a cruise night. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
            <input
              list="tour-day-cities"
              value={dayCity}
              onChange={(e) => setDayCity(e.target.value)}
              placeholder="Where this day is"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
            />
            <datalist id="tour-day-cities">
              {EGYPTIAN_CITIES.map(c => <option key={c} value={c} />)}
            </datalist>
            <p className="text-[11px] text-gray-500 mt-1">
              Left blank, pricing reads the title — and a day it cannot place is a gap, not Cairo.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Night</label>
            <select
              value={dayNight}
              onChange={(e) => setDayNight(e.target.value as typeof dayNight)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
            >
              <option value="">Not stated — read from the title</option>
              <option value="hotel">Hotel</option>
              <option value="cruise">On board</option>
              <option value="none">No night (departure, or a day tour)</option>
            </select>
            <p className="text-[11px] text-gray-500 mt-1">
              Say it here and the words in the title stop deciding it.
            </p>
          </div>
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

        {/* Meals — per day, per meal, three states, named by what the pricing
            engine does with them: in the hotel rate, at a restaurant we price
            separately, or not provided. A cost line and part of the agreement
            with the customer, so it lives on the day. */}
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-xs text-gray-500">Meals:</span>
          {MEAL_SLOTS.map(slot => (
            <label key={slot} className="flex items-center gap-1.5">
              <span className="text-xs text-gray-700 capitalize">{slot}</span>
              <select
                value={dayMeals[slot]}
                onChange={(e) => setMeal(slot, e.target.value as DayMealStatus)}
                className="px-2 py-1 text-xs border border-gray-300 rounded-md bg-white"
              >
                <option value="" disabled>Choose…</option>
                <option value="included">In hotel rate</option>
                <option value="external">Restaurant (priced)</option>
                <option value="none">Not provided</option>
              </select>
            </label>
          ))}
        </div>
        {dayMealsError && <p className="text-xs text-red-600">{dayMealsError}</p>}

        {/* Attractions — picked BY ID so the engine prices the exact fee
            rows and ignores the title's wording (A-item 13). */}
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Attractions:</span>
            <select
              value=""
              onChange={(e) => addDayAttraction(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
            >
              <option value="">Pick from entrance fees…</option>
              {attractionOptions
                .filter(a => !dayAttractions.some(d => d.id === a.id))
                .map(a => (
                  <option key={a.id} value={a.id}>{a.attraction_name}{a.city ? ` — ${a.city}` : ''}</option>
                ))}
            </select>
          </div>
          {dayAttractions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {dayAttractions.map(a => (
                <span key={a.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs">
                  {a.name}
                  <button
                    type="button"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => setDayAttractions(prev => prev.filter(x => x.id !== a.id))}
                    className="text-green-700 hover:text-green-900"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Travel picker (B-item 2): how this day travels. Road is the
            default; flights/day trains run previous-day city → this day's,
            a sleeper runs this day's city → the next day's (no hotel that
            night — the ticket IS the bed). Naming the exact row beats
            "Auto" when several serve the route. */}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">Travel:</span>
            {([['', 'Road'], ['flight', 'Flight'], ['train', 'Day train'], ['sleeping_train', 'Sleeping train']] as const).map(([value, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => { setDayTransportType(value as typeof dayTransportType); setDayTransportRateId('') }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  dayTransportType === value
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {dayTransportType && (
            <div className="mt-2">
              <select
                value={dayTransportRateId}
                onChange={(e) => setDayTransportRateId(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
              >
                <option value="">
                  {ticketOptions[dayTransportType].length === 0
                    ? 'No rates in the catalogue yet — pricing will show a hole for this route'
                    : 'Auto — resolve by route at pricing time'}
                </option>
                {ticketOptions[dayTransportType].map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                {dayTransportType === 'sleeping_train'
                  ? 'Board tonight, wake in the next day\u2019s city \u2014 no hotel bed this night.'
                  : 'The leg runs from the previous day\u2019s city to this one; several matching rates become a pick-the-exact-one hole unless named here.'}
              </p>
            </div>
          )}
        </div>

        {/* Add Button */}
        <button
          type="button"
          onClick={addDay}
          disabled={!dayTitle.trim()}
          className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {editingDayIndex === null ? `+ Add Day ${itinerary.length + 1}` : 'Save this day'}
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
                <p className="text-xs text-gray-500 mt-0.5">
                  📍 {day.city || <span className="italic">city not stated — read from the title</span>}
                  {' · 🌙 '}
                  {day.accommodation_type === 'cruise'
                    ? 'On board'
                    : day.accommodation_type === 'hotel'
                    ? 'Hotel'
                    : day.accommodation_type === 'none'
                    ? 'No night'
                    : <span className="italic">night not stated — read from the title</span>}
                </p>
                {day.attraction_ids && day.attraction_ids.length > 0 && (
                  <p className="text-xs text-green-700 mt-0.5">
                    Attractions (priced by pick): {(day.attractions || []).join(', ')}
                  </p>
                )}
                {day.transport_type && (
                  <p className="text-xs text-sky-700 mt-0.5">
                    Travel: {day.transport_type === 'sleeping_train' ? 'Sleeping train' : day.transport_type === 'train' ? 'Day train' : 'Flight'}
                    {day.transport_rate_id ? ' (named rate)' : ' (auto by route)'}
                  </p>
                )}
                {(() => {
                  // Both shapes, one reader (lib/tours/day-meals.ts). ALL
                  // THREE, always: "not provided" is a stated decision and a
                  // cost line, and hiding it made a day that said so look the
                  // same as a day that had never said anything.
                  const m = readDayMeals(day.meals)
                  return (
                    <p className="text-xs text-blue-600 mt-1">
                      🍽️ {MEAL_SLOTS.map(k => `${k[0].toUpperCase() + k.slice(1)}: ${mealStatusLabel(m[k])}`).join(' · ')}
                    </p>
                  )
                })()}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => editDay(index)}
                  className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit day"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeDay(index)}
                  className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove day"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
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
  // The agency's tiers, configured for variations (Settings → Your vocabulary).
  const { entries: tierEntries, byKey: tierConfigs } = useTierConfigs()
  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(new Set(['standard']))
  const [groupTypes, setGroupTypes] = useState<Record<string, 'private' | 'shared'>>({})
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
    
    const variations = Array.from(selectedTiers).filter(tier => tierConfigs[tier]).map(tier => {
      const config = tierConfigs[tier]
      const groupType = groupTypes[tier] ?? config.defaults.group_type
      
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
            {tierEntries.map(config => [config.key, config] as const).map(([tier, config]) => (
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
                              checked={(groupTypes[tier] ?? config.defaults.group_type) === 'private'}
                              onChange={() => setGroupTypes(prev => ({ ...prev, [tier]: 'private' }))}
                              className="w-4 h-4 text-green-600"
                            />
                            <span className="text-sm text-gray-700">🔒 Private</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`group-${tier}`}
                              checked={(groupTypes[tier] ?? config.defaults.group_type) === 'shared'}
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
  // Its own read of the agency's tour types: which ones are measured in hours
  // is their answer, not a constant (migration 363).
  const { items: tourTypeItems } = useVocabulary('tour_type')
  const singleDayKeys = useMemo(
    () => new Set(tourTypeItems.filter(i => isSingleDayType(i)).map(i => i.key)),
    [tourTypeItems]
  )

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between bg-white">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Day Builder</h2>
            <p className="text-xs text-gray-500 mt-0.5">{template.template_name} • {formatTourDuration(template, singleDayKeys)}</p>
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
  // The agency's tiers, configured for variations (Settings → Your vocabulary).
  const { entries: tierEntries, byKey: tierConfigs } = useTierConfigs()
  const dialog = useConfirmDialog()
  const { submitting, guard } = useSubmitGuard()
  const [templates, setTemplates] = useState<TourTemplate[]>([])
  // All four tour dropdowns come from the tenant's vocabulary. Themes used to
  // be tour_categories — a table nothing seeded and no screen could add to, so
  // the dropdown was empty for everyone (retired in 359).
  const { items: tourTypeItems, labelFor: tourTypeLabel } = useVocabulary('tour_type')
  // The types this agency measures in hours, from their own ranges.
  const singleDayKeys = useMemo(
    () => new Set(tourTypeItems.filter(i => isSingleDayType(i)).map(i => i.key)),
    [tourTypeItems]
  )
  const { items: physicalLevelItems } = useVocabulary('tour_physical_level')
  const { items: bestForItems } = useVocabulary('tour_best_for')
  const { items: themeItems } = useVocabulary('tour_theme')
  const [attractions, setAttractions] = useState<Attraction[]>([])  // NEW: Attractions from DB
  // Ticket catalogues for the Travel picker (B-item 2), labelled
  // operator/class/route so the operator can name THE train or flight.
  const [ticketRows, setTicketRows] = useState<Record<'flight' | 'train' | 'sleeping_train', TicketRow[]>>({
    flight: [], train: [], sleeping_train: [],
  })
  const { labelFor: trainClassLabel } = useVocabulary('train_class')
  const { labelFor: sleeperCabinLabel } = useVocabulary('sleeper_cabin')
  const { labelFor: airlineLabel } = useVocabulary('airline')
  const ticketOptions = useMemo<Record<'flight' | 'train' | 'sleeping_train', TicketOption[]>>(() => {
    const opt = (rows: TicketRow[], label: (r: TicketRow) => string) => rows.map(r => ({ id: String(r.id), label: label(r) }))
    const str = (v: unknown) => (v == null ? '' : String(v))
    return {
      flight: opt(ticketRows.flight, r => `${airlineLabel(str(r.airline))}${r.flight_number ? ` ${str(r.flight_number)}` : ''} ${str(r.route_from)} → ${str(r.route_to)}${r.cabin_class ? ` (${str(r.cabin_class)})` : ''}`),
      train: opt(ticketRows.train, r => `${str(r.operator_name) || 'Train'}${r.class_type ? ` ${trainClassLabel(str(r.class_type))}` : ''} ${str(r.origin_city)} → ${str(r.destination_city)}`),
      sleeping_train: opt(ticketRows.sleeping_train, r => `${str(r.operator_name) || 'Sleeper'} ${sleeperCabinLabel(str(r.cabin_type))} ${str(r.origin_city)} → ${str(r.destination_city)}`),
    }
  }, [ticketRows, trainClassLabel, sleeperCabinLabel, airlineLabel])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTheme, setSelectedTheme] = useState('all')  // Renamed from selectedCategory
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
  const [newTemplateGroupTypes, setNewTemplateGroupTypes] = useState<Record<string, 'private' | 'shared'>>({})
  
  const [formData, setFormData] = useState({
    template_code: '',
    template_name: '',
    tour_theme: '',
    tour_type: 'day_tour',
    duration_days: 1,
    duration_nights: 0,
    duration_hours: 8 as number | null,  // Day tours are measured in hours, not days
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
    itinerary: [] as ItineraryDay[],
    inclusions: [] as string[],   // NEW: What's included
    exclusions: [] as string[]    // NEW: What's not included
  })

  const [highlightInput, setHighlightInput] = useState('')
  const [inclusionInput, setInclusionInput] = useState('')   // NEW
  const [exclusionInput, setExclusionInput] = useState('')   // NEW

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
      if (!response.ok) {
        console.error('Templates API error:', response.status)
        return
      }
      const data = await response.json()
      if (data.success) {
        setTemplates(data.data)
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
      showToast('error', 'Failed to load tour templates')
    }
  }

  // NEW: Fetch attractions from entrance_fees table
  const fetchAttractions = async () => {
    try {
      const response = await fetch('/api/rates/entrance-fees?limit=500')
      if (!response.ok) {
        console.error('Entrance fees API error:', response.status)
        return
      }
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

  // Rows are kept raw and labelled at render, so the train class and sleeper
  // cabin read in the agency's words (Settings → Your vocabulary) even when
  // the vocabulary finishes loading after the rates do.
  const fetchTicketOptions = async () => {
    const load = async (url: string): Promise<TicketRow[]> => {
      try {
        const res = await fetch(url)
        if (!res.ok) return []
        const body = await res.json()
        return ((body.data || []) as TicketRow[]).filter(r => r.is_active !== false)
      } catch {
        return []
      }
    }
    const [flight, train, sleeping_train] = await Promise.all([
      load('/api/rates/flights'),
      load('/api/rates/trains'),
      load('/api/rates/sleeping-trains'),
    ])
    setTicketRows({ flight, train, sleeping_train })
  }

  useEffect(() => {
    // Set a timeout to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
      setLoading(false)
      console.warn('Tour manager loading timeout reached')
    }, 10000) // 10 second timeout

    Promise.all([
      fetchTemplates(),
      fetchAttractions(),  // NEW: Fetch attractions on load
      fetchTicketOptions()  // Ticket catalogues for the Travel picker (B2)
    ]).finally(() => {
      clearTimeout(loadingTimeout)
      setLoading(false)
    })

    return () => clearTimeout(loadingTimeout)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    const parsedValue = type === 'number' ? parseInt(value) || 0 : value
    
    setFormData(prev => {
      const updated = {
        ...prev,
        [name]: parsedValue
      }
      
      // Suggest a tour type from the duration — from the agency's OWN types and
      // the days each covers (Settings → Your vocabulary, migration 363), never
      // from hardcoded keys. This used to set multi_day on any 2+ day tour,
      // which wiped an agency's own type: a Package tour became a Multi-Day
      // Tour the moment someone edited its duration. A type with no range set
      // is the operator's decision and is left alone (lib/tours/tour-type.ts).
      if (name === 'duration_days' && typeof parsedValue === 'number') {
        const suggested = suggestTourType(parsedValue, prev.tour_type, tourTypeItems)
        if (suggested) updated.tour_type = suggested
      }

      // Keep the duration coherent when the TYPE is switched, again from its
      // own range: a type measured in hours holds the tour to its one day.
      if (name === 'tour_type' && typeof parsedValue === 'string') {
        const item = tourTypeItems.find(i => i.key === parsedValue)
        const duration = durationForType(item, prev.duration_days)
        if (duration) {
          updated.duration_days = duration.duration_days
          updated.duration_nights = duration.duration_nights
        }
        if (isSingleDayType(item) && !updated.duration_hours) updated.duration_hours = 8
      }

      return updated
    })
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

  // NEW: Inclusions functions
  const addInclusion = () => {
    if (inclusionInput.trim()) {
      setFormData(prev => ({
        ...prev,
        inclusions: [...prev.inclusions, inclusionInput.trim()]
      }))
      setInclusionInput('')
    }
  }

  const removeInclusion = (index: number) => {
    setFormData(prev => ({
      ...prev,
      inclusions: prev.inclusions.filter((_, i) => i !== index)
    }))
  }

  // NEW: Exclusions functions
  const addExclusion = () => {
    if (exclusionInput.trim()) {
      setFormData(prev => ({
        ...prev,
        exclusions: [...prev.exclusions, exclusionInput.trim()]
      }))
      setExclusionInput('')
    }
  }

  const removeExclusion = (index: number) => {
    setFormData(prev => ({
      ...prev,
      exclusions: prev.exclusions.filter((_, i) => i !== index)
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

  const bulkFileRef = useRef<HTMLInputElement>(null)
  const daysFileRef = useRef<HTMLInputElement>(null)

  // The sheet to start a bulk upload from: headers + one example row.
  const handleSampleCsv = () => {
    const blob = new Blob([sampleTemplateCsv()], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'tour-templates-sample.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // The days sheet: one row per itinerary day. Separate from the template
  // sheet because a day is a nested record and a flat row cannot hold one —
  // the same split as the supplier properties sheet.
  const handleSampleDaysCsv = () => {
    const blob = new Blob([sampleDaysCsv()], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'tour-days-sample.csv'
    a.click()
  }

  // Fetched, not navigated to: window.location.href on a route that answers
  // JSON on failure replaced the page with raw JSON (or, with a download
  // header, did nothing at all and left the operator staring at the screen).
  // A failure is reported in place, with the reason the route gives.
  const downloadCsv = async (url: string, filename: string, what: string) => {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `${what} export failed (${res.status})`)
      }
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(href)
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : `${what} export failed`)
    }
  }

  const handleExportDays = () => {
    void downloadCsv(
      '/api/tours/bulk/export-days',
      `tour-days-${new Date().toISOString().split('T')[0]}.csv`,
      'Day'
    )
  }

  const handleImportDays = async (file: File) => {
    try {
      const text = await file.text()
      const res = await fetch('/api/tours/bulk/import-days', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvData: text, dryRun: false }),
      })
      const json = await res.json()
      const firstReason = Array.isArray(json.refused) && json.refused.length
        ? ` — ${json.refused[0].reason}` : ''
      const landed = (json.updated || 0)
      const counts =
        `${json.days || 0} day(s) across ${json.updated || 0} tour(s)` +
        (json.refusedRows ? `, ${json.refusedRows} skipped${firstReason}` : '')
      if (json.success) {
        showToast(json.refusedRows ? 'info' : 'success', `Itineraries updated: ${counts}`)
      } else {
        showToast(
          'error',
          (json.error || 'Day import failed') + (landed ? ` — ${counts} before it stopped` : '')
        )
      }
      if (landed > 0 || json.success) fetchTemplates()
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Day import failed')
    } finally {
      if (daysFileRef.current) daysFileRef.current.value = ''
    }
  }

  // Flat CSV of the portable template metadata (this tenant). Server builds it.
  const handleExportTemplates = () => {
    void downloadCsv(
      '/api/tours/bulk/export',
      `tour-templates-${new Date().toISOString().split('T')[0]}.csv`,
      'Template'
    )
  }

  // Import that CSV: upserts by template_code (portable fields only, never the
  // itinerary) — used to receive the other install's template export.
  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text()
      const res = await fetch('/api/tours/bulk/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvData: text, dryRun: false }),
      })
      const json = await res.json()
      // The server names WHICH row failed and why. Dropping that on the floor
      // left every failed import as a bare "Import failed" — the reasons were
      // being computed and then thrown away.
      const firstReason = Array.isArray(json.refused) && json.refused.length
        ? ` — ${json.refused[0].reason}`
        : ''
      // Columns the sheet carried that this importer does not read. Saying so
      // is the difference between "my inclusions did not import" and knowing
      // the column was never read.
      const ignored = Array.isArray(json.ignoredHeaders) && json.ignoredHeaders.length
        ? ` — columns not imported: ${json.ignoredHeaders.join(', ')}`
        : ''
      // What LANDED is said even when some rows failed: the route imports row
      // by row, so a partial failure still created and updated tours. Showing
      // only the error hid that, and skipping the refresh left the screen
      // claiming those tours did not exist.
      const landed = (json.created || 0) + (json.updated || 0)
      const counts =
        `${json.created || 0} created, ${json.updated || 0} updated` +
        (json.refusedRows ? `, ${json.refusedRows} skipped${firstReason}` : '') +
        ignored
      if (json.success) {
        showToast(json.refusedRows || ignored ? 'info' : 'success', `Imported: ${counts}`)
      } else {
        showToast(
          'error',
          (json.error || 'Import failed') + (json.error ? '' : firstReason) +
          (landed ? ` — ${counts} before it stopped` : '')
        )
      }
      if (landed > 0 || json.success) fetchTemplates()
    } catch (e: any) {
      showToast('error', e?.message || 'Import failed')
    } finally {
      if (bulkFileRef.current) bulkFileRef.current.value = ''
    }
  }

  const handleAddNew = () => {
    setEditingTemplate(null)
    setFormData({
      template_code: '',
      template_name: '',
      tour_theme: themeItems[0]?.key || '',
      tour_type: 'day_tour',
      duration_days: 1,
      duration_nights: 0,
      duration_hours: 8,
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
      itinerary: [],
      inclusions: [],   // NEW: Reset inclusions
      exclusions: []    // NEW: Reset exclusions
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
      tour_theme: template.tour_theme || '',
      tour_type: template.tour_type,
      duration_days: template.duration_days,
      duration_nights: template.duration_nights || 0,
      duration_hours: template.duration_hours ?? 8,
      cities_covered: template.cities_covered || [],
      short_description: template.short_description || '',
      long_description: template.long_description || '',
      highlights: template.highlights || [],
      main_attractions: template.main_attractions || [],
      best_for: template.best_for || [],
      physical_level: template.physical_level || 'moderate',
      // These three were hard-coded here while every neighbour read the
      // template, so opening a tour and pressing Update silently reset them.
      age_suitability: template.age_suitability || 'all_ages',
      pickup_required: template.pickup_required ?? true,
      meals_included: template.meals_included || [],
      image_url: template.image_url || '',
      is_featured: template.is_featured,
      is_active: template.is_active,
      uses_day_builder: template.uses_day_builder ?? true,
      pricing_mode: template.pricing_mode || 'auto',
      default_transportation_service: 'day_tour',
      transportation_city: 'Cairo',
      itinerary: template.itinerary || [],
      inclusions: template.inclusions || [],   // NEW: Load inclusions
      exclusions: template.exclusions || []    // NEW: Load exclusions
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
    // A tour template's code is generated per-submit and no unique constraint
    // dedupes it, so a double-fired submit created TWO templates 1-2s apart
    // (operator, 1 Sep — confirmed in the data). The guard drops the second
    // call synchronously and disables the button while the first is in flight.
    await guard(async () => {
    const singleDay = isSingleDayTourType(formData.tour_type, singleDayKeys)
    const dataToSubmit = {
      ...formData,
      template_code: formData.template_code || generateTemplateCode(),
      // Only one duration model applies at a time: a day tour carries hours
      // (locked to 1 day / 0 nights); a multi-day tour carries days/nights and
      // no hours. Null out the other side so stale values never persist.
      duration_days: singleDay ? 1 : formData.duration_days,
      duration_nights: singleDay ? 0 : formData.duration_nights,
      duration_hours: singleDay ? (formData.duration_hours || null) : null,
      // Derived from the days, never typed: stated BY DAY, and unable to
      // disagree with the itinerary it summarises (lib/tours/day-meals.ts).
      meals_included: summarizeMeals(formData.itinerary),
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
          const variations = Array.from(newTemplateVariations).filter(tier => tierConfigs[tier]).map(tier => {
            const config = tierConfigs[tier]
            return {
              template_id: data.data.id,
              variation_name: `${formData.template_name} - ${config.label}`,
              tier: tier,
              group_type: newTemplateGroupTypes[tier] ?? config.defaults.group_type,
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
              setTimeout(async () => {
                if (await dialog.confirm({
                  title: 'Tour created',
                  message: 'Would you like to add activities and set up day-by-day pricing now? You can also do this later from the tour list.',
                  confirmText: 'Add activities',
                  cancelText: 'Later',
                  variant: 'info',
                })) {
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
    })
  }

  const handleDelete = async (id: string, name: string) => {
    if (!(await dialog.confirmDelete(name, `Delete "${name}"? This will also delete all variations and days.`))) return
    
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
    
    const matchesTheme = selectedTheme === 'all' || template.tour_theme === selectedTheme
    const matchesType = selectedType === 'all' || template.tour_type === selectedType
    const matchesActive = showInactive || template.is_active
    
    return matchesSearch && matchesTheme && matchesType && matchesActive
  })

  const activeTemplates = templates.filter(t => t.is_active).length
  const totalVariations = templates.reduce((sum, t) => sum + (t.variations?.length || 0), 0)
  const featuredCount = templates.filter(t => t.is_featured).length

  const getTierBadge = (tier: string) => {
    const config = tierConfigs[tier]
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
              <input
                ref={bulkFileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportFile(f) }}
              />
              <button onClick={handleSampleCsv} title="Download a sample CSV with the columns and one example row. Replace the Code column with your own tour code — any row still starting EXAMPLE- is skipped on import." className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                <FileText className="w-4 h-4" />
                Sample CSV
              </button>
              <button onClick={handleExportTemplates} title="Download all templates as a CSV (portable metadata: code, name, type, duration, cities, status)" className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                <Download className="w-4 h-4" />
                Export
              </button>
              <input
                ref={daysFileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportDays(f) }}
              />
              <button onClick={handleSampleDaysCsv} title="Download a sample days sheet — one row per itinerary day, keyed by Template Code. This is what Auto-Pricing reads." className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                <FileText className="w-4 h-4" />
                Sample Days
              </button>
              <button onClick={handleExportDays} title="Download every tour's day-by-day itinerary as a CSV (one row per day)" className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                <Download className="w-4 h-4" />
                Export Days
              </button>
              <button onClick={() => daysFileRef.current?.click()} title="Import a days sheet — REPLACES the whole itinerary of each tour it names; tours it does not name are untouched" className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                <Upload className="w-4 h-4" />
                Import Days
              </button>
                            <button onClick={() => bulkFileRef.current?.click()} title="Import templates from a CSV (upserts by code; itinerary and variations are untouched)" className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                <Upload className="w-4 h-4" />
                Import
              </button>
              <Link href="/tours" className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                <Eye className="w-4 h-4" />
                Browse Tours
              </Link>
              <Link href="/rates" className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                ← Rates Hub
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
              <input
                type="text"
                placeholder="Search by name, code, or city..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-3 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm"
              />
            </div>
            <div className="md:w-48 relative">
              <select
                value={selectedTheme}
                onChange={(e) => setSelectedTheme(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent shadow-sm appearance-none"
              >
                <option value="all">All Themes</option>
                {themeItems.map(theme => (
                  <option key={theme.key} value={theme.key}>{theme.label}</option>
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
                {tourTypeItems.map(type => (
                  <option key={type.key} value={type.key}>{type.label}</option>
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
                            {tourTypeLabel(template.tour_type)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm text-gray-900">
                            {formatTourDuration(template, singleDayKeys)}
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
                                        {/* The options this variation sells: optional
                                            service lines with a cost and, when set, a
                                            price (the sibling app's model, migration 320).
                                            LABELLED, not a bare icon — the operator could
                                            not find where options are authored otherwise. */}
                                        <Link
                                          href={`/tours/variations/${variation.id}/options`}
                                          className="inline-flex items-center px-2 py-1 text-xs font-semibold text-[#647C47] border border-[#b8c9a8] hover:bg-[#e8ede3] rounded transition-colors whitespace-nowrap"
                                          title="Options and upgrades this programme sells"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          Options
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
                      <span>{isSingleDayTourType(template.tour_type, singleDayKeys) && template.duration_hours
                        ? `${template.duration_hours} hours`
                        : `${template.duration_days} day${template.duration_days > 1 ? 's' : ''}`}</span>
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                        {tourTypeLabel(template.tour_type)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <MapPin className="w-4 h-4" />
                      <span>{template.cities_covered?.join(', ') || 'No cities set'}</span>
                    </div>
                    {/* Meals by day, derived LIVE from the days rather than read
                        from meals_included: that column only refreshes on save,
                        and a summary that can lag its own itinerary is a second
                        source of truth. */}
                    {(template.itinerary?.length ?? 0) > 0 && (
                      <div className="flex items-start gap-2 text-gray-600">
                        <span className="w-4 text-center flex-shrink-0">🍽️</span>
                        <span className="text-xs leading-5">
                          {summarizeMeals(template.itinerary).join(' · ') || 'No meals provided on any day'}
                        </span>
                      </div>
                    )}
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
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{formatTourDuration(template, singleDayKeys)}</span>
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
                      <label className="block text-xs font-medium text-gray-600 mb-1">Theme</label>
                      <select
                        name="tour_theme"
                        value={formData.tour_theme}
                        onChange={handleChange}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                      >
                        <option value="">Select Theme...</option>
                        {themeItems.map(theme => (
                          <option key={theme.key} value={theme.key}>{theme.label}</option>
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
                        {tourTypeItems.map(type => (
                          <option key={type.key} value={type.key}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                    {isSingleDayTourType(formData.tour_type, singleDayKeys) ? (
                      // A one-day tour is measured in HOURS, not days/nights.
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Duration (Hours) *</label>
                        <input
                          type="number"
                          name="duration_hours"
                          value={formData.duration_hours ?? ''}
                          onChange={handleChange}
                          min="1"
                          max="24"
                          required
                          placeholder="e.g. 8"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                        />
                      </div>
                    ) : (
                      <>
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
                      </>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Physical Level</label>
                      <select
                        name="physical_level"
                        value={formData.physical_level}
                        onChange={handleChange}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                      >
                        {physicalLevelItems.map(level => (
                          <option key={level.key} value={level.key}>
                            {level.description ? `${level.label} — ${level.description}` : level.label}
                          </option>
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

                  <div>
                    {/* The long description was the one imported field with no
                        editor at all: carried in form state, loaded from the
                        template and saved back, but never shown. A CSV import
                        filled it in and the tour looked as though it had
                        arrived empty. */}
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Long Description
                      <span className="ml-2 text-gray-400 font-normal">(the write-up travellers read)</span>
                    </label>
                    <textarea
                      name="long_description"
                      value={formData.long_description}
                      onChange={handleChange}
                      rows={8}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-normal"
                      placeholder="The full write-up — what the trip is, what is included, who it suits. Line breaks are kept."
                    />
                    {/* The two read alike when this field holds "Day 1 … Day 2 …",
                        which is what a CSV import produces. Prose here is not the
                        day structure, and only the structure can be priced. */}
                    <p className="mt-1 text-xs text-gray-500">
                      Prose only. Writing &ldquo;Day 1…&rdquo; here does not build the itinerary —
                      the day structure lives under <strong>Details → Day-by-Day Itinerary</strong>,
                      and that is what Auto-Pricing reads.
                    </p>
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
                    {/* Nights, meals and transport are counted from THESE days,
                        never from Duration (Nights) — so an empty structure is
                        a tour the day builder cannot price. */}
                    <p className="mb-3 text-xs text-gray-500">
                      The structured days. Nights, meals and transport are counted from here —
                      not from the Duration fields — so <strong>Auto-Pricing needs these days</strong>.
                      The narrative travellers read is the Long Description, on the Basic tab.
                    </p>
                    <ItineraryEditor
                      itinerary={formData.itinerary}
                      onChange={handleItineraryChange}
                      attractionOptions={attractions}
                      ticketOptions={ticketOptions}
                    />
                  </div>

                  {/* 4. Inclusions - What's included */}
                  <div className="border-t pt-6">
                    <label className="block text-xs font-medium text-gray-600 mb-2">
                      Inclusions
                      <span className="ml-2 text-gray-400 font-normal">(What's included in the rate)</span>
                    </label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={inclusionInput}
                        onChange={(e) => setInclusionInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addInclusion())}
                        className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg"
                        placeholder="e.g., Private air-conditioned vehicle"
                      />
                      <button type="button" onClick={addInclusion} className="px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium">
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.inclusions.map((item, i) => (
                        <span key={i} className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded text-xs border border-green-200">
                          ✓ {item}
                          <button type="button" onClick={() => removeInclusion(i)} className="text-green-500 hover:text-green-700">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      {formData.inclusions.length === 0 && (
                        <span className="text-xs text-gray-400 italic">No inclusions added yet</span>
                      )}
                    </div>
                  </div>

                  {/* 5. Exclusions - What's not included */}
                  <div className="border-t pt-6">
                    <label className="block text-xs font-medium text-gray-600 mb-2">
                      Exclusions
                      <span className="ml-2 text-gray-400 font-normal">(What's not included)</span>
                    </label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={exclusionInput}
                        onChange={(e) => setExclusionInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addExclusion())}
                        className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg"
                        placeholder="e.g., International flights"
                      />
                      <button type="button" onClick={addExclusion} className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium">
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.exclusions.map((item, i) => (
                        <span key={i} className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 rounded text-xs border border-red-200">
                          ✗ {item}
                          <button type="button" onClick={() => removeExclusion(i)} className="text-red-500 hover:text-red-700">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      {formData.exclusions.length === 0 && (
                        <span className="text-xs text-gray-400 italic">No exclusions added yet</span>
                      )}
                    </div>
                  </div>

                  {/* 6. Best For (at the end) */}
                  <div className="border-t pt-6">
                    <label className="block text-xs font-medium text-gray-600 mb-2">Best For</label>
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                      {bestForItems.map(option => (
                        <label key={option.key} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.best_for.includes(option.key)}
                            onChange={() => toggleBestFor(option.key)}
                            className="w-4 h-4 text-green-600 border-gray-300 rounded"
                          />
                          <span className="text-xs text-gray-700">{option.label}</span>
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
                    {tierEntries.map(config => [config.key, config] as const).map(([tier, config]) => (
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
                                      checked={(newTemplateGroupTypes[tier] ?? config.defaults.group_type) === 'private'}
                                      onChange={() => setNewTemplateGroupTypes(prev => ({ ...prev, [tier]: 'private' }))}
                                      className="w-4 h-4 text-green-600"
                                    />
                                    <span className="text-sm text-gray-700">🔒 Private</span>
                                  </label>
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      name={`new-group-${tier}`}
                                      checked={(newTemplateGroupTypes[tier] ?? config.defaults.group_type) === 'shared'}
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
                    disabled={submitting}
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Check className="w-4 h-4" />
                    {submitting
                      ? (editingTemplate ? 'Updating…' : 'Creating…')
                      : (editingTemplate ? 'Update Template' : 'Create Template & Variations')}
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