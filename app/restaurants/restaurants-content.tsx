'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef } from 'react'
import { todayLocal } from '@/lib/today'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  UtensilsCrossed,
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
  Phone,
  MapPin,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Crown,
  Star
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'

// ============================================
// CONSTANTS
// ============================================

const TIER_OPTIONS = [
  { value: 'budget', label: 'Budget', color: 'bg-gray-100 text-gray-700' },
  { value: 'standard', label: 'Standard', color: 'bg-blue-100 text-blue-700' },
  { value: 'deluxe', label: 'Deluxe', color: 'bg-purple-100 text-purple-700' },
  { value: 'luxury', label: 'Luxury', color: 'bg-amber-100 text-amber-700' }
]

// ============================================
// EGYPTIAN CITIES
// ============================================
const EGYPTIAN_CITIES = [
  'Cairo',
  'Giza',
  'Alexandria',
  'Luxor',
  'Aswan',
  'Hurghada',
  'Sharm El Sheikh',
  'Dahab',
  'Marsa Alam',
  'El Gouna',
  'Siwa',
  'Fayoum',
  'Port Said',
  'Suez',
  'Ismailia',
  'Taba',
  'Nuweiba',
  'Safaga',
  'Ain Sokhna',
  'Ras Sudr',
  'Saint Catherine',
  'Bahariya Oasis',
  'Kharga Oasis',
  'Dakhla Oasis'
]

// ============================================
// INTERFACES
// ============================================

interface Restaurant {
  id: string
  name: string
  restaurant_type?: string
  cuisine_type?: string
  city: string
  address?: string
  contact_person?: string
  phone?: string
  email?: string
  whatsapp?: string
  capacity?: number
  meal_types?: string[]
  dietary_options?: string[]
  notes?: string
  is_active: boolean
  tier: string | null
  is_preferred: boolean
  created_at: string
  rate_per_person_eur?: number
  rate_per_person_non_eur?: number
  rate_breakfast_eur?: number
  rate_lunch_eur?: number
  rate_dinner_eur?: number
  rate_breakfast_non_eur?: number
  rate_lunch_non_eur?: number
  rate_dinner_non_eur?: number
  drinks_included?: boolean
  tip_included?: boolean
  child_discount_percent?: number
  group_discount_percent?: number
  group_min_size?: number
  rate_valid_from?: string
  rate_valid_to?: string
}

interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

type ViewMode = 'table' | 'cards' | 'compact'

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
// MAIN COMPONENT
// ============================================

export default function RestaurantsContent() {
  const dialog = useConfirmDialog()
  const searchParams = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCity, setSelectedCity] = useState('all')
  const [filterTier, setFilterTier] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingRestaurant, setEditingRestaurant] = useState<Restaurant | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [toasts, setToasts] = useState<Toast[]>([])
  
  const today = todayLocal()
  const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0]
  
  const [formData, setFormData] = useState({
    name: '',
    restaurant_type: 'local',
    cuisine_type: '',
    city: '',
    address: '',
    contact_person: '',
    phone: '',
    email: '',
    whatsapp: '',
    capacity: 0,
    meal_types: [] as string[],
    dietary_options: [] as string[],
    notes: '',
    is_active: true,
    tier: 'standard',
    is_preferred: false,
    rate_per_person_eur: 0,
    rate_per_person_non_eur: 0,
    rate_breakfast_eur: 0,
    rate_lunch_eur: 0,
    rate_dinner_eur: 0,
    rate_breakfast_non_eur: 0,
    rate_lunch_non_eur: 0,
    rate_dinner_non_eur: 0,
    drinks_included: false,
    tip_included: false,
    child_discount_percent: 50,
    group_discount_percent: 0,
    group_min_size: 10,
    rate_valid_from: today,
    rate_valid_to: nextYear
  })

  // Toast helpers
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  // Fetch restaurants
  const fetchRestaurants = async () => {
    try {
      const response = await fetch('/api/resources/restaurants')
      const data = await response.json()
      if (data.success) {
        setRestaurants(data.data)
      }
      setLoading(false)
    } catch (error) {
      console.error('Error fetching restaurants:', error)
      showToast('error', 'Failed to load restaurants')
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRestaurants()
  }, [])

  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
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

  // Handle meal types
  const toggleMealType = (mealType: string) => {
    setFormData(prev => ({
      ...prev,
      meal_types: prev.meal_types.includes(mealType)
        ? prev.meal_types.filter(m => m !== mealType)
        : [...prev.meal_types, mealType]
    }))
  }

  // Handle dietary options
  const toggleDietaryOption = (option: string) => {
    setFormData(prev => ({
      ...prev,
      dietary_options: prev.dietary_options.includes(option)
        ? prev.dietary_options.filter(o => o !== option)
        : [...prev.dietary_options, option]
    }))
  }

  // Open modal for new restaurant
  const handleAddNew = () => {
    setEditingRestaurant(null)
    setFormData({
      name: '',
      restaurant_type: 'local',
      cuisine_type: '',
      city: '',
      address: '',
      contact_person: '',
      phone: '',
      email: '',
      whatsapp: '',
      capacity: 0,
      meal_types: [],
      dietary_options: [],
      notes: '',
      is_active: true,
      tier: 'standard',
      is_preferred: false,
      rate_per_person_eur: 0,
      rate_per_person_non_eur: 0,
      rate_breakfast_eur: 0,
      rate_lunch_eur: 0,
      rate_dinner_eur: 0,
      rate_breakfast_non_eur: 0,
      rate_lunch_non_eur: 0,
      rate_dinner_non_eur: 0,
      drinks_included: false,
      tip_included: false,
      child_discount_percent: 50,
      group_discount_percent: 0,
      group_min_size: 10,
      rate_valid_from: today,
      rate_valid_to: nextYear
    })
    setShowModal(true)
  }

  // Open modal for editing
  const handleEdit = (restaurant: Restaurant) => {
    setEditingRestaurant(restaurant)
    setFormData({
      name: restaurant.name,
      restaurant_type: restaurant.restaurant_type || 'local',
      cuisine_type: restaurant.cuisine_type || '',
      city: restaurant.city,
      address: restaurant.address || '',
      contact_person: restaurant.contact_person || '',
      phone: restaurant.phone || '',
      email: restaurant.email || '',
      whatsapp: restaurant.whatsapp || '',
      capacity: restaurant.capacity || 0,
      meal_types: restaurant.meal_types || [],
      dietary_options: restaurant.dietary_options || [],
      notes: restaurant.notes || '',
      is_active: restaurant.is_active,
      tier: restaurant.tier || 'standard',
      is_preferred: restaurant.is_preferred || false,
      rate_per_person_eur: restaurant.rate_per_person_eur || 0,
      rate_per_person_non_eur: restaurant.rate_per_person_non_eur || 0,
      rate_breakfast_eur: restaurant.rate_breakfast_eur || 0,
      rate_lunch_eur: restaurant.rate_lunch_eur || 0,
      rate_dinner_eur: restaurant.rate_dinner_eur || 0,
      rate_breakfast_non_eur: restaurant.rate_breakfast_non_eur || 0,
      rate_lunch_non_eur: restaurant.rate_lunch_non_eur || 0,
      rate_dinner_non_eur: restaurant.rate_dinner_non_eur || 0,
      drinks_included: restaurant.drinks_included || false,
      tip_included: restaurant.tip_included || false,
      child_discount_percent: restaurant.child_discount_percent || 50,
      group_discount_percent: restaurant.group_discount_percent || 0,
      group_min_size: restaurant.group_min_size || 10,
      rate_valid_from: restaurant.rate_valid_from || today,
      rate_valid_to: restaurant.rate_valid_to || nextYear
    })
    setShowModal(true)
  }

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const url = editingRestaurant 
        ? `/api/resources/restaurants/${editingRestaurant.id}`
        : '/api/resources/restaurants'
      
      const method = editingRestaurant ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      
      const data = await response.json()
      
      if (data.success) {
        showToast('success', editingRestaurant ? `${formData.name} updated successfully!` : `${formData.name} created successfully!`)
        setShowModal(false)
        fetchRestaurants()
      } else {
        showToast('error', data.error || 'Failed to save restaurant')
      }
    } catch (error) {
      console.error('Error saving restaurant:', error)
      showToast('error', 'Failed to save restaurant')
    }
  }

  // Delete restaurant
  const handleDelete = async (id: string, name: string) => {
    if (!(await dialog.confirm({ message: `Are you sure you want to delete "${name}"?`, variant: 'danger', confirmText: 'Delete' }))) return
    
    try {
      const response = await fetch(`/api/resources/restaurants/${id}`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (data.success) {
        showToast('success', `${name} deleted successfully!`)
        fetchRestaurants()
      } else {
        showToast('error', data.error || 'Failed to delete restaurant')
      }
    } catch (error) {
      console.error('Error deleting restaurant:', error)
      showToast('error', 'Failed to delete restaurant')
    }
  }

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Name', 'Type', 'Cuisine', 'City', 'Address', 'Contact Person',
      'Phone', 'Email', 'WhatsApp', 'Capacity', 'Lunch EUR', 'Dinner EUR',
      'Lunch Non-EUR', 'Dinner Non-EUR', 'Child Discount %', 'Drinks Included',
      'Tip Included', 'Tier', 'Preferred', 'Active'
    ]
    
    const rows = filteredRestaurants.map(r => [
      r.name,
      r.restaurant_type || '',
      r.cuisine_type || '',
      r.city,
      r.address || '',
      r.contact_person || '',
      r.phone || '',
      r.email || '',
      r.whatsapp || '',
      r.capacity || '',
      r.rate_lunch_eur || r.rate_per_person_eur || '',
      r.rate_dinner_eur || '',
      r.rate_lunch_non_eur || r.rate_per_person_non_eur || '',
      r.rate_dinner_non_eur || '',
      r.child_discount_percent || '',
      r.drinks_included ? 'Yes' : 'No',
      r.tip_included ? 'Yes' : 'No',
      r.tier || 'standard',
      r.is_preferred ? 'Yes' : 'No',
      r.is_active ? 'Yes' : 'No'
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `restaurants_export_${todayLocal()}.csv`
    link.click()
    
    showToast('success', `Exported ${filteredRestaurants.length} restaurants to CSV`)
  }

  // Import from CSV
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        const lines = text.split('\n').filter(line => line.trim())
        
        let imported = 0
        let failed = 0

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(v => v.replace(/"/g, '').trim()) || []
          
          if (values.length < 4) continue

          const restaurantData = {
            name: values[0] || '',
            restaurant_type: values[1] || 'local',
            cuisine_type: values[2] || '',
            city: values[3] || '',
            address: values[4] || '',
            contact_person: values[5] || '',
            phone: values[6] || '',
            email: values[7] || '',
            whatsapp: values[8] || '',
            capacity: parseInt(values[9]) || 0,
            rate_lunch_eur: parseFloat(values[10]) || 0,
            rate_dinner_eur: parseFloat(values[11]) || 0,
            rate_lunch_non_eur: parseFloat(values[12]) || 0,
            rate_dinner_non_eur: parseFloat(values[13]) || 0,
            child_discount_percent: parseFloat(values[14]) || 50,
            drinks_included: values[15]?.toLowerCase() === 'yes',
            tip_included: values[16]?.toLowerCase() === 'yes',
            tier: values[17] || 'standard',
            is_preferred: values[18]?.toLowerCase() === 'yes',
            is_active: values[19]?.toLowerCase() !== 'no'
          }

          if (!restaurantData.name || !restaurantData.city) {
            failed++
            continue
          }

          try {
            const response = await fetch('/api/resources/restaurants', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(restaurantData)
            })
            
            if (response.ok) {
              imported++
            } else {
              failed++
            }
          } catch {
            failed++
          }
        }

        showToast('success', `Imported ${imported} restaurants${failed > 0 ? `, ${failed} failed` : ''}`)
        fetchRestaurants()
      } catch (error) {
        console.error('Import error:', error)
        showToast('error', 'Failed to import CSV file')
      }
    }
    reader.readAsText(file)
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Filter restaurants
  const filteredRestaurants = restaurants.filter(restaurant => {
    const matchesSearch = searchTerm === '' || 
      restaurant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      restaurant.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      restaurant.cuisine_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      restaurant.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesCity = selectedCity === 'all' || restaurant.city === selectedCity
    const matchesActive = showInactive || restaurant.is_active
    const matchesTier = filterTier === null || restaurant.tier === filterTier
    
    return matchesSearch && matchesCity && matchesActive && matchesTier
  })

  // Get unique cities from data
  const usedCities = Array.from(new Set(restaurants.map(r => r.city))).sort()

  // Stats
  const activeRestaurants = restaurants.filter(r => r.is_active).length
  const preferredRestaurants = restaurants.filter(r => r.is_preferred).length
  const restaurantsWithRates = restaurants.filter(r => (r.rate_lunch_eur || 0) > 0 || (r.rate_per_person_eur || 0) > 0).length
  const avgRate = restaurants.length > 0 
    ? (restaurants.reduce((sum, r) => sum + (r.rate_lunch_eur || r.rate_per_person_eur || 0), 0) / restaurants.filter(r => (r.rate_lunch_eur || 0) > 0 || (r.rate_per_person_eur || 0) > 0).length || 0).toFixed(0)
    : '0'

  const mealTypesList = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Buffet', 'À la carte']
  const dietaryOptionsList = ['Vegetarian', 'Vegan', 'Halal', 'Kosher', 'Gluten-Free', 'Dairy-Free']

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading restaurants...</p>
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

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleImportCSV}
        className="hidden"
      />

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-orange-600" />
              <h1 className="text-xl font-bold text-gray-900">Restaurant Contacts & Rates</h1>
              <div className="w-1.5 h-1.5 rounded-full bg-orange-600" />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                <Upload className="w-4 h-4" />
                Import
              </button>
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
                Add Restaurant
              </button>
              <Link 
                href="/rates"
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                ← Resources
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 lg:px-6 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <UtensilsCrossed className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-orange-600" />
            </div>
            <p className="text-xs text-gray-600">Total Restaurants</p>
            <p className="text-2xl font-bold text-gray-900">{restaurants.length}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
            </div>
            <p className="text-xs text-gray-600">Active</p>
            <p className="text-2xl font-bold text-gray-900">{activeRestaurants}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              <div className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            </div>
            <p className="text-xs text-gray-600">Preferred</p>
            <p className="text-2xl font-bold text-gray-900">{preferredRestaurants}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400">💶</span>
              <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
            </div>
            <p className="text-xs text-gray-600">With Rates</p>
            <p className="text-2xl font-bold text-gray-900">{restaurantsWithRates}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400">📊</span>
              <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
            </div>
            <p className="text-xs text-gray-600">Avg. Lunch Rate</p>
            <p className="text-2xl font-bold text-gray-900">€{avgRate}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
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
                placeholder="Search by name, city, cuisine, or contact..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              />
            </div>
            <div className="md:w-48 relative">
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
            <div className="md:w-40">
              <select
                value={filterTier || 'all'}
                onChange={(e) => setFilterTier(e.target.value === 'all' ? null : e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              >
                <option value="all">All Tiers</option>
                <option value="budget">Budget</option>
                <option value="standard">Standard</option>
                <option value="deluxe">Deluxe</option>
                <option value="luxury">Luxury</option>
              </select>
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
              Showing <span className="font-bold text-gray-900">{filteredRestaurants.length}</span> of {restaurants.length} restaurants
            </p>
          </div>
        </div>

        {/* Restaurants Display - Table View */}
        {viewMode === 'table' && (
          <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Restaurant</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">City</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Tier</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Lunch (EUR)</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Dinner (EUR)</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Drinks</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Child %</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRestaurants.map((restaurant, index) => (
                    <tr key={restaurant.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {restaurant.is_preferred && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                          <div>
                            <p className="text-sm font-medium text-gray-900">{restaurant.name}</p>
                            {restaurant.cuisine_type && <p className="text-xs text-gray-500">{restaurant.cuisine_type}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium capitalize">
                          {restaurant.restaurant_type || 'Restaurant'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {restaurant.city}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <TierBadge tier={restaurant.tier} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-green-600">
                          {(restaurant.rate_lunch_eur || 0) > 0 ? `€${restaurant.rate_lunch_eur}` : 
                           (restaurant.rate_per_person_eur || 0) > 0 ? `€${restaurant.rate_per_person_eur}` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold text-gray-900">
                          {(restaurant.rate_dinner_eur || 0) > 0 ? `€${restaurant.rate_dinner_eur}` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {restaurant.drinks_included ? (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">Yes</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">No</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-gray-600">
                          {restaurant.child_discount_percent ? `${restaurant.child_discount_percent}%` : '50%'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          restaurant.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {restaurant.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEdit(restaurant)}
                            className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(restaurant.id, restaurant.name)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredRestaurants.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-gray-500">
                        <UtensilsCrossed className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm font-medium">No restaurants found</p>
                        <button
                          onClick={handleAddNew}
                          className="mt-3 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                        >
                          Add Your First Restaurant
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Restaurants Display - Card View */}
        {viewMode === 'cards' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRestaurants.map((restaurant) => (
              <div key={restaurant.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {restaurant.is_preferred && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">{restaurant.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs capitalize">
                            {restaurant.restaurant_type || 'Restaurant'}
                          </span>
                          {restaurant.cuisine_type && (
                            <span className="text-xs text-gray-500">{restaurant.cuisine_type}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        restaurant.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {restaurant.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <TierBadge tier={restaurant.tier} />
                    </div>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <MapPin className="w-4 h-4" />
                      <span>{restaurant.city}</span>
                    </div>
                    {restaurant.contact_person && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <span className="w-4 h-4 text-center">👤</span>
                        <span>{restaurant.contact_person}</span>
                      </div>
                    )}
                    {restaurant.phone && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Phone className="w-4 h-4" />
                        <span>{restaurant.phone}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div>
                        <p className="text-xs text-gray-500">Lunch</p>
                        <p className="text-sm font-bold text-green-600">
                          {(restaurant.rate_lunch_eur || 0) > 0 ? `€${restaurant.rate_lunch_eur}` : 
                           (restaurant.rate_per_person_eur || 0) > 0 ? `€${restaurant.rate_per_person_eur}` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Dinner</p>
                        <p className="text-sm font-bold text-gray-900">
                          {(restaurant.rate_dinner_eur || 0) > 0 ? `€${restaurant.rate_dinner_eur}` : '—'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-center gap-3 mt-2 text-xs text-gray-500">
                      {restaurant.drinks_included && <span className="text-green-600">🍷 Drinks incl.</span>}
                      {restaurant.tip_included && <span className="text-blue-600">💰 Tip incl.</span>}
                    </div>
                  </div>
                </div>

                <div className="flex border-t border-gray-200 divide-x divide-gray-200">
                  <button
                    onClick={() => handleEdit(restaurant)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(restaurant.id, restaurant.name)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {filteredRestaurants.length === 0 && (
              <div className="col-span-full bg-white rounded-lg shadow-md border border-gray-200 p-12 text-center">
                <UtensilsCrossed className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-500">No restaurants found</p>
                <button
                  onClick={handleAddNew}
                  className="mt-3 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Add Your First Restaurant
                </button>
              </div>
            )}
          </div>
        )}

        {/* Restaurants Display - Compact View */}
        {viewMode === 'compact' && (
          <div className="bg-white rounded-lg shadow-md border border-gray-200 divide-y divide-gray-100">
            {filteredRestaurants.map((restaurant) => (
              <div key={restaurant.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex-shrink-0 flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full inline-block ${restaurant.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                    {restaurant.is_preferred && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-gray-900 truncate block">{restaurant.name}</span>
                  </div>
                  <div className="hidden md:block">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs capitalize">{restaurant.restaurant_type || 'local'}</span>
                  </div>
                  <div className="hidden md:block">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{restaurant.city}</span>
                  </div>
                  <div className="hidden lg:block">
                    <TierBadge tier={restaurant.tier} />
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-green-600">
                      {(restaurant.rate_lunch_eur || 0) > 0 ? `€${restaurant.rate_lunch_eur}` : 
                       (restaurant.rate_per_person_eur || 0) > 0 ? `€${restaurant.rate_per_person_eur}` : '—'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-4">
                  <button
                    onClick={() => handleEdit(restaurant)}
                    className="p-1 text-gray-400 hover:text-primary-600 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(restaurant.id, restaurant.name)}
                    className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {filteredRestaurants.length === 0 && (
              <div className="p-12 text-center">
                <UtensilsCrossed className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-500">No restaurants found</p>
                <button
                  onClick={handleAddNew}
                  className="mt-3 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Add Your First Restaurant
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-gray-900">
                {editingRestaurant ? 'Edit Restaurant' : 'Add New Restaurant'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4">
              {/* Basic Information */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">1</span>
                  Basic Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Restaurant Name *</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="e.g., Nile View Restaurant" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Restaurant Type *</label>
                    <select name="restaurant_type" value={formData.restaurant_type} onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm">
                      <option value="local">🍽️ Local Restaurant</option>
                      <option value="fine_dining">✨ Fine Dining</option>
                      <option value="casual">🍕 Casual Dining</option>
                      <option value="buffet">🍱 Buffet</option>
                      <option value="cafe">☕ Café</option>
                      <option value="fast_food">🍔 Fast Food</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Cuisine Type</label>
                    <input type="text" name="cuisine_type" value={formData.cuisine_type} onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="e.g., Egyptian, Italian" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">City *</label>
                    <select name="city" value={formData.city} onChange={handleChange} required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm">
                      <option value="">Select City...</option>
                      {EGYPTIAN_CITIES.map(city => (<option key={city} value={city}>{city}</option>))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                    <input type="text" name="address" value={formData.address} onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="Full address" />
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">2</span>
                  Contact Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Contact Person</label>
                    <input type="text" name="contact_person" value={formData.contact_person} onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="Name" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                    <input type="tel" name="phone" value={formData.phone} onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="+20 123 456 789" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                    <input type="email" name="email" value={formData.email} onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="contact@restaurant.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp</label>
                    <input type="tel" name="whatsapp" value={formData.whatsapp} onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="+20 123 456 789" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Capacity (seats)</label>
                    <input type="number" name="capacity" value={formData.capacity} onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="e.g., 50" />
                  </div>
                </div>
              </div>

              {/* Service Tier & Preference */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold">3</span>
                  Service Tier & Preference
                </h3>
                
                {/* Tier Selection */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-600 mb-2">
                    Service Tier
                  </label>
                  <div className="flex flex-wrap gap-2">
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
                </div>

                {/* Preferred Toggle */}
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
                        Preferred Restaurant
                      </span>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Preferred restaurants are prioritized when AI generates itineraries within the same tier.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Meal Rates - EUR */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">4</span>
                  Meal Rates - EUR Passport Holders <span className="text-xs font-normal text-gray-500 ml-2">(per person)</span>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Default (€)</label>
                    <input type="number" name="rate_per_person_eur" value={formData.rate_per_person_eur} onChange={handleChange} step="0.01" min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Breakfast (€)</label>
                    <input type="number" name="rate_breakfast_eur" value={formData.rate_breakfast_eur} onChange={handleChange} step="0.01" min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Lunch (€)</label>
                    <input type="number" name="rate_lunch_eur" value={formData.rate_lunch_eur} onChange={handleChange} step="0.01" min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Dinner (€)</label>
                    <input type="number" name="rate_dinner_eur" value={formData.rate_dinner_eur} onChange={handleChange} step="0.01" min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="0.00" />
                  </div>
                </div>
              </div>

              {/* Meal Rates - Non-EUR */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-cyan-100 text-cyan-600 flex items-center justify-center text-xs font-bold">5</span>
                  Meal Rates - Non-EUR Passport Holders <span className="text-xs font-normal text-gray-500 ml-2">(per person)</span>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Default (€)</label>
                    <input type="number" name="rate_per_person_non_eur" value={formData.rate_per_person_non_eur} onChange={handleChange} step="0.01" min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Breakfast (€)</label>
                    <input type="number" name="rate_breakfast_non_eur" value={formData.rate_breakfast_non_eur} onChange={handleChange} step="0.01" min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Lunch (€)</label>
                    <input type="number" name="rate_lunch_non_eur" value={formData.rate_lunch_non_eur} onChange={handleChange} step="0.01" min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Dinner (€)</label>
                    <input type="number" name="rate_dinner_non_eur" value={formData.rate_dinner_non_eur} onChange={handleChange} step="0.01" min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="0.00" />
                  </div>
                </div>
              </div>

              {/* Discounts & Inclusions */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">6</span>
                  Discounts & Inclusions
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Child Discount (%)</label>
                    <input type="number" name="child_discount_percent" value={formData.child_discount_percent} onChange={handleChange} min="0" max="100"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="50" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Group Discount (%)</label>
                    <input type="number" name="group_discount_percent" value={formData.group_discount_percent} onChange={handleChange} min="0" max="100"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Group Min Size</label>
                    <input type="number" name="group_min_size" value={formData.group_min_size} onChange={handleChange} min="1"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="10" />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="drinks_included" checked={formData.drinks_included} onChange={handleCheckboxChange}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500" />
                    <span className="text-sm text-gray-700">Drinks included</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="tip_included" checked={formData.tip_included} onChange={handleCheckboxChange}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500" />
                    <span className="text-sm text-gray-700">Tip/service included</span>
                  </label>
                </div>
              </div>

              {/* Rate Validity */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">7</span>
                  Rate Validity Period
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Valid From</label>
                    <input type="date" name="rate_valid_from" value={formData.rate_valid_from} onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Valid To</label>
                    <input type="date" name="rate_valid_to" value={formData.rate_valid_to} onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" />
                  </div>
                </div>
              </div>

              {/* Meal Types */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center text-xs font-bold">8</span>
                  Meal Types Offered
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {mealTypesList.map(mealType => (
                    <label key={mealType} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={formData.meal_types.includes(mealType)} onChange={() => toggleMealType(mealType)}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500" />
                      <span className="text-sm text-gray-700">{mealType}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Dietary Options */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center text-xs font-bold">9</span>
                  Dietary Options
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {dietaryOptionsList.map(option => (
                    <label key={option} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={formData.dietary_options.includes(option)} onChange={() => toggleDietaryOption(option)}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500" />
                      <span className="text-sm text-gray-700">{option}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm" placeholder="Additional information..." />
              </div>

              {/* Active Status */}
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleCheckboxChange}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500" />
                  <span className="text-sm font-medium text-gray-700">Active (available for bookings)</span>
                </label>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors">
                  Cancel
                </button>
                <button type="submit"
                  className="flex-1 px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" />
                  {editingRestaurant ? 'Update Restaurant' : 'Create Restaurant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}