'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Ship, Plus, Search, Edit, Trash2, X, Check, ChevronDown, AlertCircle, CheckCircle2, Crown, Star,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Copy, Download, Upload
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useCurrency } from '@/hooks/useCurrency'

// ============================================
// CONSTANTS
// ============================================

const TIER_OPTIONS = [
  { value: 'budget', label: 'Budget', color: 'bg-gray-100 text-gray-700' },
  { value: 'standard', label: 'Standard', color: 'bg-blue-100 text-blue-700' },
  { value: 'deluxe', label: 'Deluxe', color: 'bg-purple-100 text-purple-700' },
  { value: 'luxury', label: 'Luxury', color: 'bg-amber-100 text-amber-700' }
]

const CITIES = ['Luxor', 'Aswan', 'Cairo', 'Abu Simbel']
const DURATION_OPTIONS = [3, 4, 7, 10, 12, 13, 14]
const SHIP_CATEGORIES = ['budget', 'standard', 'deluxe', 'luxury']
const CABIN_TYPES = ['standard', 'deluxe', 'suite']
const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

// ============================================
// INTERFACES
// ============================================

interface Supplier {
  id: string
  name: string
  type: string
  city?: string
}

interface Cruise {
  id: string
  cruise_code: string
  ship_name: string
  ship_category: 'standard' | 'deluxe' | 'luxury'
  route_name: string
  embark_city: string
  disembark_city: string
  duration_nights: number | number[]
  cabin_type: 'standard' | 'deluxe' | 'suite'
  // Legacy single-rate fields (kept for backward compatibility / display)
  rate_single_eur: number
  rate_double_eur: number
  rate_triple_eur: number | null
  // PPD Model - Low Season
  ppd_eur?: number
  ppd_non_eur?: number
  single_supplement_eur?: number
  single_supplement_non_eur?: number
  triple_reduction_eur?: number
  triple_reduction_non_eur?: number
  // Low Season dates
  low_season_start: string | null
  low_season_end: string | null
  // PPD Model - High Season
  high_season_ppd_eur?: number
  high_season_ppd_non_eur?: number
  high_season_single_supplement_eur?: number
  high_season_single_supplement_non_eur?: number
  high_season_triple_reduction_eur?: number
  high_season_triple_reduction_non_eur?: number
  // High Season dates
  high_season_start: string | null
  high_season_end: string | null
  // PPD Model - Peak Season
  peak_season_ppd_eur?: number
  peak_season_ppd_non_eur?: number
  peak_season_single_supplement_eur?: number
  peak_season_single_supplement_non_eur?: number
  peak_season_triple_reduction_eur?: number
  peak_season_triple_reduction_non_eur?: number
  // Peak Season dates
  peak_season_1_start: string | null
  peak_season_1_end: string | null
  peak_season_2_start: string | null
  peak_season_2_end: string | null
  // Rate validity
  rate_valid_from: string | null
  rate_valid_to: string | null
  // Other fields
  meals_included: string
  sightseeing_included: boolean
  description: string | null
  notes: string | null
  is_active: boolean
  tier: string | null
  is_preferred: boolean
  supplier_id: string | null
  created_at: string
}

interface Toast {
  id: string
  type: 'success' | 'error'
  message: string
}

// ============================================
// FORM DATA INTERFACE
// ============================================

interface CruiseFormData {
  cruise_code: string
  ship_name: string
  ship_category: 'standard' | 'deluxe' | 'luxury'
  route_name: string
  embark_city: string
  disembark_city: string
  duration_nights: number[]
  cabin_type: 'standard' | 'deluxe' | 'suite'
  // PPD Model - Low Season
  ppd_eur: number
  ppd_non_eur: number
  single_supplement_eur: number
  single_supplement_non_eur: number
  triple_reduction_eur: number
  triple_reduction_non_eur: number
  // Low Season dates
  low_season_start: string
  low_season_end: string
  // PPD Model - High Season
  high_season_ppd_eur: number
  high_season_ppd_non_eur: number
  high_season_single_supplement_eur: number
  high_season_single_supplement_non_eur: number
  high_season_triple_reduction_eur: number
  high_season_triple_reduction_non_eur: number
  // High Season dates
  high_season_start: string
  high_season_end: string
  // PPD Model - Peak Season
  peak_season_ppd_eur: number
  peak_season_ppd_non_eur: number
  peak_season_single_supplement_eur: number
  peak_season_single_supplement_non_eur: number
  peak_season_triple_reduction_eur: number
  peak_season_triple_reduction_non_eur: number
  // Peak Season dates
  peak_season_1_start: string
  peak_season_1_end: string
  peak_season_2_start: string
  peak_season_2_end: string
  // Rate validity
  rate_valid_from: string
  rate_valid_to: string
  // Other
  meals_included: string
  sightseeing_included: boolean
  description: string
  notes: string
  is_active: boolean
  tier: string
  is_preferred: boolean
  supplier_id: string
}

// ============================================
// COMPONENTS
// ============================================

function TierBadge({ tier }: { tier: string | null }) {
  const tierConfig = TIER_OPTIONS.find(t => t.value === tier) || TIER_OPTIONS[1]
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tierConfig.color}`}>
      {tierConfig.label}
    </span>
  )
}

// Multi-select component for duration
function DurationMultiSelect({
  value,
  onChange
}: {
  value: number[]
  onChange: (v: number[]) => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  const toggleDuration = (nights: number) => {
    if (value.includes(nights)) {
      onChange(value.filter(v => v !== nights))
    } else {
      onChange([...value, nights].sort((a, b) => a - b))
    }
  }

  return (
    <div className="relative">
      <div
        role="button"
        tabIndex={0}
        title="Select cruise durations"
        aria-label="Select cruise durations"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsOpen(!isOpen) }}
        className="w-full min-h-[40px] px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-left flex items-center justify-between gap-2 cursor-pointer hover:border-gray-400 focus:ring-2 focus:ring-blue-600"
      >
        <div className="flex-1 flex flex-wrap gap-1">
          {value.length === 0 ? (
            <span className="text-gray-400">Select durations...</span>
          ) : (
            value.map(v => (
              <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                {v}N
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onChange(value.filter(x => x !== v)) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onChange(value.filter(x => x !== v)) } }}
                  className="hover:text-blue-900 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </span>
              </span>
            ))
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {DURATION_OPTIONS.map(nights => (
              <div
                key={nights}
                role="button"
                tabIndex={0}
                onClick={() => toggleDuration(nights)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleDuration(nights) }}
                className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center justify-between cursor-pointer"
              >
                <span>{nights} Nights</span>
                {value.includes(nights) && <Check className="w-4 h-4 text-blue-600" />}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ============================================
// PAGINATION COMPONENT
// ============================================

function Pagination({
  currentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange
}: {
  currentPage: number
  totalPages: number
  totalItems: number
  startIndex: number
  endIndex: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  onItemsPerPageChange: (items: number) => void
}) {
  const goToPage = (page: number) => {
    onPageChange(Math.max(1, Math.min(page, totalPages)))
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Show</span>
          <select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            className="px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white"
          >
            {ITEMS_PER_PAGE_OPTIONS.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <span className="text-sm text-gray-500">per page</span>
        </div>
        <span className="text-sm text-gray-500">
          Showing {startIndex + 1}-{endIndex} of {totalItems} cruises
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => goToPage(1)}
          disabled={currentPage === 1}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-1 mx-2">
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number
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
                onClick={() => goToPage(pageNum)}
                className={`min-w-[32px] h-8 px-2 text-sm rounded-md transition-colors ${
                  currentPage === pageNum
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {pageNum}
              </button>
            )
          })}
        </div>

        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => goToPage(totalPages)}
          disabled={currentPage === totalPages}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ============================================
// PPD SEASONAL RATE SECTION COMPONENT
// ============================================

function PPDSeasonalRateSection({
  title,
  seasonNumber,
  startDate,
  endDate,
  startDate2,
  endDate2,
  onStartDateChange,
  onEndDateChange,
  onStartDate2Change,
  onEndDate2Change,
  rates,
  onRateChange,
  showSecondPeriod = false,
  borderColor = 'border-gray-200',
  bgColor = 'bg-white'
}: {
  title: string
  seasonNumber: number
  startDate: string
  endDate: string
  startDate2?: string
  endDate2?: string
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onStartDate2Change?: (value: string) => void
  onEndDate2Change?: (value: string) => void
  rates: {
    ppd_eur: number
    ppd_non_eur: number
    single_supplement_eur: number
    single_supplement_non_eur: number
    triple_reduction_eur: number
    triple_reduction_non_eur: number
  }
  onRateChange: (field: string, value: number) => void
  showSecondPeriod?: boolean
  borderColor?: string
  bgColor?: string
}) {
  return (
    <div className={`border ${borderColor} rounded-lg p-4 ${bgColor}`}>
      <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">
          {seasonNumber}
        </span>
        {title}
      </h4>

      {/* Date Range */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-red-600 mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-green-600 mb-1">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Second Period for Peak Season */}
      {showSecondPeriod && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-orange-600 mb-1">Period 2 From (optional)</label>
            <input
              type="date"
              value={startDate2 || ''}
              onChange={(e) => onStartDate2Change?.(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-orange-600 mb-1">Period 2 To (optional)</label>
            <input
              type="date"
              value={endDate2 || ''}
              onChange={(e) => onEndDate2Change?.(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>
      )}

      {/* PPD Explanation */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-blue-800">
          <strong>PPD Model:</strong> Enter Per Person Double rate (base rate per person sharing a cabin).
          Single = PPD + Supplement | Triple = PPD - Reduction
        </p>
      </div>

      {/* EUR Passport Rates */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-500 mb-2">EUR Passport Holders</label>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs text-blue-600 font-medium mb-1">PPD (€) *</label>
            <input
              type="number"
              value={rates.ppd_eur}
              onChange={(e) => onRateChange('ppd_eur', parseFloat(e.target.value) || 0)}
              className="w-full px-2 py-1.5 text-sm border border-blue-300 rounded-lg bg-blue-50 font-medium"
              min="0"
              step="0.01"
              placeholder="Per Person Double"
            />
          </div>
          <div>
            <label className="block text-xs text-green-600 font-medium mb-1">Single Supp (€)</label>
            <input
              type="number"
              value={rates.single_supplement_eur}
              onChange={(e) => onRateChange('single_supplement_eur', parseFloat(e.target.value) || 0)}
              className="w-full px-2 py-1.5 text-sm border border-green-300 rounded-lg"
              min="0"
              step="0.01"
              placeholder="+ for single"
            />
          </div>
          <div>
            <label className="block text-xs text-purple-600 font-medium mb-1">Triple Red (€)</label>
            <input
              type="number"
              value={rates.triple_reduction_eur}
              onChange={(e) => onRateChange('triple_reduction_eur', parseFloat(e.target.value) || 0)}
              className="w-full px-2 py-1.5 text-sm border border-purple-300 rounded-lg"
              min="0"
              step="0.01"
              placeholder="- for triple"
            />
          </div>
        </div>
        {/* Calculated rates display */}
        {rates.ppd_eur > 0 && (
          <div className="mt-2 text-xs text-gray-500 flex gap-4">
            <span>Single: €{(rates.ppd_eur + rates.single_supplement_eur).toFixed(2)}</span>
            <span>Double: €{(rates.ppd_eur * 2).toFixed(2)}</span>
            <span>Triple: €{((rates.ppd_eur - rates.triple_reduction_eur) * 3).toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Non-EUR Passport Rates */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">Non-EUR Passport Holders</label>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs text-blue-600 font-medium mb-1">PPD (€) *</label>
            <input
              type="number"
              value={rates.ppd_non_eur}
              onChange={(e) => onRateChange('ppd_non_eur', parseFloat(e.target.value) || 0)}
              className="w-full px-2 py-1.5 text-sm border border-blue-300 rounded-lg bg-blue-50 font-medium"
              min="0"
              step="0.01"
            />
          </div>
          <div>
            <label className="block text-xs text-green-600 font-medium mb-1">Single Supp (€)</label>
            <input
              type="number"
              value={rates.single_supplement_non_eur}
              onChange={(e) => onRateChange('single_supplement_non_eur', parseFloat(e.target.value) || 0)}
              className="w-full px-2 py-1.5 text-sm border border-green-300 rounded-lg"
              min="0"
              step="0.01"
            />
          </div>
          <div>
            <label className="block text-xs text-purple-600 font-medium mb-1">Triple Red (€)</label>
            <input
              type="number"
              value={rates.triple_reduction_non_eur}
              onChange={(e) => onRateChange('triple_reduction_non_eur', parseFloat(e.target.value) || 0)}
              className="w-full px-2 py-1.5 text-sm border border-purple-300 rounded-lg"
              min="0"
              step="0.01"
            />
          </div>
        </div>
        {/* Calculated rates display */}
        {rates.ppd_non_eur > 0 && (
          <div className="mt-2 text-xs text-gray-500 flex gap-4">
            <span>Single: €{(rates.ppd_non_eur + rates.single_supplement_non_eur).toFixed(2)}</span>
            <span>Double: €{(rates.ppd_non_eur * 2).toFixed(2)}</span>
            <span>Triple: €{((rates.ppd_non_eur - rates.triple_reduction_non_eur) * 3).toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function CruisesPage() {
  const dialog = useConfirmDialog()
  const { convert, symbol, userCurrency, loading: currencyLoading } = useCurrency()

  const [cruises, setCruises] = useState<Cruise[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedCabin, setSelectedCabin] = useState('all')
  const [filterTier, setFilterTier] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingCruise, setEditingCruise] = useState<Cruise | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  const getDefaultFormData = (): CruiseFormData => ({
    cruise_code: '',
    ship_name: '',
    ship_category: 'deluxe',
    route_name: '',
    embark_city: 'Luxor',
    disembark_city: 'Aswan',
    duration_nights: [4],
    cabin_type: 'standard',
    // PPD Model - Low Season
    ppd_eur: 0,
    ppd_non_eur: 0,
    single_supplement_eur: 0,
    single_supplement_non_eur: 0,
    triple_reduction_eur: 0,
    triple_reduction_non_eur: 0,
    low_season_start: '',
    low_season_end: '',
    // PPD Model - High Season
    high_season_ppd_eur: 0,
    high_season_ppd_non_eur: 0,
    high_season_single_supplement_eur: 0,
    high_season_single_supplement_non_eur: 0,
    high_season_triple_reduction_eur: 0,
    high_season_triple_reduction_non_eur: 0,
    high_season_start: '',
    high_season_end: '',
    // PPD Model - Peak Season
    peak_season_ppd_eur: 0,
    peak_season_ppd_non_eur: 0,
    peak_season_single_supplement_eur: 0,
    peak_season_single_supplement_non_eur: 0,
    peak_season_triple_reduction_eur: 0,
    peak_season_triple_reduction_non_eur: 0,
    peak_season_1_start: '',
    peak_season_1_end: '',
    peak_season_2_start: '',
    peak_season_2_end: '',
    // Rate validity
    rate_valid_from: '',
    rate_valid_to: '',
    // Other
    meals_included: 'full_board',
    sightseeing_included: false,
    description: '',
    notes: '',
    is_active: true,
    tier: 'standard',
    is_preferred: false,
    supplier_id: ''
  })

  const [formData, setFormData] = useState<CruiseFormData>(getDefaultFormData())

  const showToast = (type: 'success' | 'error', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  const fetchCruises = async () => {
    try {
      const response = await fetch('/api/rates/cruises')
      const data = await response.json()
      if (data.success) {
        setCruises(data.data)
      }
    } catch (error) {
      console.error('Error fetching cruises:', error)
      showToast('error', 'Failed to load cruises')
    } finally {
      setLoading(false)
    }
  }

  const fetchSuppliers = async () => {
    try {
      const response = await fetch('/api/suppliers?type=cruise')
      const data = await response.json()
      if (data.success) {
        setSuppliers(data.data)
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error)
    }
  }

  useEffect(() => {
    fetchCruises()
    fetchSuppliers()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedCategory, selectedCabin, filterTier, showInactive, itemsPerPage])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  const handleCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target
    setFormData(prev => ({ ...prev, [name]: checked }))
  }

  const handleSupplierChange = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId)
    setFormData(prev => ({
      ...prev,
      supplier_id: supplierId,
      ship_name: supplier?.name || prev.ship_name
    }))
  }

  const generateCode = () => {
    const ship = formData.ship_name.substring(0, 8).toUpperCase().replace(/\s+/g, '')
    const nights = formData.duration_nights.join('-')
    const cabin = formData.cabin_type.substring(0, 3).toUpperCase()
    return `CRUISE-${ship}-${nights}N-${cabin}`
  }

  const handleAddNew = () => {
    setEditingCruise(null)
    setFormData(getDefaultFormData())
    setShowModal(true)
  }

  const handleEdit = (cruise: Cruise) => {
    setEditingCruise(cruise)
    setFormData({
      cruise_code: cruise.cruise_code,
      ship_name: cruise.ship_name,
      ship_category: cruise.ship_category,
      route_name: cruise.route_name,
      embark_city: cruise.embark_city,
      disembark_city: cruise.disembark_city,
      duration_nights: Array.isArray(cruise.duration_nights) ? cruise.duration_nights : [cruise.duration_nights],
      cabin_type: cruise.cabin_type,
      // PPD Model - Low Season
      ppd_eur: cruise.ppd_eur || 0,
      ppd_non_eur: cruise.ppd_non_eur || 0,
      single_supplement_eur: cruise.single_supplement_eur || 0,
      single_supplement_non_eur: cruise.single_supplement_non_eur || 0,
      triple_reduction_eur: cruise.triple_reduction_eur || 0,
      triple_reduction_non_eur: cruise.triple_reduction_non_eur || 0,
      low_season_start: cruise.low_season_start || '',
      low_season_end: cruise.low_season_end || '',
      // PPD Model - High Season
      high_season_ppd_eur: cruise.high_season_ppd_eur || 0,
      high_season_ppd_non_eur: cruise.high_season_ppd_non_eur || 0,
      high_season_single_supplement_eur: cruise.high_season_single_supplement_eur || 0,
      high_season_single_supplement_non_eur: cruise.high_season_single_supplement_non_eur || 0,
      high_season_triple_reduction_eur: cruise.high_season_triple_reduction_eur || 0,
      high_season_triple_reduction_non_eur: cruise.high_season_triple_reduction_non_eur || 0,
      high_season_start: cruise.high_season_start || '',
      high_season_end: cruise.high_season_end || '',
      // PPD Model - Peak Season
      peak_season_ppd_eur: cruise.peak_season_ppd_eur || 0,
      peak_season_ppd_non_eur: cruise.peak_season_ppd_non_eur || 0,
      peak_season_single_supplement_eur: cruise.peak_season_single_supplement_eur || 0,
      peak_season_single_supplement_non_eur: cruise.peak_season_single_supplement_non_eur || 0,
      peak_season_triple_reduction_eur: cruise.peak_season_triple_reduction_eur || 0,
      peak_season_triple_reduction_non_eur: cruise.peak_season_triple_reduction_non_eur || 0,
      peak_season_1_start: cruise.peak_season_1_start || '',
      peak_season_1_end: cruise.peak_season_1_end || '',
      peak_season_2_start: cruise.peak_season_2_start || '',
      peak_season_2_end: cruise.peak_season_2_end || '',
      // Rate validity
      rate_valid_from: cruise.rate_valid_from || '',
      rate_valid_to: cruise.rate_valid_to || '',
      // Other
      meals_included: cruise.meals_included || 'full_board',
      sightseeing_included: cruise.sightseeing_included,
      description: cruise.description || '',
      notes: cruise.notes || '',
      is_active: cruise.is_active,
      tier: cruise.tier || 'standard',
      is_preferred: cruise.is_preferred || false,
      supplier_id: cruise.supplier_id || ''
    })
    setShowModal(true)
  }

  // Clone/Duplicate a cruise
  const handleClone = (cruise: Cruise) => {
    setEditingCruise(null) // This is a new record
    setFormData({
      cruise_code: '', // Will be auto-generated
      ship_name: cruise.ship_name,
      ship_category: cruise.ship_category,
      route_name: cruise.route_name,
      embark_city: cruise.embark_city,
      disembark_city: cruise.disembark_city,
      duration_nights: Array.isArray(cruise.duration_nights) ? cruise.duration_nights : [cruise.duration_nights],
      cabin_type: cruise.cabin_type,
      // PPD Model - Low Season
      ppd_eur: cruise.ppd_eur || 0,
      ppd_non_eur: cruise.ppd_non_eur || 0,
      single_supplement_eur: cruise.single_supplement_eur || 0,
      single_supplement_non_eur: cruise.single_supplement_non_eur || 0,
      triple_reduction_eur: cruise.triple_reduction_eur || 0,
      triple_reduction_non_eur: cruise.triple_reduction_non_eur || 0,
      low_season_start: cruise.low_season_start || '',
      low_season_end: cruise.low_season_end || '',
      // PPD Model - High Season
      high_season_ppd_eur: cruise.high_season_ppd_eur || 0,
      high_season_ppd_non_eur: cruise.high_season_ppd_non_eur || 0,
      high_season_single_supplement_eur: cruise.high_season_single_supplement_eur || 0,
      high_season_single_supplement_non_eur: cruise.high_season_single_supplement_non_eur || 0,
      high_season_triple_reduction_eur: cruise.high_season_triple_reduction_eur || 0,
      high_season_triple_reduction_non_eur: cruise.high_season_triple_reduction_non_eur || 0,
      high_season_start: cruise.high_season_start || '',
      high_season_end: cruise.high_season_end || '',
      // PPD Model - Peak Season
      peak_season_ppd_eur: cruise.peak_season_ppd_eur || 0,
      peak_season_ppd_non_eur: cruise.peak_season_ppd_non_eur || 0,
      peak_season_single_supplement_eur: cruise.peak_season_single_supplement_eur || 0,
      peak_season_single_supplement_non_eur: cruise.peak_season_single_supplement_non_eur || 0,
      peak_season_triple_reduction_eur: cruise.peak_season_triple_reduction_eur || 0,
      peak_season_triple_reduction_non_eur: cruise.peak_season_triple_reduction_non_eur || 0,
      peak_season_1_start: cruise.peak_season_1_start || '',
      peak_season_1_end: cruise.peak_season_1_end || '',
      peak_season_2_start: cruise.peak_season_2_start || '',
      peak_season_2_end: cruise.peak_season_2_end || '',
      // Rate validity
      rate_valid_from: cruise.rate_valid_from || '',
      rate_valid_to: cruise.rate_valid_to || '',
      // Other
      meals_included: cruise.meals_included || 'full_board',
      sightseeing_included: cruise.sightseeing_included,
      description: cruise.description || '',
      notes: cruise.notes || '',
      is_active: cruise.is_active,
      tier: cruise.tier || 'standard',
      is_preferred: cruise.is_preferred || false,
      supplier_id: cruise.supplier_id || ''
    })
    setShowModal(true)
    showToast('success', 'Cruise duplicated - modify and save as new')
  }

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Cruise Code', 'Ship Name', 'Ship Category', 'Embark City', 'Disembark City',
      'Duration (Nights)', 'Cabin Type', 'Tier', 'Is Preferred', 'Is Active',
      'PPD EUR', 'PPD Non-EUR', 'Single Supp EUR', 'Single Supp Non-EUR',
      'Triple Red EUR', 'Triple Red Non-EUR',
      'Low Season Start', 'Low Season End',
      'High Season PPD EUR', 'High Season PPD Non-EUR',
      'High Season Single Supp EUR', 'High Season Single Supp Non-EUR',
      'High Season Triple Red EUR', 'High Season Triple Red Non-EUR',
      'High Season Start', 'High Season End',
      'Peak Season PPD EUR', 'Peak Season PPD Non-EUR',
      'Peak Season Single Supp EUR', 'Peak Season Single Supp Non-EUR',
      'Peak Season Triple Red EUR', 'Peak Season Triple Red Non-EUR',
      'Peak Season 1 Start', 'Peak Season 1 End',
      'Peak Season 2 Start', 'Peak Season 2 End',
      'Rate Valid From', 'Rate Valid To',
      'Meals Included', 'Sightseeing Included', 'Notes'
    ]

    const rows = filteredCruises.map(c => [
      c.cruise_code,
      c.ship_name,
      c.ship_category,
      c.embark_city,
      c.disembark_city,
      Array.isArray(c.duration_nights) ? c.duration_nights.join(';') : c.duration_nights,
      c.cabin_type,
      c.tier || 'standard',
      c.is_preferred ? 'Yes' : 'No',
      c.is_active ? 'Yes' : 'No',
      c.ppd_eur || 0,
      c.ppd_non_eur || 0,
      c.single_supplement_eur || 0,
      c.single_supplement_non_eur || 0,
      c.triple_reduction_eur || 0,
      c.triple_reduction_non_eur || 0,
      c.low_season_start || '',
      c.low_season_end || '',
      c.high_season_ppd_eur || 0,
      c.high_season_ppd_non_eur || 0,
      c.high_season_single_supplement_eur || 0,
      c.high_season_single_supplement_non_eur || 0,
      c.high_season_triple_reduction_eur || 0,
      c.high_season_triple_reduction_non_eur || 0,
      c.high_season_start || '',
      c.high_season_end || '',
      c.peak_season_ppd_eur || 0,
      c.peak_season_ppd_non_eur || 0,
      c.peak_season_single_supplement_eur || 0,
      c.peak_season_single_supplement_non_eur || 0,
      c.peak_season_triple_reduction_eur || 0,
      c.peak_season_triple_reduction_non_eur || 0,
      c.peak_season_1_start || '',
      c.peak_season_1_end || '',
      c.peak_season_2_start || '',
      c.peak_season_2_end || '',
      c.rate_valid_from || '',
      c.rate_valid_to || '',
      c.meals_included || 'full_board',
      c.sightseeing_included ? 'Yes' : 'No',
      (c.notes || '').replace(/"/g, '""')
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `cruise-rates-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    showToast('success', `Exported ${filteredCruises.length} cruise rates`)
  }

  // Import from CSV
  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string
        const lines = text.split('\n').filter(line => line.trim())

        if (lines.length < 2) {
          showToast('error', 'CSV file is empty or invalid')
          return
        }

        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())
        const importedCruises: any[] = []
        let errors = 0

        for (let i = 1; i < lines.length; i++) {
          try {
            // Parse CSV line handling quoted values
            const values: string[] = []
            let current = ''
            let inQuotes = false

            for (const char of lines[i]) {
              if (char === '"') {
                inQuotes = !inQuotes
              } else if (char === ',' && !inQuotes) {
                values.push(current.trim())
                current = ''
              } else {
                current += char
              }
            }
            values.push(current.trim())

            const row: Record<string, string> = {}
            headers.forEach((h, idx) => {
              row[h] = values[idx] || ''
            })

            // Map CSV columns to database fields
            const cruiseData = {
              cruise_code: row['Cruise Code'] || '',
              ship_name: row['Ship Name'] || '',
              ship_category: row['Ship Category'] || 'deluxe',
              embark_city: row['Embark City'] || 'Luxor',
              disembark_city: row['Disembark City'] || 'Aswan',
              duration_nights: row['Duration (Nights)']?.includes(';')
                ? row['Duration (Nights)'].split(';').map(Number)
                : [parseInt(row['Duration (Nights)']) || 4],
              cabin_type: row['Cabin Type'] || 'standard',
              tier: row['Tier'] || 'standard',
              is_preferred: row['Is Preferred']?.toLowerCase() === 'yes',
              is_active: row['Is Active']?.toLowerCase() !== 'no',
              // PPD Model - Low Season
              ppd_eur: parseFloat(row['PPD EUR']) || 0,
              ppd_non_eur: parseFloat(row['PPD Non-EUR']) || 0,
              single_supplement_eur: parseFloat(row['Single Supp EUR']) || 0,
              single_supplement_non_eur: parseFloat(row['Single Supp Non-EUR']) || 0,
              triple_reduction_eur: parseFloat(row['Triple Red EUR']) || 0,
              triple_reduction_non_eur: parseFloat(row['Triple Red Non-EUR']) || 0,
              low_season_start: row['Low Season Start'] || null,
              low_season_end: row['Low Season End'] || null,
              // PPD Model - High Season
              high_season_ppd_eur: parseFloat(row['High Season PPD EUR']) || 0,
              high_season_ppd_non_eur: parseFloat(row['High Season PPD Non-EUR']) || 0,
              high_season_single_supplement_eur: parseFloat(row['High Season Single Supp EUR']) || 0,
              high_season_single_supplement_non_eur: parseFloat(row['High Season Single Supp Non-EUR']) || 0,
              high_season_triple_reduction_eur: parseFloat(row['High Season Triple Red EUR']) || 0,
              high_season_triple_reduction_non_eur: parseFloat(row['High Season Triple Red Non-EUR']) || 0,
              high_season_start: row['High Season Start'] || null,
              high_season_end: row['High Season End'] || null,
              // PPD Model - Peak Season
              peak_season_ppd_eur: parseFloat(row['Peak Season PPD EUR']) || 0,
              peak_season_ppd_non_eur: parseFloat(row['Peak Season PPD Non-EUR']) || 0,
              peak_season_single_supplement_eur: parseFloat(row['Peak Season Single Supp EUR']) || 0,
              peak_season_single_supplement_non_eur: parseFloat(row['Peak Season Single Supp Non-EUR']) || 0,
              peak_season_triple_reduction_eur: parseFloat(row['Peak Season Triple Red EUR']) || 0,
              peak_season_triple_reduction_non_eur: parseFloat(row['Peak Season Triple Red Non-EUR']) || 0,
              peak_season_1_start: row['Peak Season 1 Start'] || null,
              peak_season_1_end: row['Peak Season 1 End'] || null,
              peak_season_2_start: row['Peak Season 2 Start'] || null,
              peak_season_2_end: row['Peak Season 2 End'] || null,
              rate_valid_from: row['Rate Valid From'] || null,
              rate_valid_to: row['Rate Valid To'] || null,
              meals_included: row['Meals Included'] || 'full_board',
              sightseeing_included: row['Sightseeing Included']?.toLowerCase() === 'yes',
              notes: row['Notes'] || ''
            }

            if (cruiseData.ship_name) {
              importedCruises.push(cruiseData)
            }
          } catch (err) {
            errors++
            console.error(`Error parsing row ${i}:`, err)
          }
        }

        if (importedCruises.length === 0) {
          showToast('error', 'No valid cruise data found in CSV')
          return
        }

        // Import cruises one by one
        let successCount = 0
        for (const cruiseData of importedCruises) {
          try {
            const response = await fetch('/api/rates/cruises', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(cruiseData)
            })
            if (response.ok) {
              successCount++
            } else {
              errors++
            }
          } catch (err) {
            errors++
          }
        }

        showToast('success', `Imported ${successCount} cruises${errors > 0 ? `, ${errors} failed` : ''}`)
        fetchCruises()
      } catch (error) {
        console.error('Import error:', error)
        showToast('error', 'Failed to parse CSV file')
      }
    }
    reader.readAsText(file)

    // Reset input so same file can be imported again
    event.target.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Calculate legacy rates from PPD for backward compatibility
    const singleEur = formData.ppd_eur + formData.single_supplement_eur
    const doubleEur = formData.ppd_eur * 2
    const tripleEur = (formData.ppd_eur - formData.triple_reduction_eur) * 3

    const submitData = {
      ...formData,
      cruise_code: formData.cruise_code || generateCode(),
      route_name: formData.route_name || `${formData.embark_city} to ${formData.disembark_city}`,
      // Set legacy rates from PPD for backward compatibility
      rate_single_eur: singleEur,
      rate_double_eur: doubleEur,
      rate_triple_eur: tripleEur > 0 ? tripleEur : null,
      supplier_id: formData.supplier_id || null,
      // Convert empty date strings to null (PostgreSQL requires null, not empty strings for DATE fields)
      low_season_start: formData.low_season_start || null,
      low_season_end: formData.low_season_end || null,
      high_season_start: formData.high_season_start || null,
      high_season_end: formData.high_season_end || null,
      peak_season_1_start: formData.peak_season_1_start || null,
      peak_season_1_end: formData.peak_season_1_end || null,
      peak_season_2_start: formData.peak_season_2_start || null,
      peak_season_2_end: formData.peak_season_2_end || null,
      rate_valid_from: formData.rate_valid_from || null,
      rate_valid_to: formData.rate_valid_to || null
    }

    try {
      const url = editingCruise 
        ? `/api/rates/cruises/${editingCruise.id}`
        : '/api/rates/cruises'
      
      const response = await fetch(url, {
        method: editingCruise ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData)
      })

      const data = await response.json()
      
      if (data.success) {
        showToast('success', editingCruise ? 'Cruise updated!' : 'Cruise created!')
        setShowModal(false)
        fetchCruises()
      } else {
        showToast('error', data.error || 'Failed to save')
      }
    } catch (error) {
      showToast('error', 'Failed to save cruise')
    }
  }

  const handleDelete = async (cruise: Cruise) => {
    const confirmed = await dialog.confirmDelete('Cruise Rate',
      `Are you sure you want to delete "${cruise.ship_name}" (${cruise.cruise_code})? This action cannot be undone.`
    )
    
    if (!confirmed) return

    try {
      const response = await fetch(`/api/rates/cruises/${cruise.id}`, { method: 'DELETE' })
      const data = await response.json()
      
      if (data.success) {
        showToast('success', 'Cruise deleted!')
        fetchCruises()
      } else {
        await dialog.alert('Error', data.error || 'Failed to delete cruise', 'warning')
      }
    } catch (error) {
      await dialog.alert('Error', 'Failed to delete cruise. Please try again.', 'warning')
    }
  }

  const filteredCruises = cruises.filter(cruise => {
    const matchesSearch = searchTerm === '' ||
      cruise.ship_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cruise.cruise_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cruise.embark_city.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesCategory = selectedCategory === 'all' || cruise.ship_category === selectedCategory
    const matchesCabin = selectedCabin === 'all' || cruise.cabin_type === selectedCabin
    const matchesActive = showInactive || cruise.is_active
    const matchesTier = filterTier === null || cruise.tier === filterTier

    return matchesSearch && matchesCategory && matchesCabin && matchesActive && matchesTier
  })

  // Pagination calculations
  const totalItems = filteredCruises.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)
  const paginatedCruises = filteredCruises.slice(startIndex, endIndex)

  const stats = {
    total: cruises.length,
    active: cruises.filter(c => c.is_active).length,
    preferred: cruises.filter(c => c.is_preferred).length,
    ships: new Set(cruises.map(c => c.ship_name)).size,
    avgPPD: cruises.length > 0
      ? Math.round(cruises.reduce((sum, c) => sum + (c.ppd_eur || c.rate_double_eur || 0), 0) / cruises.length)
      : 0
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading cruises...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div key={toast.id} className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg ${
            toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ship className="w-5 h-5 text-blue-600" />
              <h1 className="text-xl font-bold text-gray-900">Nile Cruises</h1>
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddNew}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Cruise
              </button>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-green-300 text-green-700 rounded-lg hover:bg-green-50 font-medium"
                title="Export to CSV"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
              <label className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 font-medium cursor-pointer">
                <Upload className="w-4 h-4" />
                Import
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleImportCSV}
                  className="hidden"
                />
              </label>
              <Link href="/suppliers?type=cruise" className="px-3 py-1.5 text-sm border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 font-medium">
                Cruise Suppliers
              </Link>
              <Link href="/rates" className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
                ← Rates Hub
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 lg:px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">Total Rates</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">Active</p>
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <div className="flex items-center gap-1 mb-1">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            </div>
            <p className="text-xs text-gray-600">Preferred</p>
            <p className="text-2xl font-bold text-amber-600">{stats.preferred}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">Ships</p>
            <p className="text-2xl font-bold text-blue-600">{stats.ships}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">Avg. PPD Rate ({userCurrency})</p>
            <p className="text-2xl font-bold text-purple-600">{symbol}{convert(stats.avgPPD).toFixed(0)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md border p-3 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by ship, code, or city..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Categories</option>
              {SHIP_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
              ))}
            </select>
            <select
              value={selectedCabin}
              onChange={(e) => setSelectedCabin(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Cabins</option>
              {CABIN_TYPES.map(type => (
                <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
              ))}
            </select>
            <select
              value={filterTier || 'all'}
              onChange={(e) => setFilterTier(e.target.value === 'all' ? null : e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Tiers</option>
              <option value="budget">Budget</option>
              <option value="standard">Standard</option>
              <option value="deluxe">Deluxe</option>
              <option value="luxury">Luxury</option>
            </select>
            <button
              onClick={() => setShowInactive(!showInactive)}
              className={`px-3 py-2 text-sm rounded-lg font-medium ${
                showInactive ? 'bg-gray-100 text-gray-700' : 'bg-green-50 text-green-700 border border-green-200'
              }`}
            >
              {showInactive ? 'Show All' : 'Active Only'}
            </button>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Showing {filteredCruises.length} of {cruises.length} cruise rates
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-md border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-blue-50 border-b border-blue-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-blue-800">Ship / Code</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">Category</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-blue-800">Route</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">Nights</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">Cabin</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">Tier</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-blue-800">PPD ({userCurrency})</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-blue-800">Single Supp ({userCurrency})</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-blue-800">Triple Red ({userCurrency})</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">Status</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedCruises.map((cruise, idx) => (
                  <tr key={cruise.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {cruise.is_preferred && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                        <div>
                          <p className="text-sm font-medium text-gray-900">{cruise.ship_name}</p>
                          <p className="text-xs text-gray-500 font-mono">{cruise.cruise_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        cruise.ship_category === 'luxury' ? 'bg-amber-100 text-amber-800' :
                        cruise.ship_category === 'deluxe' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {cruise.ship_category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {cruise.embark_city} → {cruise.disembark_city}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-wrap gap-1 justify-center">
                        {(Array.isArray(cruise.duration_nights) ? cruise.duration_nights : [cruise.duration_nights]).map(n => (
                          <span key={n} className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                            {n}N
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        cruise.cabin_type === 'suite' ? 'bg-purple-100 text-purple-800' :
                        cruise.cabin_type === 'deluxe' ? 'bg-indigo-100 text-indigo-800' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {cruise.cabin_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <TierBadge tier={cruise.tier} />
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-blue-600">
                      {symbol}{convert(cruise.ppd_eur || cruise.rate_double_eur || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                      {cruise.single_supplement_eur ? `+${symbol}${convert(cruise.single_supplement_eur).toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-purple-600">
                      {cruise.triple_reduction_eur ? `-${symbol}${convert(cruise.triple_reduction_eur).toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        cruise.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {cruise.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => handleEdit(cruise)} className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleClone(cruise)} className="p-1 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded" title="Duplicate">
                          <Copy className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(cruise)} className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedCruises.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                      <Ship className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">No cruises found</p>
                      <button onClick={handleAddNew} className="mt-2 text-sm text-blue-600 hover:underline">
                        Add your first cruise
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalItems > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              startIndex={startIndex}
              endIndex={endIndex}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
            />
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-gray-900">
                {editingCruise ? 'Edit Cruise' : 'Add New Cruise'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-6">
              {/* Section 1: Supplier Selection */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Supplier (Cruise Company)</label>
                <select
                  value={formData.supplier_id}
                  onChange={(e) => handleSupplierChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">Select Supplier (Optional)</option>
                  {suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Link to a cruise supplier for tracking. <Link href="/suppliers?type=cruise" className="text-blue-600 hover:underline">Manage cruise suppliers →</Link>
                </p>
              </div>

              {/* Section 2: Ship Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ship Name *</label>
                  <input
                    type="text"
                    name="ship_name"
                    value={formData.ship_name}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                    placeholder="MS Sonesta St. George"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ship Category *</label>
                  <select
                    name="ship_category"
                    value={formData.ship_category}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  >
                    {SHIP_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Section 3: Route */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Embark City *</label>
                  <select
                    name="embark_city"
                    value={formData.embark_city}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  >
                    {CITIES.map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Disembark City *</label>
                  <select
                    name="disembark_city"
                    value={formData.disembark_city}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  >
                    {CITIES.map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Duration (Nights) *</label>
                  <DurationMultiSelect
                    value={formData.duration_nights}
                    onChange={(durations) => setFormData({ ...formData, duration_nights: durations })}
                  />
                  <p className="text-xs text-gray-500 mt-1">Select all applicable durations for this cruise</p>
                </div>
              </div>

              {/* Section 4: Cabin Type */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cabin Type *</label>
                <select
                  name="cabin_type"
                  value={formData.cabin_type}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                >
                  {CABIN_TYPES.map(type => (
                    <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                  ))}
                </select>
              </div>

              {/* Section 5: Service Tier & Preference */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs">2</span>
                  Service Tier
                </h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {TIER_OPTIONS.map((tier) => (
                    <button
                      key={tier.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, tier: tier.value })}
                      className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                        formData.tier === tier.value
                          ? tier.value === 'luxury' 
                            ? 'bg-amber-600 text-white'
                            : tier.value === 'deluxe'
                            ? 'bg-purple-600 text-white'
                            : tier.value === 'standard'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {tier.value === 'luxury' && <Crown className="w-3.5 h-3.5" />}
                      {tier.label}
                    </button>
                  ))}
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_preferred}
                      onChange={(e) => setFormData({ ...formData, is_preferred: e.target.checked })}
                      className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500 mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium text-amber-900 flex items-center gap-1.5">
                        <Star className="w-4 h-4 text-amber-600" />
                        Preferred Cruise
                      </span>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Preferred cruises are prioritized when AI generates itineraries within the same tier.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Section 6: Low Season Rates (PPD Model) */}
              <PPDSeasonalRateSection
                title="Low Season Rates"
                seasonNumber={3}
                startDate={formData.low_season_start}
                endDate={formData.low_season_end}
                onStartDateChange={(value) => setFormData({ ...formData, low_season_start: value })}
                onEndDateChange={(value) => setFormData({ ...formData, low_season_end: value })}
                rates={{
                  ppd_eur: formData.ppd_eur,
                  ppd_non_eur: formData.ppd_non_eur,
                  single_supplement_eur: formData.single_supplement_eur,
                  single_supplement_non_eur: formData.single_supplement_non_eur,
                  triple_reduction_eur: formData.triple_reduction_eur,
                  triple_reduction_non_eur: formData.triple_reduction_non_eur
                }}
                onRateChange={(field, value) => setFormData({ ...formData, [field]: value })}
                borderColor="border-green-200"
                bgColor="bg-green-50/30"
              />

              {/* Section 7: High Season Rates (PPD Model) */}
              <PPDSeasonalRateSection
                title="High Season Rates"
                seasonNumber={4}
                startDate={formData.high_season_start}
                endDate={formData.high_season_end}
                onStartDateChange={(value) => setFormData({ ...formData, high_season_start: value })}
                onEndDateChange={(value) => setFormData({ ...formData, high_season_end: value })}
                rates={{
                  ppd_eur: formData.high_season_ppd_eur,
                  ppd_non_eur: formData.high_season_ppd_non_eur,
                  single_supplement_eur: formData.high_season_single_supplement_eur,
                  single_supplement_non_eur: formData.high_season_single_supplement_non_eur,
                  triple_reduction_eur: formData.high_season_triple_reduction_eur,
                  triple_reduction_non_eur: formData.high_season_triple_reduction_non_eur
                }}
                onRateChange={(field, value) => setFormData({ ...formData, [`high_season_${field}`]: value })}
                borderColor="border-blue-200"
                bgColor="bg-blue-50/30"
              />

              {/* Section 8: Peak Season Rates (PPD Model) */}
              <PPDSeasonalRateSection
                title="Peak Season Rates"
                seasonNumber={5}
                startDate={formData.peak_season_1_start}
                endDate={formData.peak_season_1_end}
                startDate2={formData.peak_season_2_start}
                endDate2={formData.peak_season_2_end}
                onStartDateChange={(value) => setFormData({ ...formData, peak_season_1_start: value })}
                onEndDateChange={(value) => setFormData({ ...formData, peak_season_1_end: value })}
                onStartDate2Change={(value) => setFormData({ ...formData, peak_season_2_start: value })}
                onEndDate2Change={(value) => setFormData({ ...formData, peak_season_2_end: value })}
                rates={{
                  ppd_eur: formData.peak_season_ppd_eur,
                  ppd_non_eur: formData.peak_season_ppd_non_eur,
                  single_supplement_eur: formData.peak_season_single_supplement_eur,
                  single_supplement_non_eur: formData.peak_season_single_supplement_non_eur,
                  triple_reduction_eur: formData.peak_season_triple_reduction_eur,
                  triple_reduction_non_eur: formData.peak_season_triple_reduction_non_eur
                }}
                onRateChange={(field, value) => setFormData({ ...formData, [`peak_season_${field}`]: value })}
                showSecondPeriod={true}
                borderColor="border-orange-200"
                bgColor="bg-orange-50/30"
              />

              {/* Section 9: Rate Card Validity */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-gray-600 text-white flex items-center justify-center text-xs">6</span>
                  Rate Card Validity
                  <span className="text-xs font-normal text-gray-500">(When this rate sheet expires)</span>
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Valid From</label>
                    <input
                      type="date"
                      value={formData.rate_valid_from}
                      onChange={(e) => setFormData({ ...formData, rate_valid_from: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Valid To</label>
                    <input
                      type="date"
                      value={formData.rate_valid_to}
                      onChange={(e) => setFormData({ ...formData, rate_valid_to: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
              </div>

              {/* Section 10: Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cruise Code</label>
                  <input
                    type="text"
                    name="cruise_code"
                    value={formData.cruise_code}
                    onChange={handleChange}
                    placeholder="Auto-generated if empty"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 font-mono"
                  />
                </div>
                <div className="flex items-end gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="sightseeing_included"
                      checked={formData.sightseeing_included}
                      onChange={handleCheckbox}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-700">Sightseeing Included</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="is_active"
                      checked={formData.is_active}
                      onChange={handleCheckbox}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-700">Active</span>
                  </label>
                </div>
              </div>

              {/* Section 11: Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  placeholder="Additional information..."
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">
                  Cancel
                </button>
                <button type="submit" className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" />
                  {editingCruise ? 'Update Rate' : 'Create Rate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}