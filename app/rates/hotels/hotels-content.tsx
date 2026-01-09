'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Building2,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Check,
  Download,
  Upload,
  LayoutGrid,
  List,
  Table2,
  Star,
  Phone,
  Mail,
  MapPin,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  AlertCircle,
  CheckCircle2,
  Crown,
  ExternalLink,
  User,
  AtSign
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'

// ============================================
// EGYPTIAN CITIES - Complete List
// ============================================
const EGYPT_CITIES = [
  'Alamein',
  'Alexandria',
  'Aswan',
  'Asyut',
  'Bahariya',
  'Beni Suef',
  'Cairo',
  'Dahab',
  'Dakhla',
  'Edfu',
  'El Arish',
  'El Balyana',
  'El Gouna',
  'El Quseir',
  'El Tor',
  'Esna',
  'Farafra',
  'Fayoum',
  'Giza',
  'Hurghada',
  'Kharga',
  'Kom Ombo',
  'Luxor',
  'Marsa Alam',
  'Minya',
  'Nuweiba',
  'Qena',
  'Rafah',
  'Rosetta (Rashid)',
  'Safaga',
  'Saint Catherine',
  'Sharm El Sheikh',
  'Sheikh Zuweid',
  'Siwa',
  'Sohag',
  'Taba'
]

const TIER_OPTIONS = [
  { value: 'budget', label: 'Budget', color: 'bg-gray-100 text-gray-700' },
  { value: 'standard', label: 'Standard', color: 'bg-blue-100 text-blue-700' },
  { value: 'deluxe', label: 'Deluxe', color: 'bg-purple-100 text-purple-700' },
  { value: 'luxury', label: 'Luxury', color: 'bg-amber-100 text-amber-700' }
]

const BOARD_BASIS_OPTIONS = [
  { value: 'RO', label: 'Room Only' },
  { value: 'BB', label: 'Bed & Breakfast' },
  { value: 'HB', label: 'Half Board' },
  { value: 'FB', label: 'Full Board' },
  { value: 'AI', label: 'All Inclusive' }
]

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

// ============================================
// INTERFACES
// ============================================

interface Supplier {
  id: string
  name: string
  city?: string
  contact_phone?: string
  contact_email?: string
  star_rating?: number
  tier?: string
  is_preferred?: boolean
}

interface AccommodationRate {
  id: string
  service_code: string
  property_name: string
  property_type?: string
  city?: string
  board_basis?: string
  // Hotel contacts
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  reservations_email?: string
  reservations_phone?: string
  // Low Season / Base rates - EUR
  single_rate_eur?: number
  double_rate_eur?: number
  triple_rate_eur?: number
  suite_rate_eur?: number
  // Low Season / Base rates - Non-EUR
  single_rate_non_eur?: number
  double_rate_non_eur?: number
  triple_rate_non_eur?: number
  suite_rate_non_eur?: number
  // Low Season dates
  low_season_from?: string
  low_season_to?: string
  // High Season rates - EUR
  high_season_single_eur?: number
  high_season_double_eur?: number
  high_season_triple_eur?: number
  high_season_suite_eur?: number
  // High Season rates - Non-EUR
  high_season_single_non_eur?: number
  high_season_double_non_eur?: number
  high_season_triple_non_eur?: number
  high_season_suite_non_eur?: number
  // High Season dates
  high_season_from?: string
  high_season_to?: string
  // Peak Season rates - EUR
  peak_season_single_eur?: number
  peak_season_double_eur?: number
  peak_season_triple_eur?: number
  peak_season_suite_eur?: number
  // Peak Season rates - Non-EUR
  peak_season_single_non_eur?: number
  peak_season_double_non_eur?: number
  peak_season_triple_non_eur?: number
  peak_season_suite_non_eur?: number
  // Peak Season dates
  peak_season_from?: string
  peak_season_to?: string
  peak_season_2_from?: string
  peak_season_2_to?: string
  // Validity
  rate_valid_from?: string
  rate_valid_to?: string
  tier?: string
  supplier_name?: string
  supplier_id?: string
  supplier?: Supplier
  notes?: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

type ViewMode = 'table' | 'cards' | 'compact'

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

function TierBadge({ tier }: { tier: string | undefined }) {
  const tierConfig = TIER_OPTIONS.find(t => t.value === tier) || TIER_OPTIONS[1]
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tierConfig.color}`}>
      {tierConfig.label}
    </span>
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
            className="px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] bg-white"
          >
            {ITEMS_PER_PAGE_OPTIONS.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <span className="text-sm text-gray-500">per page</span>
        </div>
        <span className="text-sm text-gray-500">
          Showing {startIndex + 1}-{endIndex} of {totalItems} hotels
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => goToPage(1)}
          disabled={currentPage === 1}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          title="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
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
                    ? 'bg-[#647C47] text-white'
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
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => goToPage(totalPages)}
          disabled={currentPage === totalPages}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          title="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function HotelsContent() {
  const searchParams = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dialog = useConfirmDialog()
  
  const [rates, setRates] = useState<AccommodationRate[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCity, setSelectedCity] = useState('all')
  const [selectedSupplier, setSelectedSupplier] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingRate, setEditingRate] = useState<AccommodationRate | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [filterTier, setFilterTier] = useState<string | null>(null)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  const today = new Date().toISOString().split('T')[0]
  const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0]
  
  const [formData, setFormData] = useState({
    service_code: '',
    property_name: '',
    property_type: 'hotel',
    city: '',
    board_basis: 'BB',
    // Hotel contacts (NEW)
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    reservations_email: '',
    reservations_phone: '',
    // Low Season
    single_rate_eur: 0,
    double_rate_eur: 0,
    triple_rate_eur: 0,
    suite_rate_eur: 0,
    single_rate_non_eur: 0,
    double_rate_non_eur: 0,
    triple_rate_non_eur: 0,
    suite_rate_non_eur: 0,
    low_season_from: '2025-05-01',
    low_season_to: '2025-09-30',
    // High Season
    high_season_single_eur: 0,
    high_season_double_eur: 0,
    high_season_triple_eur: 0,
    high_season_suite_eur: 0,
    high_season_single_non_eur: 0,
    high_season_double_non_eur: 0,
    high_season_triple_non_eur: 0,
    high_season_suite_non_eur: 0,
    high_season_from: '2025-10-01',
    high_season_to: '2026-04-30',
    // Peak Season
    peak_season_single_eur: 0,
    peak_season_double_eur: 0,
    peak_season_triple_eur: 0,
    peak_season_suite_eur: 0,
    peak_season_single_non_eur: 0,
    peak_season_double_non_eur: 0,
    peak_season_triple_non_eur: 0,
    peak_season_suite_non_eur: 0,
    peak_season_from: '2025-12-20',
    peak_season_to: '2026-01-05',
    peak_season_2_from: '',
    peak_season_2_to: '',
    // Validity
    rate_valid_from: today,
    rate_valid_to: nextYear,
    tier: 'standard',
    supplier_id: '',
    supplier_name: '',
    notes: '',
    is_active: true
  })

  // Toast helpers
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  // Generate service code based on city
  const generateServiceCode = (city?: string) => {
    const prefix = 'ACC'
    const cityCode = city ? city.substring(0, 3).toUpperCase() : 'XXX'
    const random = Math.random().toString(36).substring(2, 5).toUpperCase()
    return `${prefix}-${cityCode}-${random}`
  }

  // Fetch rates
  const fetchRates = async () => {
    try {
      const response = await fetch('/api/resources/hotels')
      const data = await response.json()
      if (data.success) {
        setRates(data.data)
      }
    } catch (error) {
      console.error('Error fetching rates:', error)
      showToast('error', 'Failed to load accommodation rates')
    } finally {
      setLoading(false)
    }
  }

  // Fetch hotel suppliers (companies only)
  const fetchSuppliers = async () => {
    try {
      const response = await fetch('/api/suppliers?type=hotel&status=active')
      const data = await response.json()
      if (data.success) {
        setSuppliers(data.data)
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error)
    }
  }

  useEffect(() => {
    setMounted(true)
    fetchRates()
    fetchSuppliers()
  }, [])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedCity, selectedSupplier, showInactive, filterTier, itemsPerPage])

  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  // Handle supplier selection - only sets supplier info, NOT hotel name
  const handleSupplierSelect = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId)
    setFormData(prev => ({
      ...prev,
      supplier_id: supplierId,
      supplier_name: supplier?.name || ''
    }))
  }

  // Handle city change - update service code if empty
  const handleCityChange = (city: string) => {
    setFormData(prev => ({
      ...prev,
      city,
      service_code: prev.service_code || generateServiceCode(city)
    }))
  }

  // Handle checkbox
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }))
  }

  // Open modal for new rate
  const handleAddNew = () => {
    setEditingRate(null)
    setFormData({
      service_code: '',
      property_name: '',
      property_type: 'hotel',
      city: '',
      board_basis: 'BB',
      // Hotel contacts
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      reservations_email: '',
      reservations_phone: '',
      // Low Season
      single_rate_eur: 0,
      double_rate_eur: 0,
      triple_rate_eur: 0,
      suite_rate_eur: 0,
      single_rate_non_eur: 0,
      double_rate_non_eur: 0,
      triple_rate_non_eur: 0,
      suite_rate_non_eur: 0,
      low_season_from: '2025-05-01',
      low_season_to: '2025-09-30',
      // High Season
      high_season_single_eur: 0,
      high_season_double_eur: 0,
      high_season_triple_eur: 0,
      high_season_suite_eur: 0,
      high_season_single_non_eur: 0,
      high_season_double_non_eur: 0,
      high_season_triple_non_eur: 0,
      high_season_suite_non_eur: 0,
      high_season_from: '2025-10-01',
      high_season_to: '2026-04-30',
      // Peak Season
      peak_season_single_eur: 0,
      peak_season_double_eur: 0,
      peak_season_triple_eur: 0,
      peak_season_suite_eur: 0,
      peak_season_single_non_eur: 0,
      peak_season_double_non_eur: 0,
      peak_season_triple_non_eur: 0,
      peak_season_suite_non_eur: 0,
      peak_season_from: '2025-12-20',
      peak_season_to: '2026-01-05',
      peak_season_2_from: '',
      peak_season_2_to: '',
      // Validity
      rate_valid_from: today,
      rate_valid_to: nextYear,
      tier: 'standard',
      supplier_id: '',
      supplier_name: '',
      notes: '',
      is_active: true
    })
    setShowModal(true)
  }

  // Open modal for editing
  const handleEdit = (rate: AccommodationRate) => {
    setEditingRate(rate)
    
    // Try to find matching supplier by name if supplier_id not set
    let supplierId = rate.supplier_id || ''
    if (!supplierId && rate.supplier_name) {
      const matchingSupplier = suppliers.find(s => 
        s.name.toLowerCase() === rate.supplier_name?.toLowerCase()
      )
      if (matchingSupplier) {
        supplierId = matchingSupplier.id
      }
    }
    
    setFormData({
      service_code: rate.service_code || '',
      property_name: rate.property_name || '',
      property_type: rate.property_type || 'hotel',
      city: rate.city || '',
      board_basis: rate.board_basis || 'BB',
      // Hotel contacts
      contact_name: rate.contact_name || '',
      contact_email: rate.contact_email || '',
      contact_phone: rate.contact_phone || '',
      reservations_email: rate.reservations_email || '',
      reservations_phone: rate.reservations_phone || '',
      // Low Season
      single_rate_eur: rate.single_rate_eur || 0,
      double_rate_eur: rate.double_rate_eur || 0,
      triple_rate_eur: rate.triple_rate_eur || 0,
      suite_rate_eur: rate.suite_rate_eur || 0,
      single_rate_non_eur: rate.single_rate_non_eur || 0,
      double_rate_non_eur: rate.double_rate_non_eur || 0,
      triple_rate_non_eur: rate.triple_rate_non_eur || 0,
      suite_rate_non_eur: rate.suite_rate_non_eur || 0,
      low_season_from: rate.low_season_from || '2025-05-01',
      low_season_to: rate.low_season_to || '2025-09-30',
      // High Season
      high_season_single_eur: rate.high_season_single_eur || 0,
      high_season_double_eur: rate.high_season_double_eur || 0,
      high_season_triple_eur: rate.high_season_triple_eur || 0,
      high_season_suite_eur: rate.high_season_suite_eur || 0,
      high_season_single_non_eur: rate.high_season_single_non_eur || 0,
      high_season_double_non_eur: rate.high_season_double_non_eur || 0,
      high_season_triple_non_eur: rate.high_season_triple_non_eur || 0,
      high_season_suite_non_eur: rate.high_season_suite_non_eur || 0,
      high_season_from: rate.high_season_from || '2025-10-01',
      high_season_to: rate.high_season_to || '2026-04-30',
      // Peak Season
      peak_season_single_eur: rate.peak_season_single_eur || 0,
      peak_season_double_eur: rate.peak_season_double_eur || 0,
      peak_season_triple_eur: rate.peak_season_triple_eur || 0,
      peak_season_suite_eur: rate.peak_season_suite_eur || 0,
      peak_season_single_non_eur: rate.peak_season_single_non_eur || 0,
      peak_season_double_non_eur: rate.peak_season_double_non_eur || 0,
      peak_season_triple_non_eur: rate.peak_season_triple_non_eur || 0,
      peak_season_suite_non_eur: rate.peak_season_suite_non_eur || 0,
      peak_season_from: rate.peak_season_from || '2025-12-20',
      peak_season_to: rate.peak_season_to || '2026-01-05',
      peak_season_2_from: rate.peak_season_2_from || '',
      peak_season_2_to: rate.peak_season_2_to || '',
      // Validity
      rate_valid_from: rate.rate_valid_from || today,
      rate_valid_to: rate.rate_valid_to || nextYear,
      tier: rate.tier || 'standard',
      supplier_id: supplierId,
      supplier_name: rate.supplier_name || rate.supplier?.name || '',
      notes: rate.notes || '',
      is_active: rate.is_active
    })
    setShowModal(true)
  }

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Generate service code if empty
    const dataToSubmit = {
      ...formData,
      service_code: formData.service_code || generateServiceCode(formData.city)
    }
    
    try {
      const url = editingRate 
        ? `/api/resources/hotels/${editingRate.id}`
        : '/api/resources/hotels'
      
      const method = editingRate ? 'PUT' : 'POST'
      
      console.log('Submitting form data:', dataToSubmit)
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSubmit)
      })
      
      const data = await response.json()
      console.log('API response:', data)
      
      if (!response.ok || !data.success) {
        const errorMsg = data.error || data.hint || `HTTP error ${response.status}`
        console.error('API error:', data)
        showToast('error', errorMsg)
        return
      }
      
      if (data.data) {
        showToast('success', editingRate ? `${formData.property_name} updated!` : `${formData.property_name} created!`)
        setShowModal(false)
        fetchRates()
      } else {
        showToast('error', 'No data returned from server. Check console for details.')
        console.error('No data in response:', data)
      }
    } catch (error) {
      console.error('Error saving rate:', error)
      showToast('error', 'Failed to save accommodation rate')
    }
  }

  // Delete rate
  const handleDelete = async (id: string, name: string) => {
    const confirmed = await dialog.confirmDelete('Hotel', 
      `Are you sure you want to delete "${name}"? This action cannot be undone.`
    )
    
    if (!confirmed) return
    
    try {
      const response = await fetch(`/api/resources/hotels/${id}`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (data.success) {
        showToast('success', `${name} deleted!`)
        fetchRates()
      } else {
        await dialog.alert('Error', data.error || 'Failed to delete', 'warning')
      }
    } catch (error) {
      console.error('Error deleting rate:', error)
      await dialog.alert('Error', 'Failed to delete. Please try again.', 'warning')
    }
  }

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Service Code', 'Hotel Name', 'City', 'Board Basis', 'Tier',
      'Contact Name', 'Contact Email', 'Contact Phone', 'Reservations Email', 'Reservations Phone',
      'Low Single EUR', 'Low Double EUR', 'Low Triple EUR', 'Low Suite EUR',
      'High Single EUR', 'High Double EUR', 'High Triple EUR', 'High Suite EUR',
      'Peak Single EUR', 'Peak Double EUR', 'Peak Triple EUR', 'Peak Suite EUR',
      'Valid From', 'Valid To', 'Company/Supplier', 'Active'
    ]
    
    const rows = filteredRates.map(r => [
      r.service_code,
      r.property_name,
      r.city || '',
      r.board_basis || '',
      r.tier || '',
      r.contact_name || '',
      r.contact_email || '',
      r.contact_phone || '',
      r.reservations_email || '',
      r.reservations_phone || '',
      r.single_rate_eur || '',
      r.double_rate_eur || '',
      r.triple_rate_eur || '',
      r.suite_rate_eur || '',
      r.high_season_single_eur || '',
      r.high_season_double_eur || '',
      r.high_season_triple_eur || '',
      r.high_season_suite_eur || '',
      r.peak_season_single_eur || '',
      r.peak_season_double_eur || '',
      r.peak_season_triple_eur || '',
      r.peak_season_suite_eur || '',
      r.rate_valid_from || '',
      r.rate_valid_to || '',
      r.supplier?.name || r.supplier_name || '',
      r.is_active ? 'Yes' : 'No'
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `hotels_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    
    showToast('success', `Exported ${filteredRates.length} hotels to CSV`)
  }

  // Filter rates
  const filteredRates = rates.filter(rate => {
    const matchesSearch = searchTerm === '' || 
      rate.property_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.service_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.supplier?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.contact_name?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesCity = selectedCity === 'all' || rate.city === selectedCity
    const matchesSupplier = selectedSupplier === 'all' || rate.supplier_id === selectedSupplier
    const matchesActive = showInactive || rate.is_active
    const matchesTier = filterTier === null || rate.tier === filterTier
  
    return matchesSearch && matchesCity && matchesSupplier && matchesActive && matchesTier
  })

  // Pagination calculations
  const totalItems = filteredRates.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)
  const paginatedRates = filteredRates.slice(startIndex, endIndex)

  // Get unique cities from data
  const usedCities = Array.from(new Set(rates.map(r => r.city).filter(Boolean))).sort()

  // Stats
  const activeRates = rates.filter(r => r.is_active).length
  const linkedRates = rates.filter(r => r.supplier_id).length
  const avgRate = rates.length > 0 
    ? (rates.reduce((sum, r) => sum + (r.double_rate_eur || 0), 0) / rates.filter(r => (r.double_rate_eur || 0) > 0).length || 0).toFixed(0)
    : '0'

  // Prevent hydration mismatch
  if (!mounted) {
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading hotels...</p>
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
              <Building2 className="w-5 h-5 text-purple-600" />
              <h1 className="text-xl font-bold text-gray-900">Hotels & Accommodation</h1>
              <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/suppliers?type=hotel"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                <Building2 className="w-4 h-4" />
                Hotel Companies
              </Link>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
              <button
                onClick={handleAddNew}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Hotel
              </button>
              <Link 
                href="/rates"
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                ← Rates
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 lg:px-6 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
            </div>
            <p className="text-xs text-gray-600">Total Hotels</p>
            <p className="text-2xl font-bold text-gray-900">{rates.length}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
            </div>
            <p className="text-xs text-gray-600">Active</p>
            <p className="text-2xl font-bold text-gray-900">{activeRates}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            </div>
            <p className="text-xs text-gray-600">Linked to Company</p>
            <p className="text-2xl font-bold text-gray-900">{linkedRates}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400">💶</span>
              <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
            </div>
            <p className="text-xs text-gray-600">Avg. Double (Low)</p>
            <p className="text-2xl font-bold text-gray-900">€{avgRate}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-orange-600" />
            </div>
            <p className="text-xs text-gray-600">Cities</p>
            <p className="text-2xl font-bold text-gray-900">{usedCities.length}</p>
          </div>
        </div>

        {/* Search, Filters & View Toggle */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-3 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by hotel name, code, company, or contact..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              />
            </div>
            
            {/* City Filter */}
            <div className="md:w-40 relative">
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm appearance-none"
              >
                <option value="all">All Cities</option>
                {usedCities.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* Supplier/Company Filter */}
            <div className="md:w-48 relative">
              <select
                value={selectedSupplier}
                onChange={(e) => setSelectedSupplier(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm appearance-none"
              >
                <option value="all">All Companies</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* Tier Filter */}
            <div className="relative">
              <select
                value={filterTier || 'all'}
                onChange={(e) => setFilterTier(e.target.value === 'all' ? null : e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm appearance-none pr-8"
              >
                <option value="all">All Tiers</option>
                {TIER_OPTIONS.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <Crown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
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
            
            {/* View Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-white shadow text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Table View"
              >
                <Table2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded ${viewMode === 'cards' ? 'bg-white shadow text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Card View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('compact')}
                className={`p-1.5 rounded ${viewMode === 'compact' ? 'bg-white shadow text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Compact View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-600">
              Showing <span className="font-bold text-gray-900">{filteredRates.length}</span> of {rates.length} hotels
            </p>
          </div>
        </div>

        {/* TABLE VIEW */}
        {viewMode === 'table' && (
          <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Hotel</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Company</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Tier</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">City</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Board</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Low Dbl</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">High Dbl</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedRates.map((rate, index) => (
                    <tr key={rate.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{rate.property_name}</p>
                          <p className="text-xs text-gray-500 font-mono">{rate.service_code}</p>
                          {rate.contact_name && (
                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                              <User className="w-3 h-3" /> {rate.contact_name}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {(rate.supplier?.name || rate.supplier_name) ? (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-sm text-gray-700">{rate.supplier?.name || rate.supplier_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <TierBadge tier={rate.tier} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {rate.city || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                          {rate.board_basis || 'BB'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-green-600">
                          €{(rate.double_rate_eur || 0).toFixed(0)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-orange-600">
                          €{(rate.high_season_double_eur || 0).toFixed(0)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          rate.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {rate.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEdit(rate)}
                            className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(rate.id, rate.property_name)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedRates.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm font-medium">No hotels found</p>
                        <button
                          onClick={handleAddNew}
                          className="mt-3 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                        >
                          Add Your First Hotel
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
        )}

        {/* CARD VIEW */}
        {viewMode === 'cards' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedRates.map((rate) => (
                <div key={rate.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">{rate.property_name}</h3>
                        <p className="text-xs text-gray-500 font-mono">{rate.service_code}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        rate.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {rate.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2 mb-3">
                      <TierBadge tier={rate.tier} />
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                        {rate.board_basis || 'BB'}
                      </span>
                      {rate.city && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                          {rate.city}
                        </span>
                      )}
                    </div>

                    {(rate.supplier?.name || rate.supplier_name) && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                        <Building2 className="w-4 h-4" />
                        <span>{rate.supplier?.name || rate.supplier_name}</span>
                      </div>
                    )}

                    {rate.contact_name && (
                      <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                        <User className="w-4 h-4" />
                        <span>{rate.contact_name}</span>
                        {rate.contact_email && (
                          <a href={`mailto:${rate.contact_email}`} className="text-primary-600 hover:underline">
                            <Mail className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {rate.contact_phone && (
                          <a href={`tel:${rate.contact_phone}`} className="text-primary-600 hover:underline">
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
                      <div className="text-center">
                        <p className="text-xs text-blue-600 font-medium">Low</p>
                        <p className="text-sm font-bold text-gray-700">€{(rate.double_rate_eur || 0).toFixed(0)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-orange-600 font-medium">High</p>
                        <p className="text-sm font-bold text-gray-700">€{(rate.high_season_double_eur || 0).toFixed(0)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-red-600 font-medium">Peak</p>
                        <p className="text-sm font-bold text-gray-700">€{(rate.peak_season_double_eur || 0).toFixed(0)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex border-t border-gray-200 divide-x divide-gray-200">
                    <button
                      onClick={() => handleEdit(rate)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(rate.id, rate.property_name)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            {totalItems > 0 && (
              <div className="mt-4 bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
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
              </div>
            )}
          </>
        )}

        {/* COMPACT VIEW */}
        {viewMode === 'compact' && (
          <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-100">
              {paginatedRates.map((rate) => (
                <div key={rate.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rate.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-sm font-medium text-gray-900 truncate">{rate.property_name}</span>
                    <TierBadge tier={rate.tier} />
                    {rate.city && (
                      <span className="hidden md:inline px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{rate.city}</span>
                    )}
                    {(rate.supplier?.name || rate.supplier_name) && (
                      <span className="hidden lg:flex items-center gap-1 text-xs text-gray-500">
                        <Building2 className="w-3 h-3" />
                        {rate.supplier?.name || rate.supplier_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-green-600">€{(rate.double_rate_eur || 0).toFixed(0)}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(rate)}
                        className="p-1 text-gray-400 hover:text-primary-600 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(rate.id, rate.property_name)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
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
        )}
      </div>

      {/* ADD/EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-gray-900">
                {editingRate ? 'Edit Hotel' : 'Add New Hotel'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4">
              {/* SECTION 1: Hotel Information */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">1</span>
                  Hotel Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Hotel Name *</label>
                    <input
                      type="text"
                      name="property_name"
                      value={formData.property_name}
                      onChange={handleChange}
                      required
                      placeholder="e.g., Hilton Cairo Heliopolis"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Service Code</label>
                    <input
                      type="text"
                      name="service_code"
                      value={formData.service_code}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm bg-gray-50"
                      placeholder="Auto-generated"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Company / Supplier</label>
                    <select
                      value={formData.supplier_id}
                      onChange={(e) => handleSupplierSelect(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    >
                      <option value="">Select company (optional)...</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      <Link href="/suppliers?type=hotel" className="text-primary-600 hover:underline flex items-center gap-1 inline">
                        <Plus className="w-3 h-3" /> Add new company
                      </Link>
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">City *</label>
                    <select
                      name="city"
                      value={formData.city}
                      onChange={(e) => handleCityChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    >
                      <option value="">Select City...</option>
                      {EGYPT_CITIES.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Property Type *</label>
                    <select
                      name="property_type"
                      value={formData.property_type}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    >
                      <option value="hotel">🏨 Hotel</option>
                      <option value="resort">🏖️ Resort</option>
                      <option value="apartment">🏢 Apartment</option>
                      <option value="guesthouse">🏠 Guesthouse</option>
                      <option value="cruise">🚢 Cruise</option>
                      <option value="camp">⛺ Camp</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Board Basis</label>
                    <select
                      name="board_basis"
                      value={formData.board_basis}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    >
                      {BOARD_BASIS_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Hotel Contacts (NEW) */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">2</span>
                  Hotel Contacts
                </h3>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        <User className="w-3 h-3 inline mr-1" />
                        Sales Contact Name
                      </label>
                      <input
                        type="text"
                        name="contact_name"
                        value={formData.contact_name}
                        onChange={handleChange}
                        placeholder="e.g., Ahmed Hassan"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        <Mail className="w-3 h-3 inline mr-1" />
                        Sales Email
                      </label>
                      <input
                        type="email"
                        name="contact_email"
                        value={formData.contact_email}
                        onChange={handleChange}
                        placeholder="sales@hotel.com"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        <Phone className="w-3 h-3 inline mr-1" />
                        Sales Phone
                      </label>
                      <input
                        type="tel"
                        name="contact_phone"
                        value={formData.contact_phone}
                        onChange={handleChange}
                        placeholder="+20 xxx xxx xxxx"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        <AtSign className="w-3 h-3 inline mr-1" />
                        Reservations Email
                      </label>
                      <input
                        type="email"
                        name="reservations_email"
                        value={formData.reservations_email}
                        onChange={handleChange}
                        placeholder="reservations@hotel.com"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        <Phone className="w-3 h-3 inline mr-1" />
                        Reservations Phone
                      </label>
                      <input
                        type="tel"
                        name="reservations_phone"
                        value={formData.reservations_phone}
                        onChange={handleChange}
                        placeholder="+20 xxx xxx xxxx"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Service Tier */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold">3</span>
                  Service Tier
                </h3>
                <div className="flex flex-wrap gap-2">
                  {TIER_OPTIONS.map((tier) => (
                    <button
                      key={tier.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, tier: tier.value })}
                      className={`px-4 py-2 text-sm rounded-lg border-2 font-medium transition-all ${
                        formData.tier === tier.value
                          ? tier.value === 'budget'
                            ? 'border-gray-600 bg-gray-100 text-gray-800'
                            : tier.value === 'standard'
                            ? 'border-blue-600 bg-blue-50 text-blue-800'
                            : tier.value === 'deluxe'
                            ? 'border-purple-600 bg-purple-50 text-purple-800'
                            : 'border-amber-600 bg-amber-50 text-amber-800'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      {tier.value === 'luxury' && <Crown className="w-3.5 h-3.5 inline mr-1" />}
                      {tier.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* SECTION 4: Low Season Rates */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">4</span>
                  Low Season Rates
                </h3>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  {/* Date Range */}
                  <div className="grid grid-cols-2 gap-3 mb-4 pb-3 border-b border-blue-200">
                    <div>
                      <label className="block text-xs font-medium text-blue-700 mb-1">From</label>
                      <input type="date" name="low_season_from" value={formData.low_season_from} onChange={handleChange}
                        className="w-full px-3 py-2 text-sm border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-blue-700 mb-1">To</label>
                      <input type="date" name="low_season_to" value={formData.low_season_to} onChange={handleChange}
                        className="w-full px-3 py-2 text-sm border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" />
                    </div>
                  </div>
                  <p className="text-xs font-medium text-gray-600 mb-2">EUR Passport Holders</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Single (€)</label>
                      <input type="number" name="single_rate_eur" value={formData.single_rate_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Double (€)</label>
                      <input type="number" name="double_rate_eur" value={formData.double_rate_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Triple (€)</label>
                      <input type="number" name="triple_rate_eur" value={formData.triple_rate_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Suite (€)</label>
                      <input type="number" name="suite_rate_eur" value={formData.suite_rate_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                  </div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Non-EUR Passport Holders</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Single (€)</label>
                      <input type="number" name="single_rate_non_eur" value={formData.single_rate_non_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Double (€)</label>
                      <input type="number" name="double_rate_non_eur" value={formData.double_rate_non_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Triple (€)</label>
                      <input type="number" name="triple_rate_non_eur" value={formData.triple_rate_non_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Suite (€)</label>
                      <input type="number" name="suite_rate_non_eur" value={formData.suite_rate_non_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 5: High Season Rates */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">5</span>
                  High Season Rates
                </h3>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  {/* Date Range */}
                  <div className="grid grid-cols-2 gap-3 mb-4 pb-3 border-b border-orange-200">
                    <div>
                      <label className="block text-xs font-medium text-orange-700 mb-1">From</label>
                      <input type="date" name="high_season_from" value={formData.high_season_from} onChange={handleChange}
                        className="w-full px-3 py-2 text-sm border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-orange-700 mb-1">To</label>
                      <input type="date" name="high_season_to" value={formData.high_season_to} onChange={handleChange}
                        className="w-full px-3 py-2 text-sm border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white" />
                    </div>
                  </div>
                  <p className="text-xs font-medium text-gray-600 mb-2">EUR Passport Holders</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Single (€)</label>
                      <input type="number" name="high_season_single_eur" value={formData.high_season_single_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Double (€)</label>
                      <input type="number" name="high_season_double_eur" value={formData.high_season_double_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Triple (€)</label>
                      <input type="number" name="high_season_triple_eur" value={formData.high_season_triple_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Suite (€)</label>
                      <input type="number" name="high_season_suite_eur" value={formData.high_season_suite_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                  </div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Non-EUR Passport Holders</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Single (€)</label>
                      <input type="number" name="high_season_single_non_eur" value={formData.high_season_single_non_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Double (€)</label>
                      <input type="number" name="high_season_double_non_eur" value={formData.high_season_double_non_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Triple (€)</label>
                      <input type="number" name="high_season_triple_non_eur" value={formData.high_season_triple_non_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Suite (€)</label>
                      <input type="number" name="high_season_suite_non_eur" value={formData.high_season_suite_non_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 6: Peak Season Rates */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">6</span>
                  Peak Season Rates
                </h3>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  {/* Date Ranges - Primary and Secondary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 pb-3 border-b border-red-200">
                    <div>
                      <label className="block text-xs font-medium text-red-700 mb-1">Period 1 From</label>
                      <input type="date" name="peak_season_from" value={formData.peak_season_from} onChange={handleChange}
                        className="w-full px-3 py-2 text-sm border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-red-700 mb-1">Period 1 To</label>
                      <input type="date" name="peak_season_to" value={formData.peak_season_to} onChange={handleChange}
                        className="w-full px-3 py-2 text-sm border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-red-700 mb-1">Period 2 From <span className="text-gray-400">(optional)</span></label>
                      <input type="date" name="peak_season_2_from" value={formData.peak_season_2_from} onChange={handleChange}
                        className="w-full px-3 py-2 text-sm border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-red-700 mb-1">Period 2 To <span className="text-gray-400">(optional)</span></label>
                      <input type="date" name="peak_season_2_to" value={formData.peak_season_2_to} onChange={handleChange}
                        className="w-full px-3 py-2 text-sm border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white" />
                    </div>
                  </div>
                  <p className="text-xs font-medium text-gray-600 mb-2">EUR Passport Holders</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Single (€)</label>
                      <input type="number" name="peak_season_single_eur" value={formData.peak_season_single_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Double (€)</label>
                      <input type="number" name="peak_season_double_eur" value={formData.peak_season_double_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Triple (€)</label>
                      <input type="number" name="peak_season_triple_eur" value={formData.peak_season_triple_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Suite (€)</label>
                      <input type="number" name="peak_season_suite_eur" value={formData.peak_season_suite_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                  </div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Non-EUR Passport Holders</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Single (€)</label>
                      <input type="number" name="peak_season_single_non_eur" value={formData.peak_season_single_non_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Double (€)</label>
                      <input type="number" name="peak_season_double_non_eur" value={formData.peak_season_double_non_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Triple (€)</label>
                      <input type="number" name="peak_season_triple_non_eur" value={formData.peak_season_triple_non_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Suite (€)</label>
                      <input type="number" name="peak_season_suite_non_eur" value={formData.peak_season_suite_non_eur} onChange={handleChange} step="0.01" min="0"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent" placeholder="0" />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 7: Rate Card Validity */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center text-xs font-bold">7</span>
                  Rate Card Validity
                  <span className="text-xs font-normal text-gray-500 ml-2">(When this rate sheet expires)</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Valid From</label>
                    <input
                      type="date"
                      name="rate_valid_from"
                      value={formData.rate_valid_from}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Valid To</label>
                    <input
                      type="date"
                      name="rate_valid_to"
                      value={formData.rate_valid_to}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Notes & Status */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  placeholder="Additional information..."
                />
              </div>

              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={formData.is_active}
                    onChange={handleCheckboxChange}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Active (available for bookings)</span>
                </label>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {editingRate ? 'Update Hotel' : 'Create Hotel'}
                </button>
              </div>
            </form>
          </div>
        </div>
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