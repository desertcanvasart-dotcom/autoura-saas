// app/components/ResourceAssignmentV2.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { 
  Users, Truck, Hotel, UtensilsCrossed, Ship, Plane, UserCheck,
  Check, AlertCircle, Loader2, MapPin, Clock, Plus, Trash2, Calendar,
  ChevronDown, ChevronUp, X, MessageCircle, Send, Filter, Anchor
} from 'lucide-react'

// Types
interface Resource {
  id: string
  name: string
  phone?: string
  city?: string
  airport_location?: string
  route?: string
  hotel?: {
    id: string
    name: string
    city: string
  }
  [key: string]: any
}

interface AssignedResource {
  id: string
  itinerary_id: string
  itinerary_day_id?: string
  resource_type: string
  resource_id: string
  resource_name: string
  start_date: string
  end_date?: string
  notes?: string
  quantity: number
  cost_eur?: number
  cost_non_eur?: number
  status: string
}

interface Conflict {
  resource_id: string
  resource_name: string
  conflicting_itinerary: string
  dates: string
}

interface ResourceAssignmentV2Props {
  itineraryId: string
  startDate: string
  endDate: string
  numTravelers?: number
  clientName?: string
  tripName?: string
  onUpdate?: () => void
}

// City options for Egypt
const CITY_OPTIONS = [
  { value: 'all', label: 'All Cities' },
  { value: 'Cairo', label: 'Cairo' },
  { value: 'Giza', label: 'Giza' },
  { value: 'Luxor', label: 'Luxor' },
  { value: 'Aswan', label: 'Aswan' },
  { value: 'Alexandria', label: 'Alexandria' },
  { value: 'Hurghada', label: 'Hurghada' },
  { value: 'Sharm El Sheikh', label: 'Sharm El Sheikh' },
  { value: 'Dahab', label: 'Dahab' },
  { value: 'Marsa Alam', label: 'Marsa Alam' },
  { value: 'Siwa', label: 'Siwa' },
  { value: 'Fayoum', label: 'Fayoum' }
]

// Airport locations (using airport codes and names)
const AIRPORT_LOCATION_OPTIONS = [
  { value: 'all', label: 'All Airports' },
  { value: 'Cairo', label: 'Cairo (CAI)' },
  { value: 'Luxor', label: 'Luxor (LXR)' },
  { value: 'Aswan', label: 'Aswan (ASW)' },
  { value: 'Hurghada', label: 'Hurghada (HRG)' },
  { value: 'Sharm', label: 'Sharm El Sheikh (SSH)' },
  { value: 'Alexandria', label: 'Alexandria (HBE/ALY)' },
  { value: 'Marsa Alam', label: 'Marsa Alam (RMF)' }
]

// Cruise route options
const CRUISE_ROUTE_OPTIONS = [
  { value: 'all', label: 'All Routes' },
  { value: 'luxor_aswan', label: 'Luxor → Aswan (4 nights)' },
  { value: 'aswan_luxor', label: 'Aswan → Luxor (3 nights)' },
  { value: 'round_trip', label: 'Round Trip (7 nights)' }
]

// Resource type configurations - using existing API endpoints
const RESOURCE_TYPES = [
  { 
    key: 'guide', 
    label: 'Guides', 
    icon: Users, 
    color: 'blue',
    apiEndpoint: '/api/guides',
    nameField: 'name',
    phoneField: 'phone',
    displayField: (r: any) => `${r.name}${r.languages?.length ? ` (${r.languages.join(', ')})` : ''}`,
    canNotify: true,
    filterType: 'city',
    cityField: 'city'
  },
  { 
    key: 'vehicle', 
    label: 'Vehicles', 
    icon: Truck, 
    color: 'green',
    apiEndpoint: '/api/vehicles',
    nameField: 'name',
    phoneField: 'default_driver_phone',
    displayField: (r: any) => `${r.name || r.vehicle_type || 'Vehicle'} - ${r.city || 'N/A'} (${r.passenger_capacity || '?'} pax)`,
    canNotify: false,
    filterType: 'city',
    cityField: 'city'
  },
  { 
    key: 'hotel', 
    label: 'Hotels', 
    icon: Hotel, 
    color: 'purple',
    apiEndpoint: '/api/resources/hotels',
    nameField: 'name',
    phoneField: 'phone',
    displayField: (r: any) => `${r.name}${r.city ? ` - ${r.city}` : ''}${r.star_rating ? ` ⭐${r.star_rating}` : ''}`,
    canNotify: false,
    filterType: 'city',
    cityField: 'city'
  },
  { 
    key: 'restaurant', 
    label: 'Restaurants', 
    icon: UtensilsCrossed, 
    color: 'orange',
    apiEndpoint: '/api/resources/restaurants',
    nameField: 'name',
    phoneField: 'phone',
    displayField: (r: any) => `${r.name}${r.city ? ` - ${r.city}` : ''}${r.cuisine_type ? ` (${r.cuisine_type})` : ''}`,
    canNotify: true,
    filterType: 'city',
    cityField: 'city'
  },
  { 
    key: 'cruise', 
    label: 'Nile Cruises', 
    icon: Ship, 
    color: 'indigo',
    apiEndpoint: '/api/cruises',
    nameField: 'name',
    phoneField: 'phone',
    displayField: (r: any) => {
      const routeLabels: Record<string, string> = {
        'luxor_aswan': 'Luxor → Aswan (4n)',
        'aswan_luxor': 'Aswan → Luxor (3n)',
        'round_trip': 'Round Trip (7n)'
      }
      const routeLabel = r.route ? routeLabels[r.route] || r.route : ''
      return `${r.name}${r.ship_name ? ` - ${r.ship_name}` : ''}${routeLabel ? ` • ${routeLabel}` : ''}`
    },
    canNotify: false,
    filterType: 'route',
    routeField: 'route'
  },
  { 
    key: 'airport_staff', 
    label: 'Airport Staff', 
    icon: Plane, 
    color: 'cyan',
    apiEndpoint: '/api/resources/airport-staff',
    nameField: 'name',
    phoneField: 'phone',
    displayField: (r: any) => `${r.name}${r.airport_location ? ` - ${r.airport_location}` : ''}${r.role ? ` (${r.role})` : ''}`,
    canNotify: true,
    filterType: 'airport',
    cityField: 'airport_location'
  },
  { 
    key: 'hotel_staff', 
    label: 'Hotel Staff', 
    icon: UserCheck, 
    color: 'pink',
    apiEndpoint: '/api/resources/hotel-staff',
    nameField: 'name',
    phoneField: 'phone',
    displayField: (r: any) => `${r.name}${r.hotel?.name ? ` - ${r.hotel.name}` : ''}${r.hotel?.city ? ` (${r.hotel.city})` : ''}${r.role ? ` • ${r.role}` : ''}`,
    canNotify: true,
    filterType: 'hotelCity',
    cityField: 'hotel.city'
  }
]

const COLOR_CLASSES: Record<string, { bg: string, border: string, text: string, light: string }> = {
  blue: { bg: 'bg-blue-600', border: 'border-blue-200', text: 'text-blue-600', light: 'bg-blue-50' },
  green: { bg: 'bg-green-600', border: 'border-green-200', text: 'text-green-600', light: 'bg-green-50' },
  purple: { bg: 'bg-purple-600', border: 'border-purple-200', text: 'text-purple-600', light: 'bg-purple-50' },
  orange: { bg: 'bg-orange-600', border: 'border-orange-200', text: 'text-orange-600', light: 'bg-orange-50' },
  indigo: { bg: 'bg-indigo-600', border: 'border-indigo-200', text: 'text-indigo-600', light: 'bg-indigo-50' },
  cyan: { bg: 'bg-cyan-600', border: 'border-cyan-200', text: 'text-cyan-600', light: 'bg-cyan-50' },
  pink: { bg: 'bg-pink-600', border: 'border-pink-200', text: 'text-pink-600', light: 'bg-pink-50' }
}

export default function ResourceAssignmentV2({
  itineraryId,
  startDate,
  endDate,
  numTravelers,
  clientName,
  tripName,
  onUpdate
}: ResourceAssignmentV2Props) {
  const [activeTab, setActiveTab] = useState('guide')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Filter states for modal
  const [modalCityFilter, setModalCityFilter] = useState('all')
  const [modalRouteFilter, setModalRouteFilter] = useState('all')
  const [modalAirportFilter, setModalAirportFilter] = useState('all')
  
  // Available resources from each table
  const [availableResources, setAvailableResources] = useState<Record<string, Resource[]>>({})
  
  // Assigned resources for this itinerary
  const [assignedResources, setAssignedResources] = useState<AssignedResource[]>([])
  
  // Conflicts
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  
  // Add resource modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addFormData, setAddFormData] = useState({
    resource_id: '',
    start_date: startDate,
    end_date: endDate,
    notes: '',
    quantity: 1
  })

  // WhatsApp sending state
  const [sendingWhatsApp, setSendingWhatsApp] = useState<string | null>(null)
  const [whatsAppSent, setWhatsAppSent] = useState<Set<string>>(new Set())

  // Reset filters when modal opens or tab changes
  const resetModalFilters = () => {
    setModalCityFilter('all')
    setModalRouteFilter('all')
    setModalAirportFilter('all')
  }

  // Fetch all data on mount
  useEffect(() => {
    fetchAllData()
  }, [itineraryId, startDate, endDate])

  const fetchAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchAvailableResources(),
        fetchAssignedResources(),
        fetchConflicts()
      ])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }
  const fetchAvailableResources = async () => {
    const resources: Record<string, Resource[]> = {}
    
    for (const type of RESOURCE_TYPES) {
      try {
        const response = await fetch(`${type.apiEndpoint}?is_active=true`)
        
        // Handle 404 or other errors gracefully
        if (!response.ok) {
          console.log(`Resource API not available: ${type.apiEndpoint}`)
          resources[type.key] = []
          continue
        }
        
        const data = await response.json()
        resources[type.key] = Array.isArray(data) ? data : (data.data || [])
      } catch (error) {
        console.log(`Error fetching ${type.key}:`, error)
        resources[type.key] = []
      }
    }
    
    setAvailableResources(resources)
  }

  const fetchAssignedResources = async () => {
    try {
      const response = await fetch(`/api/itinerary-resources?itinerary_id=${itineraryId}`)
      const data = await response.json()
      
      if (data.success) {
        setAssignedResources(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching assigned resources:', error)
    }
  }

  const fetchConflicts = async () => {
    try {
      const response = await fetch(`/api/itinerary-resources/conflicts?itinerary_id=${itineraryId}`)
      const data = await response.json()
      
      if (data.success) {
        setConflicts(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching conflicts:', error)
    }
  }

  // Get filtered resources for the modal dropdown
  const getFilteredResourcesForModal = (): Resource[] => {
    const resources = availableResources[activeTab] || []
    const typeConfig = RESOURCE_TYPES.find(t => t.key === activeTab)
    
    if (!typeConfig) return resources
    
    // Filter based on resource type
    switch (typeConfig.filterType) {
      case 'city':
        // For guides, vehicles, hotels, restaurants
        if (modalCityFilter === 'all') return resources
        if (modalCityFilter === 'none') {
          return resources.filter(r => !r[typeConfig.cityField || 'city'])
        }
        return resources.filter(r => {
          const city = r[typeConfig.cityField || 'city']
          return city?.toLowerCase().includes(modalCityFilter.toLowerCase())
        })
      
      case 'airport':
        // For airport staff - filter by airport_location
        if (modalAirportFilter === 'all') return resources
        return resources.filter(r => {
          const location = r.airport_location?.toLowerCase() || ''
          return location.includes(modalAirportFilter.toLowerCase())
        })
      
      case 'hotelCity':
        // For hotel staff - filter by hotel.city
        if (modalCityFilter === 'all') return resources
        return resources.filter(r => {
          const hotelCity = r.hotel?.city?.toLowerCase() || ''
          return hotelCity.includes(modalCityFilter.toLowerCase())
        })
      
      case 'route':
        // For cruises - filter by route
        if (modalRouteFilter === 'all') return resources
        return resources.filter(r => r.route === modalRouteFilter)
      
      default:
        return resources
    }
  }

  // Get unique values for filter dropdowns
  const getUniqueAirportLocations = (): string[] => {
    const resources = availableResources['airport_staff'] || []
    const locations = new Set<string>()
    resources.forEach(r => {
      if (r.airport_location) locations.add(r.airport_location)
    })
    return Array.from(locations).sort()
  }

  const getUniqueHotelCities = (): string[] => {
    const resources = availableResources['hotel_staff'] || []
    const cities = new Set<string>()
    resources.forEach(r => {
      if (r.hotel?.city) cities.add(r.hotel.city)
    })
    return Array.from(cities).sort()
  }

  const getUniqueCruiseRoutes = (): string[] => {
    const resources = availableResources['cruise'] || []
    const routes = new Set<string>()
    resources.forEach(r => {
      if (r.route) routes.add(r.route)
    })
    return Array.from(routes)
  }

  const getUniqueCities = (type: string): string[] => {
    const resources = availableResources[type] || []
    const typeConfig = RESOURCE_TYPES.find(t => t.key === type)
    const cityField = typeConfig?.cityField || 'city'
    
    const cities = new Set<string>()
    resources.forEach(r => {
      const city = r[cityField]
      if (city) cities.add(city)
    })
    return Array.from(cities).sort()
  }

  const handleAddResource = async () => {
    if (!addFormData.resource_id) {
      alert('Please select a resource')
      return
    }

    setSaving(true)
    try {
      const activeType = RESOURCE_TYPES.find(t => t.key === activeTab)
      const filteredResources = getFilteredResourcesForModal()
      const selectedResource = filteredResources.find(r => r.id === addFormData.resource_id)
      
      // Build resource name with location info
      let resourceName = selectedResource?.[activeType?.nameField || 'name'] || 'Unknown'
      
      // Add location context to the name
      if (activeTab === 'airport_staff' && selectedResource?.airport_location) {
        resourceName += ` (${selectedResource.airport_location})`
      } else if (activeTab === 'hotel_staff' && selectedResource?.hotel?.name) {
        resourceName += ` - ${selectedResource.hotel.name}`
      } else if (activeTab === 'cruise' && selectedResource?.route) {
        const routeLabels: Record<string, string> = {
          'luxor_aswan': 'Luxor → Aswan',
          'aswan_luxor': 'Aswan → Luxor',
          'round_trip': 'Round Trip'
        }
        resourceName += ` (${routeLabels[selectedResource.route] || selectedResource.route})`
      } else if (selectedResource?.city && ['guide', 'vehicle', 'hotel', 'restaurant'].includes(activeTab)) {
        resourceName += ` (${selectedResource.city})`
      }
      
      const response = await fetch('/api/itinerary-resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itinerary_id: itineraryId,
          resource_type: activeTab,
          resource_id: addFormData.resource_id,
          resource_name: resourceName,
          start_date: addFormData.start_date,
          end_date: addFormData.end_date,
          notes: addFormData.notes,
          quantity: addFormData.quantity,
          status: 'confirmed'
        })
      })

      const data = await response.json()

      if (data.success) {
        await fetchAssignedResources()
        await fetchConflicts()
        setShowAddModal(false)
        resetAddForm()
        if (onUpdate) onUpdate()
      } else {
        alert(data.error || 'Failed to add resource')
      }
    } catch (error) {
      console.error('Error adding resource:', error)
      alert('Failed to add resource')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveResource = async (resourceId: string) => {
    if (!confirm('Remove this resource assignment?')) return

    try {
      const response = await fetch(`/api/itinerary-resources?id=${resourceId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        await fetchAssignedResources()
        await fetchConflicts()
        if (onUpdate) onUpdate()
      } else {
        alert(data.error || 'Failed to remove resource')
      }
    } catch (error) {
      console.error('Error removing resource:', error)
      alert('Failed to remove resource')
    }
  }

  // WhatsApp notification handler
  const handleSendWhatsApp = async (resource: AssignedResource) => {
    const typeConfig = RESOURCE_TYPES.find(t => t.key === resource.resource_type)
    if (!typeConfig?.canNotify) return

    setSendingWhatsApp(resource.id)
    
    try {
      let endpoint = ''
      let body: any = {}

      if (resource.resource_type === 'guide') {
        endpoint = '/api/whatsapp/notify-guide'
        body = { 
          itineraryId, 
          guideId: resource.resource_id 
        }
      } else if (['restaurant', 'airport_staff', 'hotel_staff'].includes(resource.resource_type)) {
        endpoint = '/api/whatsapp/notify-resource'
        body = {
          itineraryId,
          resourceId: resource.resource_id,
          resourceType: resource.resource_type,
          resourceName: resource.resource_name,
          startDate: resource.start_date,
          endDate: resource.end_date,
          notes: resource.notes
        }
      } else {
        console.log('No WhatsApp endpoint for resource type:', resource.resource_type)
        return
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await response.json()

      if (data.success) {
        setWhatsAppSent(prev => new Set([...prev, resource.id]))
        setTimeout(() => {
          setWhatsAppSent(prev => {
            const newSet = new Set(prev)
            newSet.delete(resource.id)
            return newSet
          })
        }, 3000)
      } else {
        alert(data.error || 'Failed to send WhatsApp notification')
      }
    } catch (error) {
      console.error('Error sending WhatsApp:', error)
      alert('Failed to send WhatsApp notification')
    } finally {
      setSendingWhatsApp(null)
    }
  }

  const resetAddForm = () => {
    setAddFormData({
      resource_id: '',
      start_date: startDate,
      end_date: endDate,
      notes: '',
      quantity: 1
    })
    resetModalFilters()
  }

  const getResourcesForType = (type: string) => {
    return assignedResources.filter(r => r.resource_type === type)
  }

  const getConflictsForType = (type: string) => {
    return conflicts.filter(c => 
      assignedResources.some(r => r.resource_type === type && r.resource_id === c.resource_id)
    )
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          <span className="ml-3 text-gray-600">Loading resources...</span>
        </div>
      </div>
    )
  }

  const activeTypeConfig = RESOURCE_TYPES.find(t => t.key === activeTab)!
  const activeColor = COLOR_CLASSES[activeTypeConfig.color]
  const activeResources = getResourcesForType(activeTab)
  const activeConflicts = getConflictsForType(activeTab)
  const filteredAvailableResources = getFilteredResourcesForModal()
  const allAvailableForType = availableResources[activeTab] || []

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Resource Assignment</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {formatDate(startDate)} - {formatDate(endDate)} • {numTravelers} travelers
          </p>
        </div>
        {conflicts.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4" />
            <span className="font-medium">{conflicts.length} Conflict{conflicts.length > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <div className="flex min-w-max">
          {RESOURCE_TYPES.map((type) => {
            const Icon = type.icon
            const count = getResourcesForType(type.key).length
            const hasConflict = getConflictsForType(type.key).length > 0
            const isActive = activeTab === type.key
            const colorClass = COLOR_CLASSES[type.color]
            
            return (
              <button
                key={type.key}
                onClick={() => setActiveTab(type.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive 
                    ? `${colorClass.text} border-current` 
                    : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{type.label}</span>
                {count > 0 && (
                  <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                    isActive ? colorClass.light + ' ' + colorClass.text : 'bg-gray-100 text-gray-600'
                  }`}>
                    {count}
                  </span>
                )}
                {hasConflict && (
                  <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Conflicts Warning */}
        {activeConflicts.length > 0 && (
          <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-orange-800">Scheduling Conflicts Detected</p>
                <ul className="mt-2 text-sm text-orange-700 space-y-1">
                  {activeConflicts.map((conflict, idx) => (
                    <li key={idx}>
                      <strong>{conflict.resource_name}</strong> is also booked for {conflict.conflicting_itinerary} ({conflict.dates})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Assigned Resources List */}
        {activeResources.length > 0 ? (
          <div className="space-y-3 mb-4">
            {activeResources.map((resource) => {
              const typeConfig = RESOURCE_TYPES.find(t => t.key === resource.resource_type)
              const canNotify = typeConfig?.canNotify || false
              const isSending = sendingWhatsApp === resource.id
              const wasSent = whatsAppSent.has(resource.id)
              
              return (
                <div 
                  key={resource.id}
                  className={`p-4 rounded-lg border ${activeColor.border} ${activeColor.light}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{resource.resource_name}</span>
                        {resource.quantity > 1 && (
                          <span className="text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
                            ×{resource.quantity}
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          resource.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                          resource.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {resource.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(resource.start_date)}
                          {resource.end_date && resource.end_date !== resource.start_date && (
                            <> - {formatDate(resource.end_date)}</>
                          )}
                        </span>
                        {resource.notes && (
                          <span className="text-gray-500 truncate max-w-xs">• {resource.notes}</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      {/* WhatsApp Button */}
                      {canNotify && (
                        <button
                          onClick={() => handleSendWhatsApp(resource)}
                          disabled={isSending}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            wasSent 
                              ? 'bg-green-100 text-green-700'
                              : 'bg-[#25D366] text-white hover:bg-[#20BD5A]'
                          } disabled:opacity-50`}
                          title="Send WhatsApp notification"
                        >
                          {isSending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : wasSent ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <MessageCircle className="w-4 h-4" />
                          )}
                          <span className="hidden sm:inline">
                            {isSending ? 'Sending...' : wasSent ? 'Sent!' : 'Notify'}
                          </span>
                        </button>
                      )}
                      
                      {/* Remove Button */}
                      <button
                        onClick={() => handleRemoveResource(resource.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 mb-4">
            <activeTypeConfig.icon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No {activeTypeConfig.label.toLowerCase()} assigned yet</p>
          </div>
        )}

        {/* Add Button */}
        <button
          onClick={() => {
            resetAddForm()
            setShowAddModal(true)
          }}
          className={`w-full py-3 border-2 border-dashed rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors ${activeColor.border} ${activeColor.text} hover:${activeColor.light}`}
        >
          <Plus className="w-4 h-4" />
          Add {activeTypeConfig.label.slice(0, -1)}
        </button>

        {/* Available count */}
        <p className="text-xs text-gray-500 mt-2 text-center">
          {allAvailableForType.length} {activeTypeConfig.label.toLowerCase()} available
        </p>
      </div>

      {/* Add Resource Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Add {activeTypeConfig.label.slice(0, -1)}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              
              {/* ===== FILTER SECTION ===== */}
              
              {/* City Filter - for guides, vehicles, hotels, restaurants */}
              {activeTypeConfig.filterType === 'city' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <MapPin className="w-4 h-4 inline mr-1.5 text-gray-400" />
                    Filter by City
                  </label>
                  <select
                    value={modalCityFilter}
                    onChange={(e) => {
                      setModalCityFilter(e.target.value)
                      setAddFormData({ ...addFormData, resource_id: '' })
                    }}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  >
                    <option value="all">All Cities ({allAvailableForType.length})</option>
                    <option value="none">No City Assigned ({allAvailableForType.filter(r => !r[activeTypeConfig.cityField || 'city']).length})</option>
                     {getUniqueCities(activeTab).map((city) => {
                      const count = allAvailableForType.filter(r => r[activeTypeConfig.cityField || 'city'] === city).length
                      return (
                        <option key={city} value={city}>
                          {city} ({count})
                        </option>
                      )
                    })}
                  </select>
                </div>
              )}

              {/* Airport Location Filter - for airport staff */}
              {activeTypeConfig.filterType === 'airport' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Plane className="w-4 h-4 inline mr-1.5 text-gray-400" />
                    Filter by Airport
                  </label>
                  <select
                    value={modalAirportFilter}
                    onChange={(e) => {
                      setModalAirportFilter(e.target.value)
                      setAddFormData({ ...addFormData, resource_id: '' })
                    }}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  >
                    <option value="all">All Airports ({allAvailableForType.length})</option>
                    {getUniqueAirportLocations().map((location) => {
                      const count = allAvailableForType.filter(r => r.airport_location === location).length
                      return (
                        <option key={location} value={location}>
                          {location} ({count})
                        </option>
                      )
                    })}
                  </select>
                </div>
              )}

              {/* Hotel City Filter - for hotel staff */}
              {activeTypeConfig.filterType === 'hotelCity' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Hotel className="w-4 h-4 inline mr-1.5 text-gray-400" />
                    Filter by Hotel City
                  </label>
                  <select
                    value={modalCityFilter}
                    onChange={(e) => {
                      setModalCityFilter(e.target.value)
                      setAddFormData({ ...addFormData, resource_id: '' })
                    }}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  >
                    <option value="all">All Cities ({allAvailableForType.length})</option>
                    {getUniqueHotelCities().map((city) => {
                      const count = allAvailableForType.filter(r => r.hotel?.city === city).length
                      return (
                        <option key={city} value={city}>
                          {city} ({count})
                        </option>
                      )
                    })}
                  </select>
                </div>
              )}

              {/* Route Filter - for cruises */}
              {activeTypeConfig.filterType === 'route' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Anchor className="w-4 h-4 inline mr-1.5 text-gray-400" />
                    Filter by Route
                  </label>
                  <select
                    value={modalRouteFilter}
                    onChange={(e) => {
                      setModalRouteFilter(e.target.value)
                      setAddFormData({ ...addFormData, resource_id: '' })
                    }}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  >
                    <option value="all">All Routes ({allAvailableForType.length})</option>
                    {CRUISE_ROUTE_OPTIONS.filter(r => r.value !== 'all' && getUniqueCruiseRoutes().includes(r.value)).map((route) => {
                      const count = allAvailableForType.filter(r => r.route === route.value).length
                      return (
                        <option key={route.value} value={route.value}>
                          {route.label} ({count})
                        </option>
                      )
                    })}
                  </select>
                </div>
              )}

              {/* ===== RESOURCE SELECTION ===== */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select {activeTypeConfig.label.slice(0, -1)} *
                </label>
                <select
                  value={addFormData.resource_id}
                  onChange={(e) => setAddFormData({ ...addFormData, resource_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                >
                  <option value="">Choose...</option>
                  {filteredAvailableResources.map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {activeTypeConfig.displayField(resource)}
                    </option>
                  ))}
                </select>
                {filteredAvailableResources.length === 0 && (
                  <p className="text-sm text-orange-600 mt-2">
                    No {activeTypeConfig.label.toLowerCase()} found for this filter. Try selecting a different option.
                  </p>
                )}
                {(modalCityFilter !== 'all' || modalAirportFilter !== 'all' || modalRouteFilter !== 'all') && filteredAvailableResources.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Showing {filteredAvailableResources.length} of {allAvailableForType.length}
                  </p>
                )}
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={addFormData.start_date}
                    onChange={(e) => setAddFormData({ ...addFormData, start_date: e.target.value })}
                    min={startDate}
                    max={endDate}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={addFormData.end_date}
                    onChange={(e) => setAddFormData({ ...addFormData, end_date: e.target.value })}
                    min={addFormData.start_date}
                    max={endDate}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Quantity (for hotels/vehicles) */}
              {['hotel', 'vehicle'].includes(activeTab) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantity {activeTab === 'hotel' ? '(rooms)' : '(vehicles)'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={addFormData.quantity}
                    onChange={(e) => setAddFormData({ ...addFormData, quantity: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={addFormData.notes}
                  onChange={(e) => setAddFormData({ ...addFormData, notes: e.target.value })}
                  placeholder="Special requirements, room type, meal preferences..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddResource}
                disabled={saving || !addFormData.resource_id}
                className={`px-6 py-2 text-white rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${activeColor.bg} hover:opacity-90`}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Add {activeTypeConfig.label.slice(0, -1)}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}