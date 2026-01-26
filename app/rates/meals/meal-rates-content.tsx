'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Utensils,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Check,
  Download,
  Upload,
  Copy,
  MapPin,
  Users,
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
  'El Tor', 'Esna', 'Farafra', 'Fayoum', 'Giza', 'Hurghada', 'Ismailia', 'Kharga',
  'Kom Ombo', 'Luxor', 'Marsa Alam', 'Minya', 'Nuweiba', 'Port Said', 'Qena',
  'Rafah', 'Rosetta (Rashid)', 'Safaga', 'Saint Catherine', 'Sharm El Sheikh',
  'Sheikh Zuweid', 'Siwa', 'Sohag', 'Suez', 'Taba'
]

const MEAL_TYPES = [
  'Breakfast',
  'Lunch',
  'Dinner',
  'Brunch',
  'Snack',
  'Full Board',
  'Half Board'
]

const CUISINE_TYPES = [
  'Egyptian',
  'Mediterranean',
  'Italian',
  'Middle Eastern',
  'Asian',
  'International',
  'Seafood',
  'Lebanese',
  'Turkish',
  'Indian',
  'Korean',
  'Chinese',
  'Japanese',
  'French'
]

const RESTAURANT_TYPES = [
  'Fine Dining',
  'Casual Dining',
  'Buffet',
  'Local Restaurant',
  'Hotel Restaurant',
  'Cruise Restaurant',
  'Street Food',
  'Café'
]

const DIETARY_OPTIONS = [
  'Vegetarian',
  'Vegan',
  'Halal',
  'Gluten-Free',
  'Dairy-Free',
  'Nut-Free',
  'Kosher'
]

const TIERS = [
  { value: 'budget', label: 'Budget', color: 'bg-gray-100 text-gray-700' },
  { value: 'standard', label: 'Standard', color: 'bg-blue-100 text-blue-700' },
  { value: 'deluxe', label: 'Deluxe', color: 'bg-purple-100 text-purple-700' },
  { value: 'luxury', label: 'Luxury', color: 'bg-amber-100 text-amber-700' }
]

interface Supplier {
  id: string
  name: string
  type: string
  city?: string
}

interface MealRate {
  id: string
  service_code: string
  restaurant_name: string
  meal_type?: string
  cuisine_type?: string
  restaurant_type?: string
  city?: string
  base_rate_eur: number
  base_rate_non_eur: number
  season?: string
  rate_valid_from?: string
  rate_valid_to?: string
  supplier_id?: string
  supplier_name?: string
  tier?: string
  meal_category?: string
  dietary_options?: string[]
  per_person_rate?: boolean
  minimum_pax?: number
  notes?: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

export default function MealRatesContent() {
  const searchParams = useSearchParams()
  const initialSupplierId = searchParams.get('supplier_id') || ''

  const [rates, setRates] = useState<MealRate[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  const { convert, symbol, userCurrency, loading: currencyLoading } = useCurrency()

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedMealType, setSelectedMealType] = useState('')
  const [selectedCuisine, setSelectedCuisine] = useState('')
  const [selectedTier, setSelectedTier] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState(initialSupplierId)
  const [showInactive, setShowInactive] = useState(false)

  // UI State
  const [showModal, setShowModal] = useState(false)
  const [editingRate, setEditingRate] = useState<MealRate | null>(null)
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
    let code = 'MEAL-'
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

  const [formData, setFormData] = useState({
    service_code: '',
    restaurant_name: '',
    meal_type: '',
    cuisine_type: '',
    restaurant_type: '',
    city: '',
    base_rate_eur: 0,
    base_rate_non_eur: 0,
    season: '',
    rate_valid_from: today,
    rate_valid_to: nextYear,
    supplier_id: '',
    supplier_name: '',
    tier: 'standard',
    meal_category: '',
    dietary_options: [] as string[],
    per_person_rate: true,
    minimum_pax: 1,
    notes: '',
    is_active: true
  })

  // Fetch rates
  const fetchRates = async () => {
    try {
      const params = new URLSearchParams()
      if (!showInactive) params.append('active_only', 'true')

      const response = await fetch(`/api/rates/meals?${params}`)
      const data = await response.json()

      if (data.success) {
        setRates(data.data)
      }
    } catch (error) {
      console.error('Error fetching meal rates:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch suppliers (restaurants)
  const fetchSuppliers = async () => {
    try {
      const response = await fetch('/api/suppliers?type=restaurant')
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

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedCity, selectedMealType, selectedCuisine, selectedTier, selectedSupplier, showInactive, itemsPerPage])

  // Handlers
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  const handleSupplierChange = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId)
    setFormData(prev => ({
      ...prev,
      supplier_id: supplierId,
      supplier_name: supplier?.name || '',
      city: supplier?.city || prev.city
    }))
  }

  const toggleDietaryOption = (option: string) => {
    setFormData(prev => ({
      ...prev,
      dietary_options: prev.dietary_options.includes(option)
        ? prev.dietary_options.filter(o => o !== option)
        : [...prev.dietary_options, option]
    }))
  }

  const handleAddNew = () => {
    setEditingRate(null)
    setFormData({
      service_code: generateServiceCode(),
      restaurant_name: '',
      meal_type: '',
      cuisine_type: '',
      restaurant_type: '',
      city: '',
      base_rate_eur: 0,
      base_rate_non_eur: 0,
      season: '',
      rate_valid_from: today,
      rate_valid_to: nextYear,
      supplier_id: selectedSupplier || '',
      supplier_name: '',
      tier: 'standard',
      meal_category: '',
      dietary_options: [],
      per_person_rate: true,
      minimum_pax: 1,
      notes: '',
      is_active: true
    })
    setShowModal(true)
  }

  const handleEdit = (rate: MealRate) => {
    setEditingRate(rate)
    setFormData({
      service_code: rate.service_code || '',
      restaurant_name: rate.restaurant_name || '',
      meal_type: rate.meal_type || '',
      cuisine_type: rate.cuisine_type || '',
      restaurant_type: rate.restaurant_type || '',
      city: rate.city || '',
      base_rate_eur: rate.base_rate_eur || 0,
      base_rate_non_eur: rate.base_rate_non_eur || 0,
      season: rate.season || '',
      rate_valid_from: rate.rate_valid_from || today,
      rate_valid_to: rate.rate_valid_to || nextYear,
      supplier_id: rate.supplier_id || '',
      supplier_name: rate.supplier_name || '',
      tier: rate.tier || 'standard',
      meal_category: rate.meal_category || '',
      dietary_options: rate.dietary_options || [],
      per_person_rate: rate.per_person_rate !== false,
      minimum_pax: rate.minimum_pax || 1,
      notes: rate.notes || '',
      is_active: rate.is_active
    })
    setShowModal(true)
  }

  const handleClone = (rate: MealRate) => {
    setEditingRate(null)
    setFormData({
      service_code: generateServiceCode(),
      restaurant_name: rate.restaurant_name || '',
      meal_type: rate.meal_type || '',
      cuisine_type: rate.cuisine_type || '',
      restaurant_type: rate.restaurant_type || '',
      city: rate.city || '',
      base_rate_eur: rate.base_rate_eur || 0,
      base_rate_non_eur: rate.base_rate_non_eur || 0,
      season: rate.season || '',
      rate_valid_from: rate.rate_valid_from || today,
      rate_valid_to: rate.rate_valid_to || nextYear,
      supplier_id: rate.supplier_id || '',
      supplier_name: rate.supplier_name || '',
      tier: rate.tier || 'standard',
      meal_category: rate.meal_category || '',
      dietary_options: rate.dietary_options || [],
      per_person_rate: rate.per_person_rate !== false,
      minimum_pax: rate.minimum_pax || 1,
      notes: rate.notes || '',
      is_active: rate.is_active
    })
    setShowModal(true)
  }

  const handleExportCSV = () => {
    const headers = [
      'service_code',
      'restaurant_name',
      'meal_type',
      'cuisine_type',
      'restaurant_type',
      'city',
      'base_rate_eur',
      'base_rate_non_eur',
      'season',
      'rate_valid_from',
      'rate_valid_to',
      'supplier_id',
      'supplier_name',
      'tier',
      'meal_category',
      'dietary_options',
      'per_person_rate',
      'minimum_pax',
      'notes',
      'is_active'
    ]

    const csvRows = [
      headers.join(','),
      ...filteredRates.map(rate => [
        rate.service_code || '',
        `"${(rate.restaurant_name || '').replace(/"/g, '""')}"`,
        rate.meal_type || '',
        rate.cuisine_type || '',
        rate.restaurant_type || '',
        rate.city || '',
        rate.base_rate_eur || 0,
        rate.base_rate_non_eur || 0,
        rate.season || '',
        rate.rate_valid_from || '',
        rate.rate_valid_to || '',
        rate.supplier_id || '',
        `"${(rate.supplier_name || '').replace(/"/g, '""')}"`,
        rate.tier || '',
        rate.meal_category || '',
        `"${(rate.dietary_options || []).join(';')}"`,
        rate.per_person_rate ? 'true' : 'false',
        rate.minimum_pax || 1,
        `"${(rate.notes || '').replace(/"/g, '""')}"`,
        rate.is_active ? 'true' : 'false'
      ].join(','))
    ]

    const csvContent = csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `meal-rates-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showNotification('success', 'Export Complete', `Exported ${filteredRates.length} meal rates to CSV`)
  }

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string
        const lines = text.split('\n').filter(line => line.trim())

        if (lines.length < 2) {
          showNotification('error', 'Import Failed', 'CSV file is empty or has no data rows')
          return
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
        let successCount = 0
        let errorCount = 0

        for (let i = 1; i < lines.length; i++) {
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
          headers.forEach((header, index) => {
            row[header] = values[index] || ''
          })

          const rateData = {
            service_code: row.service_code || generateServiceCode(),
            restaurant_name: row.restaurant_name || '',
            meal_type: row.meal_type || '',
            cuisine_type: row.cuisine_type || '',
            restaurant_type: row.restaurant_type || '',
            city: row.city || '',
            base_rate_eur: parseFloat(row.base_rate_eur) || 0,
            base_rate_non_eur: parseFloat(row.base_rate_non_eur) || 0,
            season: row.season || '',
            rate_valid_from: row.rate_valid_from || today,
            rate_valid_to: row.rate_valid_to || nextYear,
            supplier_id: row.supplier_id || '',
            supplier_name: row.supplier_name || '',
            tier: row.tier || 'standard',
            meal_category: row.meal_category || '',
            dietary_options: row.dietary_options ? row.dietary_options.split(';').filter(Boolean) : [],
            per_person_rate: row.per_person_rate !== 'false',
            minimum_pax: parseInt(row.minimum_pax) || 1,
            notes: row.notes || '',
            is_active: row.is_active !== 'false'
          }

          if (!rateData.restaurant_name) {
            errorCount++
            continue
          }

          try {
            const response = await fetch('/api/rates/meals', {
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

        fetchRates()
        showNotification(
          errorCount === 0 ? 'success' : 'warning',
          'Import Complete',
          `Successfully imported ${successCount} rates${errorCount > 0 ? `, ${errorCount} failed` : ''}`
        )
      } catch (error) {
        console.error('Import error:', error)
        showNotification('error', 'Import Failed', 'Failed to parse CSV file')
      }
    }

    reader.readAsText(file)
    event.target.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const url = editingRate
        ? `/api/rates/meals/${editingRate.id}`
        : '/api/rates/meals'

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

      showNotification('success', 'Success', editingRate ? 'Meal rate updated successfully!' : 'Meal rate created successfully!')
      setShowModal(false)
      fetchRates()
    } catch (error) {
      console.error('Error saving rate:', error)
      showNotification('error', 'Error', 'Failed to save rate. Please try again.')
    }
  }

  // Open delete confirmation modal
  const confirmDelete = (id: string, name: string) => {
    setDeleteModal({ show: true, id, name })
  }

  // Actually perform delete
  const handleDelete = async () => {
    if (!deleteModal) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/rates/meals/${deleteModal.id}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        showNotification('success', 'Deleted', `"${deleteModal.name}" has been deleted successfully.`)
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
      rate.restaurant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.service_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.city?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesCity = selectedCity === '' || rate.city === selectedCity
    const matchesMealType = selectedMealType === '' || rate.meal_type === selectedMealType
    const matchesCuisine = selectedCuisine === '' || rate.cuisine_type === selectedCuisine
    const matchesTier = selectedTier === '' || rate.tier === selectedTier
    const matchesSupplier = selectedSupplier === '' || rate.supplier_id === selectedSupplier
    const matchesActive = showInactive || rate.is_active

    return matchesSearch && matchesCity && matchesMealType && matchesCuisine && matchesTier && matchesSupplier && matchesActive
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

  // Get tier badge
  const getTierBadge = (tier: string | undefined) => {
    const tierConfig = TIERS.find(t => t.value === tier) || TIERS[1]
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tierConfig.color}`}>
        {tierConfig.label}
      </span>
    )
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
          <p className="text-sm text-gray-600">Loading meal rates...</p>
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
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Meal Rate?</h3>
              <p className="text-sm text-gray-600 mb-1">
                Are you sure you want to delete
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
          <div className="p-2 bg-orange-100 rounded-lg">
            <Utensils className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              Meal Rates
              <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
            </h1>
            <p className="text-sm text-gray-600">Manage restaurant and meal pricing</p>
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
            href="/suppliers?type=restaurant"
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50"
          >
            <Utensils className="w-4 h-4" />
            Restaurants
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Utensils className="w-4 h-4 text-gray-400" />
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
            <span className="w-1.5 h-1.5 rounded-full bg-orange-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{linkedRates}</p>
          <p className="text-xs text-gray-600">Linked</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-gray-400 font-bold">{symbol}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{symbol}{convert(Number(avgRate)).toFixed(0)}</p>
          <p className="text-xs text-gray-600">Avg. Rate</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
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

          {/* Meal Type Filter */}
          <select
            value={selectedMealType}
            onChange={(e) => setSelectedMealType(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">All Meal Types</option>
            {MEAL_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
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

          {/* Tier Filter */}
          <select
            value={selectedTier}
            onChange={(e) => setSelectedTier(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">All Tiers</option>
            {TIERS.map(tier => (
              <option key={tier.value} value={tier.value}>{tier.label}</option>
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
            <Utensils className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Rates Found</h3>
            <p className="text-sm text-gray-600 mb-4">
              {searchTerm || selectedCity || selectedMealType || selectedTier
                ? 'Try adjusting your filters'
                : 'Get started by adding your first meal rate'}
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
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Restaurant</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Meal Type</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">City</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Tier</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">{userCurrency} Rate</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Non-EUR</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedRates.map((rate) => (
                  <tr key={rate.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Utensils className="w-4 h-4 text-orange-500" />
                        <div>
                          <span className="text-sm font-semibold text-gray-900">{rate.restaurant_name}</span>
                          <p className="text-xs text-gray-500">{rate.service_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {rate.meal_type ? (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                          {rate.meal_type}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{rate.city || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {getTierBadge(rate.tier)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-green-600">{symbol}{convert(Number(rate.base_rate_eur)).toFixed(2)}</span>
                      {rate.per_person_rate && <span className="text-xs text-gray-400">/pp</span>}
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
                          onClick={() => confirmDelete(rate.id, rate.restaurant_name)}
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
                    <Utensils className="w-5 h-5 text-orange-500" />
                    <span className="font-semibold text-gray-900">{rate.restaurant_name}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {rate.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  {rate.meal_type && (
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
                      {rate.meal_type}
                    </span>
                  )}
                  {getTierBadge(rate.tier)}
                </div>

                <div className="space-y-1 text-sm text-gray-600 mb-3">
                  <p><span className="text-gray-400">City:</span> {rate.city || '—'}</p>
                  <p><span className="text-gray-400">Cuisine:</span> {rate.cuisine_type || '—'}</p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-gray-500">{userCurrency} Rate {rate.per_person_rate && '(per person)'}</p>
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
                      onClick={() => confirmDelete(rate.id, rate.restaurant_name)}
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
                  <Utensils className="w-4 h-4 text-orange-500" />
                  <span className="font-medium text-gray-900">{rate.restaurant_name}</span>
                  <span className="text-sm text-gray-500">{rate.city || '—'}</span>
                  {rate.meal_type && (
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
                      {rate.meal_type}
                    </span>
                  )}
                  {getTierBadge(rate.tier)}
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
                    <button onClick={() => confirmDelete(rate.id, rate.restaurant_name)} className="p-1 text-gray-400 hover:text-red-600" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
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
                {editingRate ? 'Edit Meal Rate' : 'Add Meal Rate'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 overflow-y-auto max-h-[calc(90vh-140px)]">
              {/* Basic Info */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">1</span>
                  Restaurant & Meal Details
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {/* Supplier Selection */}
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Supplier (Restaurant)</label>
                    <select
                      value={formData.supplier_id}
                      onChange={(e) => handleSupplierChange(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      <option value="">Select Supplier (Optional)</option>
                      {suppliers.map(supplier => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name} {supplier.city && `(${supplier.city})`}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Link to a restaurant supplier for tracking. <a href="/suppliers?type=restaurant" className="text-primary-600 hover:underline">Manage restaurants →</a>
                    </p>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Restaurant Name *</label>
                    <input
                      type="text"
                      name="restaurant_name"
                      value={formData.restaurant_name}
                      onChange={handleChange}
                      required
                      placeholder="e.g., Naguib Mahfouz Café"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
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
                    <label className="block text-xs font-medium text-gray-600 mb-1">Meal Type</label>
                    <select
                      name="meal_type"
                      value={formData.meal_type}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      <option value="">Select Meal Type</option>
                      {MEAL_TYPES.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Cuisine Type</label>
                    <select
                      name="cuisine_type"
                      value={formData.cuisine_type}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      <option value="">Select Cuisine</option>
                      {CUISINE_TYPES.map(cuisine => (
                        <option key={cuisine} value={cuisine}>{cuisine}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Restaurant Type</label>
                    <select
                      name="restaurant_type"
                      value={formData.restaurant_type}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      <option value="">Select Type</option>
                      {RESTAURANT_TYPES.map(type => (
                        <option key={type} value={type}>{type}</option>
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
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Service Tier</label>
                    <select
                      name="tier"
                      value={formData.tier}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      {TIERS.map(tier => (
                        <option key={tier.value} value={tier.value}>{tier.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Dietary Options */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">2</span>
                  Dietary Options
                </h3>
                <div className="flex flex-wrap gap-2">
                  {DIETARY_OPTIONS.map(option => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleDietaryOption(option)}
                      className={`px-3 py-1.5 text-sm rounded-lg border-2 font-medium transition-colors ${
                        formData.dietary_options.includes(option)
                          ? 'border-green-600 bg-green-50 text-green-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rates */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">3</span>
                  Pricing
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Base Rate - EUR Clients (€) *</label>
                    <input
                      type="number"
                      name="base_rate_eur"
                      value={formData.base_rate_eur}
                      onChange={handleChange}
                      required
                      min="0"
                      step="0.01"
                      placeholder="Enter rate in EUR"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                    <p className="text-xs text-gray-500 mt-1">Stored in EUR, displayed in your preferred currency</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Base Rate - Non-EUR Clients (€)</label>
                    <input
                      type="number"
                      name="base_rate_non_eur"
                      value={formData.base_rate_non_eur}
                      onChange={handleChange}
                      min="0"
                      step="0.01"
                      placeholder="Enter rate in EUR"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                    <p className="text-xs text-gray-500 mt-1">Stored in EUR, displayed in your preferred currency</p>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.per_person_rate}
                        onChange={(e) => setFormData({ ...formData, per_person_rate: e.target.checked })}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded"
                      />
                      <span className="text-sm font-medium text-gray-900">Per person rate</span>
                    </label>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Minimum Pax</label>
                    <input
                      type="number"
                      name="minimum_pax"
                      value={formData.minimum_pax}
                      onChange={handleChange}
                      min="1"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
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