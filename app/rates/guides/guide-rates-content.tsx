'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Users,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Check,
  Download,
  Upload,
  Copy,
  Filter,
  Globe,
  MapPin,
  Clock,
  Calendar,
  Star,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Table2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info
} from 'lucide-react'
import { useCurrency } from '@/hooks/useCurrency'

// Egyptian cities
const EGYPT_CITIES = [
  'Alamein', 'Alexandria', 'Aswan', 'Asyut', 'Bahariya', 'Beni Suef', 'Cairo',
  'Dahab', 'Dakhla', 'Edfu', 'El Arish', 'El Balyana', 'El Gouna', 'El Quseir',
  'El Tor', 'Esna', 'Farafra', 'Fayoum', 'Giza', 'Hurghada', 'Kharga', 'Kom Ombo',
  'Luxor', 'Marsa Alam', 'Minya', 'Nuweiba', 'Qena', 'Rafah', 'Rosetta (Rashid)',
  'Safaga', 'Saint Catherine', 'Sharm El Sheikh', 'Sheikh Zuweid', 'Siwa', 'Sohag', 'Taba'
]

const LANGUAGES = [
  'English', 'Arabic', 'French', 'German', 'Spanish', 'Italian',
  'Russian', 'Chinese', 'Japanese', 'Portuguese', 'Dutch', 'Polish'
]

const GUIDE_TYPES = [
  { value: 'licensed', label: 'Licensed Guide' },
  { value: 'egyptologist', label: 'Egyptologist' },
  { value: 'local', label: 'Local Guide' },
  { value: 'specialist', label: 'Specialist' },
  { value: 'driver_guide', label: 'Driver Guide' },
  { value: 'birdwatching', label: 'Birdwatching Guide' },
  { value: 'bedouin', label: 'Bedouin Guide' }
]

const TOUR_DURATIONS = [
  { value: 'half_day', label: 'Half Day (4h)' },
  { value: 'full_day', label: 'Full Day (8h)' },
  { value: 'extended', label: 'Extended (10h+)' },
  { value: 'hourly', label: 'Hourly' }
]

interface Guide {
  id: string
  name: string
  email?: string
  phone?: string
  languages?: string[]
  city?: string
  tier?: string
  is_preferred?: boolean
}

interface GuideRate {
  id: string
  service_code: string
  guide_language: string
  guide_type: string
  city?: string
  tour_duration: string
  base_rate_eur: number
  base_rate_non_eur: number
  season?: string
  rate_valid_from?: string
  rate_valid_to?: string
  supplier_id?: string
  notes?: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

export default function GuideRatesContent() {
  const searchParams = useSearchParams()
  const initialSupplierId = searchParams.get('supplier_id') || ''

  const [rates, setRates] = useState<GuideRate[]>([])
  const [guides, setGuides] = useState<Guide[]>([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState('')
  const [selectedGuide, setSelectedGuide] = useState(initialSupplierId)
  const [selectedGuideType, setSelectedGuideType] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // UI State
  const [showModal, setShowModal] = useState(false)
  const [editingRate, setEditingRate] = useState<GuideRate | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'compact'>('table')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  // Delete Confirmation Modal
  const [deleteModal, setDeleteModal] = useState<{ show: boolean; id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Toast/Notification
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info' | 'warning'
    title: string
    message: string
  } | null>(null)

  // Currency conversion
  const { convert, symbol, userCurrency, loading: currencyLoading } = useCurrency()

  const showNotification = (type: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => {
    setNotification({ type, title, message })
    setTimeout(() => setNotification(null), 5000)
  }

  // Date helpers
  const today = new Date().toISOString().split('T')[0]
  const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Generate service code
  const generateServiceCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = 'GD-'
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

  const [formData, setFormData] = useState({
    service_code: '',
    guide_language: 'English',
    guide_type: 'licensed',
    city: '',
    tour_duration: 'full_day',
    base_rate_eur: 0,
    base_rate_non_eur: 0,
    season: '',
    rate_valid_from: today,
    rate_valid_to: nextYear,
    supplier_id: '',
    notes: '',
    is_active: true
  })

  // Fetch rates
  const fetchRates = async () => {
    try {
      const params = new URLSearchParams()
      if (!showInactive) params.append('active_only', 'true')

      const response = await fetch(`/api/rates/guides?${params}`)
      const data = await response.json()

      if (data.success) {
        setRates(data.data)
      }
    } catch (error) {
      console.error('Error fetching guide rates:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch guides (suppliers)
  const fetchGuides = async () => {
    try {
      const response = await fetch('/api/guides?active_only=true')
      const data = await response.json()

      if (data.success) {
        setGuides(data.data)
      }
    } catch (error) {
      console.error('Error fetching guides:', error)
    }
  }

  useEffect(() => {
    setMounted(true)
    fetchRates()
    fetchGuides()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedCity, selectedLanguage, selectedGuide, selectedGuideType, showInactive, itemsPerPage])

  // Handlers
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  const handleGuideChange = (guideId: string) => {
    const guide = guides.find(g => g.id === guideId)
    setFormData(prev => ({
      ...prev,
      supplier_id: guideId,
      city: guide?.city || prev.city
    }))
  }

  const handleAddNew = () => {
    setEditingRate(null)
    setFormData({
      service_code: generateServiceCode(),
      guide_language: 'English',
      guide_type: 'licensed',
      city: '',
      tour_duration: 'full_day',
      base_rate_eur: 0,
      base_rate_non_eur: 0,
      season: '',
      rate_valid_from: today,
      rate_valid_to: nextYear,
      supplier_id: selectedGuide || '',
      notes: '',
      is_active: true
    })
    setShowModal(true)
  }

  const handleEdit = (rate: GuideRate) => {
    setEditingRate(rate)
    setFormData({
      service_code: rate.service_code || '',
      guide_language: rate.guide_language || 'English',
      guide_type: rate.guide_type || 'licensed',
      city: rate.city || '',
      tour_duration: rate.tour_duration || 'full_day',
      base_rate_eur: rate.base_rate_eur || 0,
      base_rate_non_eur: rate.base_rate_non_eur || 0,
      season: rate.season || '',
      rate_valid_from: rate.rate_valid_from || today,
      rate_valid_to: rate.rate_valid_to || nextYear,
      supplier_id: rate.supplier_id || '',
      notes: rate.notes || '',
      is_active: rate.is_active
    })
    setShowModal(true)
  }

  // Clone a rate - copy all fields, clear ID/code, open modal for new entry
  const handleClone = (rate: GuideRate) => {
    setEditingRate(null) // This will be a new record
    setFormData({
      service_code: generateServiceCode(), // Generate new code
      guide_language: rate.guide_language || 'English',
      guide_type: rate.guide_type || 'licensed',
      city: rate.city || '',
      tour_duration: rate.tour_duration || 'full_day',
      base_rate_eur: rate.base_rate_eur || 0,
      base_rate_non_eur: rate.base_rate_non_eur || 0,
      season: rate.season || '',
      rate_valid_from: rate.rate_valid_from || today,
      rate_valid_to: rate.rate_valid_to || nextYear,
      supplier_id: rate.supplier_id || '',
      notes: rate.notes || '',
      is_active: rate.is_active
    })
    setShowModal(true)
  }

  // Export filtered rates to CSV
  const handleExportCSV = () => {
    if (filteredRates.length === 0) {
      showNotification('warning', 'No Data', 'No rates to export. Adjust your filters and try again.')
      return
    }

    const headers = [
      'Service Code',
      'Language',
      'Guide Type',
      'City',
      'Tour Duration',
      'EUR Rate',
      'Non-EUR Rate',
      'Season',
      'Valid From',
      'Valid To',
      'Supplier ID',
      'Notes',
      'Active'
    ]

    const rows = filteredRates.map(rate => [
      rate.service_code || '',
      rate.guide_language || '',
      rate.guide_type || '',
      rate.city || '',
      rate.tour_duration || '',
      rate.base_rate_eur?.toString() || '0',
      rate.base_rate_non_eur?.toString() || '0',
      rate.season || '',
      rate.rate_valid_from || '',
      rate.rate_valid_to || '',
      rate.supplier_id || '',
      (rate.notes || '').replace(/"/g, '""'), // Escape quotes in notes
      rate.is_active ? 'true' : 'false'
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `guide-rates-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    showNotification('success', 'Export Complete', `Exported ${filteredRates.length} guide rates to CSV.`)
  }

  // Import rates from CSV file
  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string
        const lines = text.split('\n').filter(line => line.trim())

        if (lines.length < 2) {
          showNotification('error', 'Invalid File', 'CSV file must have a header row and at least one data row.')
          return
        }

        // Parse header to get column indices
        const headerLine = lines[0]
        const headers = headerLine.split(',').map(h => h.replace(/"/g, '').trim().toLowerCase())

        const getIndex = (name: string) => headers.findIndex(h => h.includes(name))
        const serviceCodeIdx = getIndex('service code')
        const languageIdx = getIndex('language')
        const guideTypeIdx = getIndex('guide type')
        const cityIdx = getIndex('city')
        const durationIdx = getIndex('duration')
        const eurRateIdx = getIndex('eur rate')
        const nonEurRateIdx = getIndex('non-eur')
        const seasonIdx = getIndex('season')
        const validFromIdx = getIndex('valid from')
        const validToIdx = getIndex('valid to')
        const supplierIdIdx = getIndex('supplier')
        const notesIdx = getIndex('notes')
        const activeIdx = getIndex('active')

        let successCount = 0
        let errorCount = 0

        // Process each data row
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue

          // Parse CSV line (handle quoted values with commas)
          const values: string[] = []
          let current = ''
          let inQuotes = false
          for (const char of line) {
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

          const getValue = (idx: number) => idx >= 0 && idx < values.length ? values[idx].replace(/"/g, '') : ''

          const rateData = {
            service_code: getValue(serviceCodeIdx) || generateServiceCode(),
            guide_language: getValue(languageIdx) || 'English',
            guide_type: getValue(guideTypeIdx) || 'licensed',
            city: getValue(cityIdx) || '',
            tour_duration: getValue(durationIdx) || 'full_day',
            base_rate_eur: parseFloat(getValue(eurRateIdx)) || 0,
            base_rate_non_eur: parseFloat(getValue(nonEurRateIdx)) || 0,
            season: getValue(seasonIdx) || '',
            rate_valid_from: getValue(validFromIdx) || today,
            rate_valid_to: getValue(validToIdx) || nextYear,
            supplier_id: getValue(supplierIdIdx) || '',
            notes: getValue(notesIdx) || '',
            is_active: getValue(activeIdx).toLowerCase() !== 'false'
          }

          try {
            const response = await fetch('/api/rates/guides', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(rateData)
            })

            if (response.ok) {
              successCount++
            } else {
              errorCount++
            }
          } catch {
            errorCount++
          }
        }

        // Reset file input
        event.target.value = ''

        // Refresh the rates list
        fetchRates()

        if (errorCount === 0) {
          showNotification('success', 'Import Complete', `Successfully imported ${successCount} guide rates.`)
        } else {
          showNotification('warning', 'Import Partial', `Imported ${successCount} rates. ${errorCount} failed.`)
        }
      } catch (error) {
        console.error('Error parsing CSV:', error)
        showNotification('error', 'Import Failed', 'Failed to parse CSV file. Please check the format.')
        event.target.value = ''
      }
    }

    reader.readAsText(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const url = editingRate
        ? `/api/rates/guides/${editingRate.id}`
        : '/api/rates/guides'

      const method = editingRate ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        showNotification('error', 'Error', data.error || 'Failed to save rate')
        return
      }

      if (data.data) {
        showNotification('success', 'Success', editingRate ? 'Guide rate updated successfully!' : 'Guide rate created successfully!')
        setShowModal(false)
        fetchRates()
      } else {
        showNotification('error', 'Error', 'No data returned')
      }
    } catch (error) {
      console.error('Error saving rate:', error)
      showNotification('error', 'Error', 'Failed to save rate. Please try again.')
    }
  }

  // Open delete confirmation modal
  const confirmDelete = (id: string, language: string) => {
    setDeleteModal({ show: true, id, name: language })
  }

  // Actually perform delete
  const handleDelete = async () => {
    if (!deleteModal) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/rates/guides/${deleteModal.id}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        showNotification('success', 'Deleted', `"${deleteModal.name}" rate has been deleted successfully.`)
        fetchRates()
      } else {
        showNotification('error', 'Cannot Delete', data.error || 'Failed to delete rate')
      }
    } catch (error) {
      console.error('Error deleting rate:', error)
      showNotification('error', 'Error', 'Failed to delete rate. Please try again.')
    } finally {
      setIsDeleting(false)
      setDeleteModal(null)
    }
  }

  // Filter rates
  const filteredRates = rates.filter(rate => {
    const matchesSearch = searchTerm === '' ||
      rate.guide_language.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.service_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.city?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesCity = selectedCity === '' || rate.city === selectedCity
    const matchesLanguage = selectedLanguage === '' || rate.guide_language === selectedLanguage
    const matchesGuide = selectedGuide === '' || rate.supplier_id === selectedGuide
    const matchesGuideType = selectedGuideType === '' || rate.guide_type === selectedGuideType
    const matchesActive = showInactive || rate.is_active

    return matchesSearch && matchesCity && matchesLanguage && matchesGuide && matchesGuideType && matchesActive
  })

  // Pagination
  const totalPages = Math.ceil(filteredRates.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedRates = filteredRates.slice(startIndex, startIndex + itemsPerPage)

  // Stats
  const activeRates = rates.filter(r => r.is_active).length
  const linkedRates = rates.filter(r => r.supplier_id).length
  const avgRate = rates.length > 0
    ? (rates.reduce((sum, r) => sum + (r.base_rate_eur || 0), 0) / rates.filter(r => (r.base_rate_eur || 0) > 0).length || 0).toFixed(0)
    : '0'
  const uniqueCities = [...new Set(rates.map(r => r.city).filter(Boolean))].length

  // Get guide name by ID
  const getGuideName = (supplierId: string | undefined) => {
    if (!supplierId) return null
    const guide = guides.find(g => g.id === supplierId)
    return guide?.name || null
  }

  // Get notification icon
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-6 h-6 text-green-500" />
      case 'error': return <XCircle className="w-6 h-6 text-red-500" />
      case 'warning': return <AlertTriangle className="w-6 h-6 text-amber-500" />
      default: return <Info className="w-6 h-6 text-blue-500" />
    }
  }

  // Prevent hydration mismatch
  if (!mounted) {
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading guide rates...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 bg-gray-50 min-h-screen">
      
      {/* Centered Notification Modal */}
      {notification && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 transform transition-all animate-in fade-in zoom-in duration-200`}>
            <div className="flex flex-col items-center text-center">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${
                notification.type === 'success' ? 'bg-green-100' :
                notification.type === 'error' ? 'bg-red-100' :
                notification.type === 'warning' ? 'bg-amber-100' :
                'bg-blue-100'
              }`}>
                {getNotificationIcon(notification.type)}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{notification.title}</h3>
              <p className="text-sm text-gray-600 mb-4">{notification.message}</p>
              <button
                onClick={() => setNotification(null)}
                className={`px-6 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                  notification.type === 'success' ? 'bg-green-600 hover:bg-green-700' :
                  notification.type === 'error' ? 'bg-red-600 hover:bg-red-700' :
                  notification.type === 'warning' ? 'bg-amber-600 hover:bg-amber-700' :
                  'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal?.show && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 transform transition-all">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <Trash2 className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Guide Rate?</h3>
              <p className="text-sm text-gray-600 mb-1">
                Are you sure you want to delete the rate for
              </p>
              <p className="text-sm font-semibold text-gray-900 mb-4">
                "{deleteModal.name}"
              </p>
              <p className="text-xs text-gray-500 mb-6">
                This action cannot be undone. The rate will be permanently removed.
              </p>
              <div className="flex items-center gap-3 w-full">
                <button
                  onClick={() => setDeleteModal(null)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Users className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              Guide Rates
              <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
            </h1>
            <p className="text-sm text-gray-600">Manage tour guide pricing by language and type</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <label className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 cursor-pointer">
            <Upload className="w-4 h-4" />
            Import
            <input
              type="file"
              accept=".csv"
              onChange={handleImportCSV}
              className="hidden"
            />
          </label>
          <button
            onClick={handleAddNew}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Rate
          </button>
          <Link
            href="/guides"
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50"
          >
            <Users className="w-4 h-4" />
            Guides
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{rates.length}</p>
          <p className="text-xs text-gray-600">Total Rates</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Check className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{activeRates}</p>
          <p className="text-xs text-gray-600">Active</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{linkedRates}</p>
          <p className="text-xs text-gray-600">Linked to Guide</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-gray-400 font-bold">€</span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">€{avgRate}</p>
          <p className="text-xs text-gray-600">Avg. Daily Rate</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-orange-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{uniqueCities}</p>
          <p className="text-xs text-gray-600">Cities</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search rates..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
              />
            </div>
          </div>

          {/* Guide Filter */}
          <select
            value={selectedGuide}
            onChange={(e) => setSelectedGuide(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">All Guides</option>
            {guides.map(guide => (
              <option key={guide.id} value={guide.id}>{guide.name}</option>
            ))}
          </select>

          {/* Language Filter */}
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">All Languages</option>
            {LANGUAGES.map(lang => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>

          {/* City Filter */}
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">All Cities</option>
            {EGYPT_CITIES.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>

          {/* Guide Type Filter */}
          <select
            value={selectedGuideType}
            onChange={(e) => setSelectedGuideType(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">All Types</option>
            {GUIDE_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>

          {/* Active Only Toggle */}
          <button
            onClick={() => setShowInactive(!showInactive)}
            className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
              showInactive
                ? 'bg-gray-200 text-gray-700'
                : 'bg-green-100 text-green-700'
            }`}
          >
            {showInactive ? 'Show All' : 'Active Only'}
          </button>

          {/* View Mode */}
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 ${viewMode === 'table' ? 'bg-primary-100 text-primary-600' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <Table2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`p-2 ${viewMode === 'cards' ? 'bg-primary-100 text-primary-600' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('compact')}
              className={`p-2 ${viewMode === 'compact' ? 'bg-primary-100 text-primary-600' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Results Count */}
        <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
          <p className="text-xs text-gray-600">
            Showing <span className="font-semibold">{paginatedRates.length}</span> of{' '}
            <span className="font-semibold">{filteredRates.length}</span> rates
          </p>
          <select
            value={itemsPerPage}
            onChange={(e) => setItemsPerPage(Number(e.target.value))}
            className="text-xs border border-gray-300 rounded px-2 py-1"
          >
            {ITEMS_PER_PAGE_OPTIONS.map(n => (
              <option key={n} value={n}>{n} per page</option>
            ))}
          </select>
        </div>
      </div>

      {/* Rates Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {paginatedRates.length === 0 ? (
          <div className="p-12 text-center">
            <Globe className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Rates Found</h3>
            <p className="text-sm text-gray-600 mb-4">
              {searchTerm || selectedCity || selectedLanguage || selectedGuide || selectedGuideType
                ? 'Try adjusting your filters'
                : 'Get started by adding your first guide rate'}
            </p>
            <button
              onClick={handleAddNew}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              <Plus className="w-4 h-4" />
              Add First Rate
            </button>
          </div>
        ) : viewMode === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Language</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Guide</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">City</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Duration</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">{userCurrency} Rate</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">{userCurrency} Non-EU</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedRates.map((rate) => (
                  <tr key={rate.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-purple-500" />
                        <span className="text-sm font-semibold text-gray-900">{rate.guide_language}</span>
                      </div>
                      <span className="text-xs text-gray-500">{rate.service_code}</span>
                    </td>
                    <td className="px-4 py-3">
                      {rate.supplier_id ? (
                        <span className="text-sm text-purple-600 font-medium">
                          {getGuideName(rate.supplier_id)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Not linked</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                        {GUIDE_TYPES.find(t => t.value === rate.guide_type)?.label || rate.guide_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{rate.city || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">
                        {TOUR_DURATIONS.find(d => d.value === rate.tour_duration)?.label || rate.tour_duration}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-green-600">{symbol}{convert(Number(rate.base_rate_eur)).toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-gray-600">{symbol}{convert(Number(rate.base_rate_non_eur)).toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {rate.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEdit(rate)}
                          className="p-1.5 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleClone(rate)}
                          className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Clone"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => confirmDelete(rate.id, rate.guide_language)}
                          className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : viewMode === 'cards' ? (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedRates.map((rate) => (
              <div key={rate.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-purple-500" />
                    <span className="font-semibold text-gray-900">{rate.guide_language}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {rate.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {rate.supplier_id && (
                  <p className="text-sm text-purple-600 font-medium mb-2">
                    <Users className="w-3 h-3 inline mr-1" />
                    {getGuideName(rate.supplier_id)}
                  </p>
                )}

                <div className="space-y-1 text-sm text-gray-600 mb-3">
                  <p><span className="text-gray-400">Type:</span> {GUIDE_TYPES.find(t => t.value === rate.guide_type)?.label}</p>
                  <p><span className="text-gray-400">City:</span> {rate.city || '—'}</p>
                  <p><span className="text-gray-400">Duration:</span> {TOUR_DURATIONS.find(d => d.value === rate.tour_duration)?.label}</p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-gray-500">{userCurrency} Rate</p>
                    <p className="text-lg font-bold text-green-600">{symbol}{convert(Number(rate.base_rate_eur)).toFixed(2)}</p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleEdit(rate)}
                      className="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleClone(rate)}
                      className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded"
                      title="Clone"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => confirmDelete(rate.id, rate.guide_language)}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {paginatedRates.map((rate) => (
              <div key={rate.id} className="px-4 py-2 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-4">
                  <Globe className="w-4 h-4 text-purple-500" />
                  <span className="font-medium text-gray-900">{rate.guide_language}</span>
                  <span className="text-sm text-gray-500">{rate.city || '—'}</span>
                  {rate.supplier_id && (
                    <span className="text-sm text-purple-600">{getGuideName(rate.supplier_id)}</span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-green-600">{symbol}{convert(Number(rate.base_rate_eur)).toFixed(2)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {rate.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => handleEdit(rate)} className="p-1 text-gray-400 hover:text-primary-600" title="Edit">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleClone(rate)} className="p-1 text-gray-400 hover:text-blue-600" title="Clone">
                      <Copy className="w-4 h-4" />
                    </button>
                    <button onClick={() => confirmDelete(rate.id, rate.guide_language)} className="p-1 text-gray-400 hover:text-red-600" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Enhanced Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50">
            <p className="text-sm text-gray-600">
              Page <span className="font-semibold">{currentPage}</span> of <span className="font-semibold">{totalPages}</span>
              <span className="text-gray-400 ml-2">({filteredRates.length} total)</span>
            </p>
            <div className="flex items-center gap-1">
              {/* First Page */}
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                First
              </button>
              
              {/* Previous */}
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Page Numbers */}
              <div className="flex items-center gap-1">
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
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-8 h-8 text-sm rounded border ${
                        currentPage === pageNum
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'border-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  )
                })}
              </div>

              {/* Next */}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Last Page */}
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">
                {editingRate ? 'Edit Guide Rate' : 'Add Guide Rate'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 overflow-y-auto max-h-[calc(90vh-140px)]">
              {/* Basic Info */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">1</span>
                  Basic Information
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Service Code</label>
                    <input
                      type="text"
                      name="service_code"
                      value={formData.service_code}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Language *</label>
                    <select
                      name="guide_language"
                      value={formData.guide_language}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      {LANGUAGES.map(lang => (
                        <option key={lang} value={lang}>{lang}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Guide Type *</label>
                    <select
                      name="guide_type"
                      value={formData.guide_type}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      {GUIDE_TYPES.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                    <select
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      <option value="">Select City</option>
                      {EGYPT_CITIES.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Link to Guide */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">2</span>
                  Link to Guide (Optional)
                </h3>
                <select
                  name="supplier_id"
                  value={formData.supplier_id}
                  onChange={(e) => handleGuideChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                >
                  <option value="">-- Select a Guide --</option>
                  {guides.map(guide => (
                    <option key={guide.id} value={guide.id}>
                      {guide.name} {guide.city ? `(${guide.city})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Duration & Rates */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">3</span>
                  Duration & Rates
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tour Duration</label>
                    <select
                      name="tour_duration"
                      value={formData.tour_duration}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      {TOUR_DURATIONS.map(dur => (
                        <option key={dur.value} value={dur.value}>{dur.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="base_rate_eur" className="block text-xs font-medium text-gray-600 mb-1">EU Client Rate (EUR) *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">€</span>
                      <input
                        type="number"
                        id="base_rate_eur"
                        name="base_rate_eur"
                        value={formData.base_rate_eur}
                        onChange={handleChange}
                        required
                        min="0"
                        step="0.01"
                        className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="base_rate_non_eur" className="block text-xs font-medium text-gray-600 mb-1">Non-EU Client Rate (EUR)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">€</span>
                      <input
                        type="number"
                        id="base_rate_non_eur"
                        name="base_rate_non_eur"
                        value={formData.base_rate_non_eur}
                        onChange={handleChange}
                        min="0"
                        step="0.01"
                        className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Validity */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center text-xs font-bold">4</span>
                  Validity Period
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Valid From</label>
                    <input
                      type="date"
                      name="rate_valid_from"
                      value={formData.rate_valid_from}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Valid To</label>
                    <input
                      type="date"
                      name="rate_valid_to"
                      value={formData.rate_valid_to}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
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
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded"
                  />
                  <span className="text-sm font-medium text-gray-900">Active (available for bookings)</span>
                </label>
              </div>
            </form>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {editingRate ? 'Update Rate' : 'Create Rate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}