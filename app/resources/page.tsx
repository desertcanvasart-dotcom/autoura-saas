'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// ============================================
// INTERFACES
// ============================================

interface Guide {
  id: string
  name: string
  email?: string
  phone?: string
  languages?: string[]
  specialties?: string[]
  certification_number?: string
  is_active: boolean
  hourly_rate?: number
  daily_rate?: number
  profile_photo_url?: string
  created_at: string
}

interface Vehicle {
  id: string
  name: string
  vehicle_type: string
  make?: string
  model?: string
  year?: number
  license_plate?: string
  passenger_capacity: number
  has_ac?: boolean
  has_wifi?: boolean
  is_luxury?: boolean
  is_active: boolean
  daily_rate?: number
  photo_url?: string
  created_at: string
}

interface Hotel {
  id: string
  name: string
  property_type?: string
  star_rating?: number
  city: string
  address?: string
  contact_person?: string
  phone?: string
  email?: string
  whatsapp?: string
  capacity?: number
  amenities?: string[]
  notes?: string
  is_active: boolean
  created_at: string
}

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
  created_at: string
}

interface AirportStaff {
  id: string
  name: string
  role?: string
  airport_location: string
  phone: string
  whatsapp?: string
  email?: string
  languages?: string[]
  shift_times?: string
  emergency_contact?: string
  notes?: string
  is_active: boolean
  created_at: string
}

interface HotelStaff {
  id: string
  name: string
  role?: string
  hotel_id?: string
  hotel?: { id: string; name: string; city: string }
  phone: string
  whatsapp?: string
  email?: string
  languages?: string[]
  shift_times?: string
  notes?: string
  is_active: boolean
  created_at: string
}

interface ResourcesData {
  guides: Guide[]
  vehicles: Vehicle[]
  hotels: Hotel[]
  restaurants: Restaurant[]
  airportStaff: AirportStaff[]
  hotelStaff: HotelStaff[]
}

type TabType = 'guides' | 'vehicles' | 'hotels' | 'restaurants' | 'airportStaff' | 'hotelStaff'

// ============================================
// MAIN COMPONENT
// ============================================

export default function ResourcesPage() {
  const [resources, setResources] = useState<ResourcesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCity, setSelectedCity] = useState('all')
  const [activeTab, setActiveTab] = useState<TabType>('guides')
  const [showInactiveResources, setShowInactiveResources] = useState(false)
  
  // Delete confirmation state
  const [deleteModal, setDeleteModal] = useState<{
    show: boolean
    type: 'hotel' | 'restaurant' | 'airport_staff' | 'hotel_staff' | null
    id: string | null
    name: string
  }>({
    show: false,
    type: null,
    id: null,
    name: ''
  })

  // Fetch all resources
  const fetchAllResources = async () => {
    try {
      const [
        guidesRes,
        vehiclesRes,
        hotelsRes,
        restaurantsRes,
        airportStaffRes,
        hotelStaffRes
      ] = await Promise.all([
        fetch('/api/resources?type=guides'),
        fetch('/api/resources?type=vehicles'),
        fetch('/api/resources?type=hotels'),
        fetch('/api/resources?type=restaurants'),
        fetch('/api/resources?type=airport_staff'),
        fetch('/api/resources?type=hotel_staff')
      ])

      const [
        guidesData,
        vehiclesData,
        hotelsData,
        restaurantsData,
        airportStaffData,
        hotelStaffData
      ] = await Promise.all([
        guidesRes.json(),
        vehiclesRes.json(),
        hotelsRes.json(),
        restaurantsRes.json(),
        airportStaffRes.json(),
        hotelStaffRes.json()
      ])

      const combinedData: ResourcesData = {
        guides: guidesData.success ? guidesData.data : [],
        vehicles: vehiclesData.success ? vehiclesData.data : [],
        hotels: hotelsData.success ? hotelsData.data : [],
        restaurants: restaurantsData.success ? restaurantsData.data : [],
        airportStaff: airportStaffData.success ? airportStaffData.data : [],
        hotelStaff: hotelStaffData.success ? hotelStaffData.data : []
      }

      setResources(combinedData)
      setLoading(false)
    } catch (err) {
      console.error('Error loading resources:', err)
      setError('Error loading resources')
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllResources()
  }, [])

  // Delete handlers
  const handleDeleteHotel = async (id: string, name: string) => {
    setDeleteModal({ show: true, type: 'hotel', id, name })
  }

  const handleDeleteRestaurant = async (id: string, name: string) => {
    setDeleteModal({ show: true, type: 'restaurant', id, name })
  }

  const handleDeleteAirportStaff = async (id: string, name: string) => {
    setDeleteModal({ show: true, type: 'airport_staff', id, name })
  }

  const handleDeleteHotelStaff = async (id: string, name: string) => {
    setDeleteModal({ show: true, type: 'hotel_staff', id, name })
  }

  const confirmDelete = async () => {
    if (!deleteModal.id || !deleteModal.type) return

    try {
      const endpoint = deleteModal.type === 'airport_staff' 
        ? 'airport-staff' 
        : deleteModal.type === 'hotel_staff'
        ? 'hotel-staff'
        : `${deleteModal.type}s`

      const response = await fetch(`/api/resources/${endpoint}/${deleteModal.id}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        alert(`${deleteModal.name} deleted successfully!`)
        fetchAllResources() // Refresh data
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to delete resource')
    }

    setDeleteModal({ show: false, type: null, id: null, name: '' })
  }
  
  // Delete Confirmation Modal Component
  const DeleteConfirmationModal = () => {
    if (!deleteModal.show) return null

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-5 max-w-md w-full mx-4 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-white border-2 border-red-600 rounded-full flex items-center justify-center">
              <span className="text-red-600 text-xl">⚠️</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Delete Resource?</h3>
              <p className="text-xs text-gray-500">This action cannot be undone</p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <p className="text-xs text-gray-600 mb-1">You are about to delete:</p>
            <p className="text-sm font-semibold text-gray-900">{deleteModal.name}</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setDeleteModal({ show: false, type: null, id: null, name: '' })}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              className="flex-1 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading resources...</p>
        </div>
      </div>
    )
  }

  if (error || !resources) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="w-12 h-12 bg-white border-2 border-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-red-500 text-xl">⚠️</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-sm text-red-600 mb-4">{error || 'Failed to load resources'}</p>
          <Link href="/" className="inline-block px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
            ← Back to Home
          </Link>
        </div>
      </div>
    )
  }

  // Get all unique cities
  const allCities = Array.from(new Set([
    ...resources.hotels.map(r => r.city),
    ...resources.restaurants.map(r => r.city),
    ...resources.airportStaff.map(r => r.airport_location),
    ...resources.hotelStaff.filter(r => r.hotel?.city).map(r => r.hotel!.city)
  ])).sort()

  // Filter function
  const filterResources = <T extends any>(resourceArray: T[], cityField: string = 'city'): T[] => {
    return resourceArray.filter(resource => {
      const matchesSearch = searchTerm === '' || 
      Object.values(resource as Record<string, unknown>).some(value => {
      if (typeof value === 'string') {
            return value.toLowerCase().includes(searchTerm.toLowerCase())
          }
          if (Array.isArray(value)) {
            return value.some(v => v.toString().toLowerCase().includes(searchTerm.toLowerCase()))
          }
          return false
        })
      
      let matchesCity = true
      if (selectedCity !== 'all') {
        if (cityField === 'airport_location') {
          matchesCity = (resource as any).airport_location === selectedCity
        } else if (cityField === 'hotel.city') {
          matchesCity = (resource as any).hotel?.city === selectedCity
        } else {
          matchesCity = (resource as any)[cityField] === selectedCity
        }
      }
      
      const matchesActive = showInactiveResources || (resource as any).is_active === true
      
      return matchesSearch && matchesCity && matchesActive
    })
  }

  const filteredResources = {
    guides: filterResources(resources.guides),
    vehicles: filterResources(resources.vehicles, 'none'),
    hotels: filterResources(resources.hotels),
    restaurants: filterResources(resources.restaurants),
    airportStaff: filterResources(resources.airportStaff, 'airport_location'),
    hotelStaff: filterResources(resources.hotelStaff, 'hotel.city')
  }

  const totalResources = resources.guides.length + resources.vehicles.length + 
                          resources.hotels.length + resources.restaurants.length +
                          resources.airportStaff.length + resources.hotelStaff.length

  const exportToCSV = () => {
    const currentResources = filteredResources[activeTab]
    let csvContent = ''
    
    if (activeTab === 'guides') {
      csvContent = 'Name,Email,Phone,Languages,Hourly Rate,Daily Rate,Active,Created\n'
      currentResources.forEach((resource: any) => {
        csvContent += `${resource.name},${resource.email || ''},${resource.phone || ''},"${(resource.languages || []).join(', ')}",${resource.hourly_rate || ''},${resource.daily_rate || ''},${resource.is_active ? 'Yes' : 'No'},${new Date(resource.created_at).toLocaleDateString()}\n`
      })
    } else if (activeTab === 'vehicles') {
      csvContent = 'Name,Type,Make,Capacity,License Plate,Active,Created\n'
      currentResources.forEach((resource: any) => {
        csvContent += `${resource.name},${resource.vehicle_type},${resource.make || ''},${resource.passenger_capacity},${resource.license_plate || ''},${resource.is_active ? 'Yes' : 'No'},${new Date(resource.created_at).toLocaleDateString()}\n`
      })
    } else if (activeTab === 'hotels') {
      csvContent = 'Name,Type,City,Stars,Contact Person,Phone,Email,Active\n'
      currentResources.forEach((resource: any) => {
        csvContent += `${resource.name},${resource.property_type || ''},${resource.city},${resource.star_rating || ''},${resource.contact_person || ''},${resource.phone || ''},${resource.email || ''},${resource.is_active ? 'Yes' : 'No'}\n`
      })
    } else if (activeTab === 'restaurants') {
      csvContent = 'Name,Type,Cuisine,City,Contact Person,Phone,Capacity,Active\n'
      currentResources.forEach((resource: any) => {
        csvContent += `${resource.name},${resource.restaurant_type || ''},${resource.cuisine_type || ''},${resource.city},${resource.contact_person || ''},${resource.phone || ''},${resource.capacity || ''},${resource.is_active ? 'Yes' : 'No'}\n`
      })
    } else if (activeTab === 'airportStaff') {
      csvContent = 'Name,Role,Location,Phone,Languages,Active\n'
      currentResources.forEach((resource: any) => {
        csvContent += `${resource.name},${resource.role || ''},${resource.airport_location},"${resource.phone}","${(resource.languages || []).join(', ')}",${resource.is_active ? 'Yes' : 'No'}\n`
      })
    } else if (activeTab === 'hotelStaff') {
      csvContent = 'Name,Role,Hotel,Phone,Languages,Active\n'
      currentResources.forEach((resource: any) => {
        csvContent += `${resource.name},${resource.role || ''},${resource.hotel?.name || 'N/A'},${resource.phone},"${(resource.languages || []).join(', ')}",${resource.is_active ? 'Yes' : 'No'}\n`
      })
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `autoura_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">Resource Management</h1>
              <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={exportToCSV}
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center gap-1.5"
              >
                <span className="text-gray-400">📊</span>
                Export
              </button>
              <Link 
                href="/rates"
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center gap-1.5"
              >
                <span className="text-gray-400">💰</span>
                Rates
              </Link>
              <Link 
                href="/" 
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center gap-1.5"
              >
                <span>←</span>
                Home
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Statistics Dashboard */}
      <div className="container mx-auto px-4 lg:px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Total Resources Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400">🎯</span>
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            </div>
            <p className="text-xs text-gray-600">Total Resources</p>
            <p className="text-2xl font-bold text-gray-900">{totalResources}</p>
          </div>

          {/* Guides & Vehicles Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400">👤</span>
              <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
            </div>
            <p className="text-xs text-gray-600">Guides & Vehicles</p>
            <p className="text-2xl font-bold text-gray-900">{resources.guides.length + resources.vehicles.length}</p>
          </div>

          {/* Hotels & Restaurants Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400">🏨</span>
              <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
            </div>
            <p className="text-xs text-gray-600">Hotels & Restaurants</p>
            <p className="text-2xl font-bold text-gray-900">{resources.hotels.length + resources.restaurants.length}</p>
          </div>

          {/* Current View Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400">👁️</span>
              <div className="w-1.5 h-1.5 rounded-full bg-orange-600" />
            </div>
            <p className="text-xs text-gray-600 capitalize">{activeTab} Results</p>
            <p className="text-2xl font-bold text-gray-900">{filteredResources[activeTab].length}</p>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="container mx-auto px-4 lg:px-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Search Resources
              </label>
              <input
                type="text"
                placeholder="Search by name, phone, location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              />
            </div>
            {(['hotels', 'restaurants', 'airportStaff', 'hotelStaff'].includes(activeTab)) && (
              <div className="md:w-48">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Filter by City
                </label>
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                >
                  <option value="all">All Cities</option>
                  {allCities.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          
          <div className="mt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="text-xs text-gray-600">
              Showing <span className="font-bold text-gray-900">{filteredResources[activeTab].length}</span> of {resources[activeTab].length} {activeTab}
            </div>
            
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setSearchTerm('')
                  setSelectedCity('all')
                  setShowInactiveResources(false)
                }}
                className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
              >
                Clear Filters
              </button>
              
              <button
                onClick={() => setShowInactiveResources(!showInactiveResources)}
                className={`px-2 py-1 text-xs rounded-lg transition-colors font-medium ${
                  showInactiveResources 
                    ? 'bg-white border border-red-300 text-red-700' 
                    : 'bg-white border border-green-300 text-green-700'
                }`}
              >
                {showInactiveResources ? 'Active Only' : 'Show Inactive'}
              </button>
              
              <Link
                href={
                  activeTab === 'guides' ? '/guides' :
                  activeTab === 'vehicles' ? '/vehicles' :
                  activeTab === 'hotels' ? '/hotels' :
                  activeTab === 'restaurants' ? '/restaurants' :
                  activeTab === 'airportStaff' ? '/airport-staff' :
                  '/hotel-staff'
                }
                className="px-2 py-1 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium"
              >
                + Add New
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="container mx-auto px-4 lg:px-6">
        <div className="bg-white rounded-t-lg shadow-sm border border-gray-200 border-b-0">
          <div className="flex overflow-x-auto">
            <button
              onClick={() => setActiveTab('guides')}
              className={`px-4 py-2 text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap border-b-2 ${
                activeTab === 'guides'
                  ? 'text-gray-900 border-primary-600 bg-gray-50'
                  : 'text-gray-600 border-transparent hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span className="text-gray-400">👨‍🏫</span>
              Guides ({filteredResources.guides.length})
            </button>
            <button
              onClick={() => setActiveTab('vehicles')}
              className={`px-4 py-2 text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap border-b-2 ${
                activeTab === 'vehicles'
                  ? 'text-gray-900 border-primary-600 bg-gray-50'
                  : 'text-gray-600 border-transparent hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span className="text-gray-400">🚗</span>
              Vehicles ({filteredResources.vehicles.length})
            </button>
            <button
              onClick={() => setActiveTab('hotels')}
              className={`px-4 py-2 text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap border-b-2 ${
                activeTab === 'hotels'
                  ? 'text-gray-900 border-primary-600 bg-gray-50'
                  : 'text-gray-600 border-transparent hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span className="text-gray-400">🏨</span>
              Hotels ({filteredResources.hotels.length})
            </button>
            <button
              onClick={() => setActiveTab('restaurants')}
              className={`px-4 py-2 text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap border-b-2 ${
                activeTab === 'restaurants'
                  ? 'text-gray-900 border-primary-600 bg-gray-50'
                  : 'text-gray-600 border-transparent hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span className="text-gray-400">🍽️</span>
              Restaurants ({filteredResources.restaurants.length})
            </button>
            <button
              onClick={() => setActiveTab('airportStaff')}
              className={`px-4 py-2 text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap border-b-2 ${
                activeTab === 'airportStaff'
                  ? 'text-gray-900 border-primary-600 bg-gray-50'
                  : 'text-gray-600 border-transparent hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span className="text-gray-400">✈️</span>
              Airport Staff ({filteredResources.airportStaff.length})
            </button>
            <button
              onClick={() => setActiveTab('hotelStaff')}
              className={`px-4 py-2 text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap border-b-2 ${
                activeTab === 'hotelStaff'
                  ? 'text-gray-900 border-primary-600 bg-gray-50'
                  : 'text-gray-600 border-transparent hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span className="text-gray-400">🛎️</span>
              Hotel Staff ({filteredResources.hotelStaff.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Tables */}
      <main className="container mx-auto px-4 lg:px-6 pb-6">
        <div className="bg-white rounded-b-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">

            {/* Guides Table */}
            {activeTab === 'guides' && (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Contact</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Languages</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Daily Rate</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResources.guides.map((guide, index) => (
                    <tr key={guide.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors border-t border-gray-100`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {guide.profile_photo_url ? (
                            <img src={guide.profile_photo_url} alt={guide.name} className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                              <span className="text-gray-600 text-xs font-bold">{guide.name.charAt(0)}</span>
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-gray-900">{guide.name}</p>
                            {guide.certification_number && (
                              <p className="text-xs text-gray-500">Cert: {guide.certification_number}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs">
                          {guide.phone && <p className="text-gray-700">📞 {guide.phone}</p>}
                          {guide.email && <p className="text-gray-500">{guide.email}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {guide.languages?.slice(0, 2).map(lang => (
                            <span key={lang} className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                              {lang}
                            </span>
                          ))}
                          {guide.languages && guide.languages.length > 2 && (
                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                              +{guide.languages.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-semibold text-gray-900">
                          €{guide.daily_rate || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          guide.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {guide.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <Link 
                            href="/guides"
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Edit
                          </Link>
                          <button 
                            onClick={() => {
                              if (confirm(`Delete ${guide.name}?`)) {
                                fetch(`/api/resources/guides/${guide.id}`, { method: 'DELETE' })
                                  .then(res => res.json())
                                  .then(data => {
                                    if (data.success) {
                                      alert('Guide deleted!')
                                      fetchAllResources()
                                    } else {
                                      alert('Error: ' + data.error)
                                    }
                                  })
                              }
                            }}
                            className="text-xs text-red-600 hover:text-red-800 font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredResources.guides.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-3xl text-gray-400">👨‍🏫</span>
                          <p className="text-sm font-medium">No guides found</p>
                          <Link 
                            href="/guides/new"
                            className="mt-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 inline-block"
                          >
                            Add Your First Guide
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Vehicles Table */}
            {activeTab === 'vehicles' && (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Make/Model</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Capacity</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">License</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResources.vehicles.map((vehicle, index) => (
                    <tr key={vehicle.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors border-t border-gray-100`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{vehicle.name}</td>
                      <td className="px-4 py-3">
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {vehicle.vehicle_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700">
                        {vehicle.make} {vehicle.model} {vehicle.year && `(${vehicle.year})`}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-medium">
                          {vehicle.passenger_capacity} pax
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700">
                        {vehicle.license_plate || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          vehicle.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {vehicle.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <Link 
                            href="/vehicles"
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Edit
                          </Link>
                          <button 
                            onClick={() => {
                              if (confirm(`Delete ${vehicle.name}?`)) {
                                fetch(`/api/resources/vehicles/${vehicle.id}`, { method: 'DELETE' })
                                  .then(res => res.json())
                                  .then(data => {
                                    if (data.success) {
                                      alert('Vehicle deleted!')
                                      fetchAllResources()
                                    } else {
                                      alert('Error: ' + data.error)
                                    }
                                  })
                              }
                            }}
                            className="text-xs text-red-600 hover:text-red-800 font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredResources.vehicles.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-3xl text-gray-400">🚗</span>
                          <p className="text-sm font-medium">No vehicles found</p>
                          <Link 
                            href="/vehicles/new"
                            className="mt-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 inline-block"
                          >
                            Add Your First Vehicle
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Hotels Table */}
            {activeTab === 'hotels' && (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Type</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Stars</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">City</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Contact</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResources.hotels.map((hotel, index) => (
                    <tr key={hotel.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors border-t border-gray-100`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{hotel.name}</td>
                      <td className="px-4 py-3">
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium capitalize">
                          {hotel.property_type || 'Hotel'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-yellow-500 text-xs">
                          {'⭐'.repeat(hotel.star_rating || 0)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {hotel.city}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs">
                          {hotel.contact_person && <p className="font-medium text-gray-700">{hotel.contact_person}</p>}
                          {hotel.phone && <p className="text-gray-700">📞 {hotel.phone}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          hotel.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {hotel.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <Link 
                            href="/hotels"
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Edit
                          </Link>
                          <button 
                            onClick={() => handleDeleteHotel(hotel.id, hotel.name)}
                            className="text-xs text-red-600 hover:text-red-800 font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredResources.hotels.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-3xl text-gray-400">🏨</span>
                          <p className="text-sm font-medium">No hotels found</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Restaurants Table */}
            {activeTab === 'restaurants' && (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Cuisine</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">City</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Contact</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResources.restaurants.map((restaurant, index) => (
                    <tr key={restaurant.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors border-t border-gray-100`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{restaurant.name}</td>
                      <td className="px-4 py-3">
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium capitalize">
                          {restaurant.restaurant_type || 'Restaurant'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700">{restaurant.cuisine_type || '-'}</td>
                      <td className="px-4 py-3">
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {restaurant.city}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs">
                          {restaurant.contact_person && <p className="font-medium text-gray-700">{restaurant.contact_person}</p>}
                          {restaurant.phone && <p className="text-gray-700">📞 {restaurant.phone}</p>}
                        </div>
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
                        <div className="flex items-center justify-center gap-2">
                          <Link 
                            href="/restaurants"
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Edit
                          </Link>
                          <button 
                            onClick={() => handleDeleteRestaurant(restaurant.id, restaurant.name)}
                            className="text-xs text-red-600 hover:text-red-800 font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredResources.restaurants.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-3xl text-gray-400">🍽️</span>
                          <p className="text-sm font-medium">No restaurants found</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Airport Staff Table */}
            {activeTab === 'airportStaff' && (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Role</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Location</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Contact</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Languages</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResources.airportStaff.map((staff, index) => (
                    <tr key={staff.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors border-t border-gray-100`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{staff.name}</td>
                      <td className="px-4 py-3">
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium capitalize">
                          {staff.role || 'Staff'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {staff.airport_location}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs">
                          <p className="text-gray-700">📞 {staff.phone}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {staff.languages?.slice(0, 2).map(lang => (
                            <span key={lang} className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                              {lang}
                            </span>
                          ))}
                          {staff.languages && staff.languages.length > 2 && (
                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                              +{staff.languages.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          staff.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {staff.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <Link 
                            href="/airport-staff"
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Edit
                          </Link>
                          <button 
                            onClick={() => handleDeleteAirportStaff(staff.id, staff.name)}
                            className="text-xs text-red-600 hover:text-red-800 font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredResources.airportStaff.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-3xl text-gray-400">✈️</span>
                          <p className="text-sm font-medium">No airport staff found</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Hotel Staff Table */}
            {activeTab === 'hotelStaff' && (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Role</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Hotel</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Contact</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Languages</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResources.hotelStaff.map((staff, index) => (
                    <tr key={staff.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors border-t border-gray-100`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{staff.name}</td>
                      <td className="px-4 py-3">
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium capitalize">
                          {staff.role || 'Staff'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {staff.hotel ? (
                          <div>
                            <p className="text-sm font-medium text-gray-900">{staff.hotel.name}</p>
                            <p className="text-xs text-gray-500">{staff.hotel.city}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">No hotel assigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs">
                          <p className="text-gray-700">📞 {staff.phone}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {staff.languages?.slice(0, 2).map(lang => (
                            <span key={lang} className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                              {lang}
                            </span>
                          ))}
                          {staff.languages && staff.languages.length > 2 && (
                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                              +{staff.languages.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          staff.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {staff.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                            Edit
                          </button>
                          <button 
                            onClick={() => handleDeleteHotelStaff(staff.id, staff.name)}
                            className="text-xs text-red-600 hover:text-red-800 font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredResources.hotelStaff.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-3xl text-gray-400">🛎️</span>
                          <p className="text-sm font-medium">No hotel staff found</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

          </div>
        </div>

        {/* Delete Confirmation Modal */}
        <DeleteConfirmationModal />
      </main>
    </div>
  )
}