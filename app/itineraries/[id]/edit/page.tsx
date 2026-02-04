'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/app/supabase'
import {
  GripVertical,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Save,
  Calculator,
  ArrowLeft,
  Check,
  MapPin,
  Moon,
  Plane,
  Utensils,
  Wine,
  Hotel,
  Droplets,
  Banknote,
  User,
  Ticket,
  Car,
  Search,
  Trash2,
  Edit3,
  DollarSign,
  FileText,
  Receipt,
  Download,
  Eye,
  Send
} from 'lucide-react'
import AddExpenseFromItinerary from '@/components/AddExpenseFromItinerary'
import GenerateDocumentsButton from '@/app/components/GenerateDocumentsButton'

// ============================================
// TYPES
// ============================================

interface Attraction {
  id: string
  activity_name: string
  city: string
  base_rate_eur: number
  base_rate_non_eur: number
}

interface DayService {
  guide: boolean
  lunch: boolean
  dinner: boolean
  hotel: boolean
  water: boolean
  tips: boolean
}

interface ItineraryDay {
  id: string
  day_number: number
  title: string
  city: string
  description: string
  overnight_city: string | null
  attractions: string[]
  services: DayService
  flight_from?: string
}

interface Itinerary {
  id: string
  itinerary_code: string
  client_id: string | null
  client_name: string
  client_email: string
  client_phone: string
  trip_name: string
  start_date: string
  end_date: string
  total_days: number
  num_adults: number
  num_children: number
  currency: string
  tier: string
  package_type: string
  status: string
  total_cost: number
  notes: string
}

interface ItineraryService {
  id: string
  itinerary_day_id: string
  day_number?: number
  service_type: string
  service_name: string
  supplier_id?: string | null
  supplier_name?: string | null
  quantity: number
  rate_eur: number
  rate_non_eur: number
  total_cost: number
  notes: string
  isNew?: boolean
  isDeleted?: boolean
}

interface Supplier {
  id: string
  name: string
  type: string
  city?: string
  contact_phone?: string
}

// ============================================
// CONSTANTS
// ============================================

const CITIES = [
  'Cairo', 'Giza', 'Luxor', 'Aswan', 'Alexandria',
  'Hurghada', 'Sharm El Sheikh', 'Dahab', 'Siwa', 'Marsa Alam', 'El Gouna'
]

const CITY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'Cairo': { bg: 'bg-olive-100', text: 'text-olive-700', dot: 'bg-olive-500' },
  'Giza': { bg: 'bg-olive-100', text: 'text-olive-700', dot: 'bg-olive-500' },
  'Luxor': { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  'Aswan': { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  'Alexandria': { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  'Hurghada': { bg: 'bg-pink-100', text: 'text-pink-700', dot: 'bg-pink-500' },
  'Sharm El Sheikh': { bg: 'bg-cyan-100', text: 'text-cyan-700', dot: 'bg-cyan-500' },
  'default': { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' }
}

const PACKAGE_TYPES = [
  { id: 'day-trips', name: 'Day Trips', icon: '🗓️', desc: 'No accommodation', advanced: false },
  { id: 'tours-only', name: 'Tours Only', icon: '🚐', desc: 'Client has own hotel', advanced: false },
  { id: 'land-package', name: 'Land Package', icon: '🏨', desc: 'Tours + Hotels', advanced: false },
  { id: 'cruise-package', name: 'Nile Cruise', icon: '🛳️', desc: 'Cruise only', advanced: false },
  { id: 'full-package', name: 'Full Package', icon: '✈️', desc: 'All inclusive + Airport', advanced: true },
  { id: 'cruise-land', name: 'Cruise + Land', icon: '🚢', desc: 'Nile cruise combo', advanced: true },
  { id: 'shore-excursions', name: 'Shore Excursions', icon: '⚓', desc: 'Port pickup, time-limited', advanced: true }
]

const TIERS = ['budget', 'standard', 'deluxe', 'luxury']

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  { value: 'sent', label: 'Sent', color: 'bg-blue-100 text-blue-700' },
  { value: 'confirmed', label: 'Confirmed', color: 'bg-green-100 text-green-700' },
  { value: 'completed', label: 'Completed', color: 'bg-purple-100 text-purple-700' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-700' }
]

const SERVICE_TYPES = [
  { value: 'transportation', label: 'Transportation', icon: '🚗' },
  { value: 'guide', label: 'Guide', icon: '👨‍🏫' },
  { value: 'entrance', label: 'Entrance Fee', icon: '🎫' },
  { value: 'meal', label: 'Meal', icon: '🍽️' },
  { value: 'accommodation', label: 'Accommodation', icon: '🏨' },
  { value: 'activity', label: 'Activity', icon: '🎭' },
  { value: 'tips', label: 'Tips', icon: '💰' },
  { value: 'supplies', label: 'Supplies', icon: '💧' },
  { value: 'service_fee', label: 'Service Fee', icon: '💼' },
]

// ============================================
// HELPER FUNCTIONS
// ============================================

const getCityColor = (city: string) => CITY_COLORS[city] || CITY_COLORS['default']
const generateId = () => `new-${Math.random().toString(36).substr(2, 9)}`
const getServiceIcon = (type: string) => {
  const icons: Record<string, string> = {
    accommodation: '🏨', transportation: '🚗', guide: '👨‍🏫', entrance: '🎫',
    meal: '🍽️', activity: '🎭', service_fee: '💼', tips: '💰', supplies: '💧'
  }
  return icons[type] || '📋'
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function ItineraryEditorPage() {
  const router = useRouter()
  const params = useParams()
  const itineraryId = params?.id as string
  const supabase = createClient()

  // ============================================
  // STATE
  // ============================================
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [showAdvancedPackages, setShowAdvancedPackages] = useState(false)
  const [draggedDay, setDraggedDay] = useState<string | null>(null)
  
  // Services & Pricing State
  const [services, setServices] = useState<ItineraryService[]>([])
  const [showServicesSection, setShowServicesSection] = useState(true)
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [servicesChanged, setServicesChanged] = useState(false)
  
  // Status & Invoice State
  const [existingInvoice, setExistingInvoice] = useState<{id: string, invoice_number: string} | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  
  // Attraction picker modal
  const [showAttractionModal, setShowAttractionModal] = useState(false)
  const [attractionModalDayId, setAttractionModalDayId] = useState<string | null>(null)
  const [attractions, setAttractions] = useState<Attraction[]>([])
  const [attractionSearch, setAttractionSearch] = useState('')
  const [attractionCityFilter, setAttractionCityFilter] = useState<string | null>(null)

  // Suppliers state
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierSearch, setSupplierSearch] = useState('')

  // ============================================
  // LOAD DATA
  // ============================================

  useEffect(() => {
    loadItinerary()
    loadAttractions()
    loadSuppliers()
  }, [itineraryId])

  const loadItinerary = async () => {
    if (!itineraryId) return

    try {
      // Load itinerary - use maybeSingle to handle RLS blocking
      const { data: itin, error: itinError } = await supabase
        .from('itineraries')
        .select('*')
        .eq('id', itineraryId)
        .maybeSingle()

      if (itinError) {
        console.error('Itinerary load error:', itinError)
        throw itinError
      }

      if (!itin) {
        // Debug: Check user auth and tenant
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        console.error('Auth debug - user:', user?.id, user?.email, 'error:', authError?.message)

        if (user) {
          // Check tenant membership
          const { data: membership, error: membershipError } = await supabase
            .from('tenant_members')
            .select('tenant_id, role, status')
            .eq('user_id', user.id)
            .maybeSingle()
          console.error('Tenant membership:', membership, 'error:', membershipError?.message)
        } else {
          console.error('User not authenticated!')
        }

        throw new Error('Itinerary not found or you do not have access')
      }

      setItinerary(itin)

      // Load days
      const { data: daysData, error: daysError } = await supabase
        .from('itinerary_days')
        .select('*')
        .eq('itinerary_id', itineraryId)
        .order('day_number')

      if (daysError) throw daysError

      const transformedDays: ItineraryDay[] = (daysData || []).map(day => ({
        id: day.id,
        day_number: day.day_number,
        title: day.title || '',
        city: day.city || 'Cairo',
        description: day.description || '',
        overnight_city: day.overnight_city,
        attractions: day.attractions || [],
        services: {
          guide: day.guide_required ?? true,
          lunch: day.lunch_included ?? true,
          dinner: day.dinner_included ?? false,
          hotel: day.hotel_included ?? (day.overnight_city !== null),
          water: true,
          tips: true
        },
        flight_from: day.flight_from
      }))

      setDays(transformedDays)

      // Load services for each day
      if (daysData && daysData.length > 0) {
        const dayIds = daysData.map(d => d.id)
        const { data: servicesData, error: servicesError } = await supabase
          .from('itinerary_services')
          .select('*')
          .in('itinerary_day_id', dayIds)
          .order('id')

        if (servicesError) {
          console.error('Error loading services:', servicesError)
        } else {
          // Add day_number to each service for display
          const servicesWithDayNumber = (servicesData || []).map(service => {
            const day = daysData.find(d => d.id === service.itinerary_day_id)
            return { ...service, day_number: day?.day_number || 1 }
          })
          setServices(servicesWithDayNumber)
        }
      }

    } catch (error: any) {
      console.error('Error loading itinerary:', error?.message || error?.code || JSON.stringify(error))
    } finally {
      setLoading(false)
    }
  }

  const loadAttractions = async () => {
    try {
      const { data, error } = await supabase
        .from('activity_rates')
        .select('id, activity_name, city, base_rate_eur, base_rate_non_eur')
        .eq('is_active', true)
        .order('city')
        .order('activity_name')

      if (error) throw error
      setAttractions(data || [])
    } catch (error) {
      console.error('Error loading attractions:', error)
    }
  }

  const loadSuppliers = async () => {
    try {
      console.log('Loading suppliers...')
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name, type, city, contact_phone')
        .order('type')
        .order('name')

      if (error) {
        console.error('Error loading suppliers:', error)
        return
      }
      
      console.log('Loaded suppliers:', data?.length || 0)
      setSuppliers(data || [])
    } catch (error) {
      console.error('Error loading suppliers:', error)
    }
  }

  // Helper to get relevant suppliers for a service type
  const getSuppliersForServiceType = (serviceType: string) => {
    const typeMapping: Record<string, string[]> = {
      transportation: ['transport', 'driver', 'dmc', 'ground_handler'],
      guide: ['guide', 'dmc', 'ground_handler'],
      accommodation: ['hotel'],
      entrance: ['activity_provider', 'attraction', 'dmc'],
      activity: ['activity_provider', 'attraction', 'dmc'],
      meal: ['restaurant', 'dmc', 'ground_handler'],
      cruise: ['cruise', 'cruise_line'],
      tips: ['dmc', 'ground_handler'],
      supplies: ['dmc', 'ground_handler'],
      service_fee: ['dmc', 'ground_handler', 'tour_operator']
    }
    
    const relevantTypes = typeMapping[serviceType] || []
    if (relevantTypes.length === 0) return suppliers
    
    return suppliers.filter(s => relevantTypes.includes(s.type))
  }

  const checkExistingInvoice = async () => {
    try {
      const response = await fetch(`/api/invoices?itineraryId=${itineraryId}`)
      if (response.ok) {
        const invoices = await response.json()
        if (invoices && invoices.length > 0) {
          setExistingInvoice({ id: invoices[0].id, invoice_number: invoices[0].invoice_number })
        }
      }
    } catch (error) {
      console.error('Error checking existing invoice:', error)
    }
  }

  const updateStatus = async (newStatus: string) => {
    if (!itinerary) return
    setUpdatingStatus(true)
    
    try {
      const { error } = await supabase
        .from('itineraries')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', itineraryId)

      if (error) throw error
      setItinerary({ ...itinerary, status: newStatus })
    } catch (error) {
      console.error('Error updating status:', error)
      alert('Failed to update status')
    } finally {
      setUpdatingStatus(false)
    }
  }

  // Load invoice on mount
  useEffect(() => {
    if (itineraryId) {
      checkExistingInvoice()
    }
  }, [itineraryId])

  // ============================================
  // DAY MANAGEMENT
  // ============================================

  const toggleDayExpanded = (dayId: string) => {
    const newExpanded = new Set(expandedDays)
    if (newExpanded.has(dayId)) {
      newExpanded.delete(dayId)
    } else {
      newExpanded.add(dayId)
    }
    setExpandedDays(newExpanded)
  }

  const updateDay = (dayId: string, updates: Partial<ItineraryDay>) => {
    setDays(prev => prev.map(day => day.id === dayId ? { ...day, ...updates } : day))
  }

  const updateDayService = (dayId: string, service: keyof DayService, value: boolean) => {
    setDays(prev => prev.map(day => 
      day.id === dayId ? { ...day, services: { ...day.services, [service]: value } } : day
    ))
  }

  const addAttraction = (dayId: string, attractionName: string) => {
    setDays(prev => prev.map(day => {
      if (day.id === dayId && !day.attractions.includes(attractionName)) {
        return { ...day, attractions: [...day.attractions, attractionName] }
      }
      return day
    }))
  }

  const removeAttraction = (dayId: string, attractionName: string) => {
    setDays(prev => prev.map(day => {
      if (day.id === dayId) {
        return { ...day, attractions: day.attractions.filter(a => a !== attractionName) }
      }
      return day
    }))
  }

  const addNewDay = () => {
    const lastDay = days[days.length - 1]
    const newDay: ItineraryDay = {
      id: generateId(),
      day_number: days.length + 1,
      title: 'New Day',
      city: lastDay?.city || 'Cairo',
      description: '',
      overnight_city: lastDay?.city || 'Cairo',
      attractions: [],
      services: { guide: true, lunch: true, dinner: false, hotel: true, water: true, tips: true }
    }
    setDays([...days, newDay])
    setExpandedDays(new Set([...expandedDays, newDay.id]))
    if (itinerary) setItinerary({ ...itinerary, total_days: days.length + 1 })
  }

  const removeDay = (dayId: string) => {
    const newDays = days.filter(d => d.id !== dayId)
    newDays.forEach((day, index) => { day.day_number = index + 1 })
    setDays(newDays)
    if (itinerary) setItinerary({ ...itinerary, total_days: newDays.length })
  }

  // ============================================
  // SERVICE MANAGEMENT
  // ============================================

  const updateService = (serviceId: string, updates: Partial<ItineraryService>) => {
    setServices(prev => prev.map(s => s.id === serviceId ? { ...s, ...updates } : s))
    setServicesChanged(true)
  }

  const addNewService = (dayId: string, dayNumber: number) => {
    const newService: ItineraryService = {
      id: generateId(),
      itinerary_day_id: dayId,
      day_number: dayNumber,
      service_type: 'activity',
      service_name: 'New Service',
      supplier_id: null,
      supplier_name: null,
      quantity: 1,
      rate_eur: 0,
      rate_non_eur: 0,
      total_cost: 0,
      notes: '',
      isNew: true
    }
    setServices([...services, newService])
    setEditingServiceId(newService.id)
    setServicesChanged(true)
  }

  const deleteService = (serviceId: string) => {
    const service = services.find(s => s.id === serviceId)
    if (service?.isNew) {
      // If it's a new service that hasn't been saved, just remove it
      setServices(services.filter(s => s.id !== serviceId))
    } else {
      // Mark existing service as deleted
      setServices(prev => prev.map(s => s.id === serviceId ? { ...s, isDeleted: true } : s))
    }
    setServicesChanged(true)
  }

  const calculateServiceTotal = (service: ItineraryService) => {
    const rate = service.rate_non_eur || service.rate_eur || 0
    return service.quantity * rate
  }

  const recalculateTotalCost = () => {
    const total = services
      .filter(s => !s.isDeleted)
      .reduce((sum, s) => sum + (s.total_cost || 0), 0)
    if (itinerary) {
      setItinerary({ ...itinerary, total_cost: total })
    }
  }

  // ============================================
  // DRAG AND DROP
  // ============================================

  const handleDragStart = (dayId: string) => setDraggedDay(dayId)
  const handleDragOver = (e: React.DragEvent) => e.preventDefault()

  const handleDrop = (targetDayId: string) => {
    if (!draggedDay || draggedDay === targetDayId) {
      setDraggedDay(null)
      return
    }
    const dragIndex = days.findIndex(d => d.id === draggedDay)
    const dropIndex = days.findIndex(d => d.id === targetDayId)
    const newDays = [...days]
    const [removed] = newDays.splice(dragIndex, 1)
    newDays.splice(dropIndex, 0, removed)
    newDays.forEach((day, index) => { day.day_number = index + 1 })
    setDays(newDays)
    setDraggedDay(null)
  }

  // ============================================
  // SAVE & CALCULATE
  // ============================================

  const saveDraft = async (): Promise<boolean> => {
    if (!itinerary) return false
    setSaving(true)

    try {
      console.log('💾 Saving draft...')

      // 1. Update itinerary metadata
      const totalCost = services
        .filter(s => !s.isDeleted)
        .reduce((sum, s) => sum + (s.total_cost || 0), 0)

      const { error: itinError } = await supabase
        .from('itineraries')
        .update({
          trip_name: itinerary.trip_name,
          tier: itinerary.tier,
          package_type: itinerary.package_type,
          total_days: days.length,
          total_cost: totalCost,
          status: itinerary.status, // Preserve the current status
          updated_at: new Date().toISOString()
        })
        .eq('id', itineraryId)

      if (itinError) throw itinError
      console.log('✅ Itinerary updated')

      // 2. Update each day
      for (const day of days) {
        const dayData = {
          day_number: day.day_number,
          title: day.title,
          city: day.city,
          description: day.description,
          overnight_city: day.overnight_city,
          attractions: day.attractions || [],
          guide_required: day.services?.guide ?? true,
          lunch_included: day.services?.lunch ?? true,
          dinner_included: day.services?.dinner ?? false,
          hotel_included: day.services?.hotel ?? false
        }

        const isRealUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(day.id)

        if (!isRealUUID) {
          const { data: newDay, error: insertError } = await supabase
            .from('itinerary_days')
            .insert({ ...dayData, itinerary_id: itineraryId })
            .select()
            .single()

          if (insertError) throw insertError
          if (newDay) day.id = newDay.id
          console.log(`✅ Day ${day.day_number} inserted`)
        } else {
          const { error: updateError } = await supabase
            .from('itinerary_days')
            .update(dayData)
            .eq('id', day.id)

          if (updateError) throw updateError
          console.log(`✅ Day ${day.day_number} updated`)
        }
      }

      // 3. Save services if changed
      if (servicesChanged) {
        console.log('💾 Saving services...')
        
        // Delete services marked for deletion
        const toDelete = services.filter(s => s.isDeleted && !s.isNew)
        for (const service of toDelete) {
          await supabase.from('itinerary_services').delete().eq('id', service.id)
          console.log(`🗑️ Deleted service ${service.id}`)
        }

        // Insert new services
        const toInsert = services.filter(s => s.isNew && !s.isDeleted)
        for (const service of toInsert) {
          const { isNew, isDeleted, day_number, ...serviceData } = service
          // Make sure we have a valid day ID
          const day = days.find(d => d.day_number === day_number)
          if (day) {
            const { data: newService, error } = await supabase
              .from('itinerary_services')
              .insert({ ...serviceData, itinerary_day_id: day.id })
              .select()
              .single()
            
            if (error) {
              console.error('Error inserting service:', error)
            } else if (newService) {
              service.id = newService.id
              service.isNew = false
              console.log(`✅ Service inserted: ${service.service_name}`)
            }
          }
        }

        // Update existing services
        const toUpdate = services.filter(s => !s.isNew && !s.isDeleted)
        for (const service of toUpdate) {
          const { isNew, isDeleted, day_number, ...serviceData } = service
          const { error } = await supabase
            .from('itinerary_services')
            .update(serviceData)
            .eq('id', service.id)
          
          if (error) {
            console.error('Error updating service:', error)
          } else {
            console.log(`✅ Service updated: ${service.service_name}`)
          }
        }

        // Clean up deleted services from state
        setServices(services.filter(s => !s.isDeleted))
        setServicesChanged(false)
      }

      console.log('🎉 Draft saved successfully!')
      return true

    } catch (error: any) {
      console.error('❌ Error saving draft:', error)
      alert(`Failed to save: ${error.message || 'Unknown error'}`)
      return false
    } finally {
      setSaving(false)
    }
  }

  const calculatePricing = async () => {
    if (!itinerary) return
    setCalculating(true)

    try {
      console.log('💾 Saving before calculating...')
      const saveSuccess = await saveDraft()
      
      if (!saveSuccess) {
        alert('Failed to save draft. Please try again.')
        setCalculating(false)
        return
      }

      console.log('📊 Calling calculate-pricing API...')

      const response = await fetch(`/api/itineraries/${itineraryId}/calculate-pricing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: itinerary.tier,
          package_type: itinerary.package_type,
          days: days.map(d => ({
            day_number: d.day_number,
            city: d.city,
            attractions: d.attractions,
            services: d.services,
            overnight_city: d.overnight_city
          })),
          num_adults: itinerary.num_adults,
          num_children: itinerary.num_children,
          nationality_type: 'non-eur'
        })
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('❌ Pricing API error:', result)
        throw new Error(result.error || 'Pricing calculation failed')
      }

      console.log('✅ Pricing calculated:', result)
      router.push(`/itineraries/${itineraryId}`)

    } catch (error: any) {
      console.error('❌ Error calculating pricing:', error)
      alert(`Failed to calculate pricing: ${error.message || 'Unknown error'}`)
    } finally {
      setCalculating(false)
    }
  }

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const citiesBreakdown = days.reduce((acc, day) => {
    acc[day.city] = (acc[day.city] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const totalAttractions = days.reduce((sum, day) => sum + day.attractions.length, 0)
  const totalLunches = days.filter(d => d.services.lunch).length
  const totalDinners = days.filter(d => d.services.dinner).length
  const totalHotelNights = days.filter(d => d.services.hotel && d.overnight_city).length

  const filteredAttractions = attractions.filter(a => {
    const matchesSearch = !attractionSearch || a.activity_name.toLowerCase().includes(attractionSearch.toLowerCase())
    const matchesCity = !attractionCityFilter || a.city === attractionCityFilter
    return matchesSearch && matchesCity
  })

  const servicesByDay = days.map(day => ({
    day,
    services: services.filter(s => s.itinerary_day_id === day.id && !s.isDeleted)
  }))

  const totalServicesCost = services
    .filter(s => !s.isDeleted)
    .reduce((sum, s) => sum + (s.total_cost || 0), 0)

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-olive-600"></div>
      </div>
    )
  }

  if (!itinerary) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Itinerary not found</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-5">
      {/* HEADER - Compact single row */}
      <div className="bg-white rounded-xl p-4 mb-5 shadow-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Left: Back, Status, Code, Client */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/itineraries/${itineraryId}`)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              title="Back to view"
            >
              <ArrowLeft size={18} className="text-gray-600" />
            </button>
            
            {/* Status Dropdown */}
            <select
              value={itinerary.status || 'draft'}
              onChange={(e) => updateStatus(e.target.value)}
              disabled={updatingStatus}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#647C47] flex-shrink-0 ${
                STATUS_OPTIONS.find(s => s.value === itinerary.status)?.color || 'bg-gray-100 text-gray-700'
              }`}
            >
              {STATUS_OPTIONS.map(status => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
            
            {/* Itinerary Code */}
            <h1 className="text-lg font-bold text-gray-900 whitespace-nowrap">{itinerary.itinerary_code}</h1>
            
            {/* Separator */}
            <span className="text-gray-300">|</span>
            
            {/* Client Info */}
            <span className="text-gray-600 text-sm whitespace-nowrap">
              {itinerary.client_name} • {days.length} days • {itinerary.num_adults} adults
              {itinerary.num_children > 0 && ` • ${itinerary.num_children} children`}
            </span>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Button */}
            <Link
              href={`/itineraries/${itineraryId}`}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 flex items-center gap-1.5"
            >
              <Eye size={14} />
              View
            </Link>

            {/* Invoice Button */}
            {existingInvoice ? (
              <Link
                href={`/invoices/${existingInvoice.id}`}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-1.5"
              >
                <Receipt size={14} />
                {existingInvoice.invoice_number}
              </Link>
            ) : (
              <button
                onClick={async () => {
                  const response = await fetch('/api/invoices', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      itinerary_id: itinerary.id,
                      client_name: itinerary.client_name,
                      client_email: itinerary.client_email,
                      line_items: [{
                        description: `${itinerary.trip_name} - ${itinerary.itinerary_code}`,
                        quantity: 1,
                        unit_price: itinerary.total_cost,
                        amount: itinerary.total_cost
                      }],
                      subtotal: itinerary.total_cost,
                      total_amount: itinerary.total_cost,
                      currency: itinerary.currency || 'EUR',
                      issue_date: new Date().toISOString().split('T')[0],
                      due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                    })
                  })
                  if (response.ok) {
                    const invoice = await response.json()
                    router.push(`/invoices/${invoice.id}`)
                  }
                }}
                className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 flex items-center gap-1.5"
              >
                <Receipt size={14} />
                Invoice
              </button>
            )}

            {/* Documents Dropdown */}
            <GenerateDocumentsButton 
              itineraryId={itinerary.id}
              itineraryCode={itinerary.itinerary_code}
            />

            {/* Contract Link */}
            <Link
              href={`/documents/contract/${itinerary.id}`}
              className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-1.5"
            >
              <FileText size={14} />
              Contract
            </Link>

            {/* Add Expense */}
            <AddExpenseFromItinerary 
              itineraryId={itinerary.id}
              itineraryCode={itinerary.itinerary_code}
              clientName={itinerary.client_name}
            />

            {/* Calculate Pricing */}
            <button
              onClick={calculatePricing}
              disabled={calculating || saving}
              className="px-3 py-1.5 bg-[#647C47] text-white rounded-lg text-sm font-semibold hover:bg-[#4a5c35] flex items-center gap-1.5 disabled:opacity-50"
            >
              <Calculator size={14} />
              {calculating ? 'Calculating...' : 'Calculate'}
            </button>
          </div>
        </div>
      </div>

      {/* WORKFLOW STATUS BAR */}
      <div className="bg-white rounded-xl p-4 mb-5 shadow-sm flex items-center gap-2">
        <div className="flex items-center gap-2 px-4 py-2 bg-[#e8ede3] rounded-full">
          <span className="w-6 h-6 bg-[#647C47] rounded-full flex items-center justify-center text-white text-xs font-bold">
            <Check size={14} />
          </span>
          <span className="text-sm font-semibold text-[#4a5c35]">AI Generated</span>
        </div>
        <div className="w-10 h-0.5 bg-[#647C47]"></div>
        <div className="flex items-center gap-2 px-4 py-2 bg-[#f4f7f1] rounded-full border-2 border-[#647C47]">
          <span className="w-6 h-6 bg-[#647C47] rounded-full flex items-center justify-center text-white text-xs font-bold">2</span>
          <span className="text-sm font-semibold text-[#647C47]">Edit Content</span>
        </div>
        <div className="w-10 h-0.5 bg-gray-200"></div>
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full">
          <span className="w-6 h-6 bg-gray-400 rounded-full flex items-center justify-center text-white text-xs font-bold">3</span>
          <span className="text-sm font-medium text-gray-500">Calculate Pricing</span>
        </div>
        <div className="w-10 h-0.5 bg-gray-200"></div>
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full">
          <span className="w-6 h-6 bg-gray-400 rounded-full flex items-center justify-center text-white text-xs font-bold">4</span>
          <span className="text-sm font-medium text-gray-500">Download PDF</span>
        </div>
      </div>

      {/* PACKAGE TYPE SELECTOR */}
      <div className="bg-white rounded-xl p-5 mb-5 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Package Type</h3>
          <button
            onClick={() => setShowAdvancedPackages(!showAdvancedPackages)}
            className="text-sm text-gray-500 hover:text-[#647C47] flex items-center gap-1"
          >
            {showAdvancedPackages ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {showAdvancedPackages ? 'Hide' : 'Show'} advanced options
          </button>
        </div>
        
        <div className="grid grid-cols-3 gap-3 mb-3">
          {PACKAGE_TYPES.filter(p => !p.advanced).map(pkg => (
            <button
              key={pkg.id}
              onClick={() => setItinerary({ ...itinerary, package_type: pkg.id })}
              className={`p-4 rounded-xl border-2 text-center transition-all ${
                itinerary.package_type === pkg.id
                  ? 'border-[#647C47] bg-[#e8ede3]'
                  : 'border-gray-200 hover:border-[#b8c9a8] hover:bg-[#f4f7f1]'
              }`}
            >
              <div className="text-2xl mb-1">{pkg.icon}</div>
              <div className={`text-sm font-semibold ${itinerary.package_type === pkg.id ? 'text-[#4a5c35]' : 'text-gray-700'}`}>
                {pkg.name}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{pkg.desc}</div>
            </button>
          ))}
        </div>
        
        {showAdvancedPackages && (
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-200">
            {PACKAGE_TYPES.filter(p => p.advanced).map(pkg => (
              <button
                key={pkg.id}
                onClick={() => setItinerary({ ...itinerary, package_type: pkg.id })}
                className={`p-4 rounded-xl border-2 text-center transition-all ${
                  itinerary.package_type === pkg.id
                    ? 'border-[#647C47] bg-[#e8ede3]'
                    : 'border-gray-200 hover:border-[#b8c9a8] hover:bg-[#f4f7f1]'
                }`}
              >
                <div className="text-2xl mb-1">{pkg.icon}</div>
                <div className={`text-sm font-semibold ${itinerary.package_type === pkg.id ? 'text-[#4a5c35]' : 'text-gray-700'}`}>
                  {pkg.name}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{pkg.desc}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* MAIN CONTENT - TWO COLUMNS */}
      <div className="grid grid-cols-[1fr_380px] gap-5">
        {/* LEFT COLUMN - Days Editor */}
        <div>
          {/* Trip Name */}
          <div className="bg-white rounded-xl p-5 mb-4 shadow-sm">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
              Trip Name
            </label>
            <input
              type="text"
              value={itinerary.trip_name}
              onChange={(e) => setItinerary({ ...itinerary, trip_name: e.target.value })}
              className="w-full px-4 py-3 text-lg font-semibold border border-gray-200 rounded-lg focus:outline-none focus:border-[#647C47]"
            />
          </div>

          {/* Section Header */}
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-base font-semibold text-gray-900">Itinerary Days</h2>
            <span className="text-xs text-gray-500">💡 Drag to reorder • Click Edit to expand</span>
          </div>

          {/* Days List */}
          {days.map((day) => (
            <div
              key={day.id}
              draggable
              onDragStart={() => handleDragStart(day.id)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(day.id)}
              className={`bg-white rounded-xl mb-3 shadow-sm border-2 transition-all ${
                draggedDay === day.id
                  ? 'border-dashed border-[#647C47] rotate-1 shadow-lg'
                  : 'border-transparent hover:shadow-md'
              }`}
            >
              {/* Day Header */}
              <div className="p-4 flex items-center gap-3 cursor-grab">
                <GripVertical className="text-gray-400" size={18} />
                <div className="w-9 h-9 bg-[#647C47] rounded-lg flex items-center justify-center text-white font-bold text-sm">
                  {day.day_number}
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={day.title}
                    onChange={(e) => updateDay(day.id, { title: e.target.value })}
                    className="w-full border-none text-[15px] font-semibold text-gray-900 bg-transparent focus:outline-none"
                    placeholder="Day title..."
                  />
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${getCityColor(day.city).bg} ${getCityColor(day.city).text}`}>
                      📍 {day.city}
                    </span>
                    {day.flight_from && <span className="flex items-center gap-1"><Plane size={12} /> from {day.flight_from}</span>}
                    {day.overnight_city && <span className="flex items-center gap-1"><Moon size={12} /> {day.overnight_city}</span>}
                  </div>
                </div>
                <button
                  onClick={() => toggleDayExpanded(day.id)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    expandedDays.has(day.id)
                      ? 'bg-[#647C47] text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {expandedDays.has(day.id) ? 'Collapse' : 'Edit'}
                </button>
              </div>

              {/* Day Content (Expanded) */}
              {expandedDays.has(day.id) && (
                <div className="p-5 border-t border-gray-200">
                  {/* City Selector */}
                  <div className="mb-4">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                      City
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {CITIES.map(city => (
                        <button
                          key={city}
                          onClick={() => updateDay(day.id, { city, overnight_city: city })}
                          className={`px-3 py-2 rounded-md text-sm transition-all ${
                            day.city === city
                              ? 'bg-[#647C47] text-white'
                              : 'bg-white border border-gray-200 text-gray-600 hover:border-[#b8c9a8]'
                          }`}
                        >
                          {city}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div className="mb-4">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                      Description
                    </label>
                    <textarea
                      value={day.description}
                      onChange={(e) => updateDay(day.id, { description: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#647C47] resize-y"
                      placeholder="Describe this day..."
                    />
                  </div>

                  {/* Attractions */}
                  <div className="mb-4">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                      Attractions / Sites
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {day.attractions.map((attr, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#e8ede3] border border-[#b8c9a8] rounded-full text-sm text-[#4a5c35]"
                        >
                          <Ticket size={14} />
                          {attr}
                          <button onClick={() => removeAttraction(day.id, attr)} className="text-red-500 hover:text-red-700 ml-1">
                            <X size={14} />
                          </button>
                        </span>
                      ))}
                      <button
                        onClick={() => {
                          setAttractionModalDayId(day.id)
                          setAttractionCityFilter(day.city)
                          setShowAttractionModal(true)
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-dashed border-gray-300 rounded-full text-sm text-gray-500 hover:border-[#647C47] hover:text-[#647C47]"
                      >
                        <Plus size={14} />
                        Add attraction
                      </button>
                    </div>
                  </div>

                  {/* Services Grid */}
                  <div className="grid grid-cols-6 gap-3 p-4 bg-gray-50 rounded-lg">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={day.services.guide} onChange={(e) => updateDayService(day.id, 'guide', e.target.checked)} className="w-4 h-4 accent-[#647C47]" />
                      <User size={14} /> Guide
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={day.services.lunch} onChange={(e) => updateDayService(day.id, 'lunch', e.target.checked)} className="w-4 h-4 accent-[#647C47]" />
                      <Utensils size={14} /> Lunch
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={day.services.dinner} onChange={(e) => updateDayService(day.id, 'dinner', e.target.checked)} className="w-4 h-4 accent-[#647C47]" />
                      <Wine size={14} /> Dinner
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={day.services.hotel} onChange={(e) => updateDayService(day.id, 'hotel', e.target.checked)} className="w-4 h-4 accent-[#647C47]" disabled={day.day_number === days.length} />
                      <Hotel size={14} /> Hotel
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-400 cursor-not-allowed">
                      <input type="checkbox" checked disabled className="w-4 h-4" />
                      <Droplets size={14} /> Water
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-400 cursor-not-allowed">
                      <input type="checkbox" checked disabled className="w-4 h-4" />
                      <Banknote size={14} /> Tips
                    </label>
                  </div>

                  {days.length > 1 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <button onClick={() => removeDay(day.id)} className="text-sm text-red-500 hover:text-red-700">
                        Remove this day
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Add Day Button */}
          <button
            onClick={addNewDay}
            className="w-full p-4 bg-white border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 hover:border-[#647C47] hover:text-[#647C47] flex items-center justify-center gap-2 mb-5"
          >
            <Plus size={18} />
            Add Another Day
          </button>

          {/* ============================================ */}
          {/* SERVICES & PRICING SECTION */}
          {/* ============================================ */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <button
              onClick={() => setShowServicesSection(!showServicesSection)}
              className="w-full px-5 py-4 flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-white" size={20} />
                </div>
                <div className="text-left">
                  <h3 className="text-base font-semibold text-gray-900">Services & Pricing</h3>
                  <p className="text-xs text-gray-500">
                    {services.filter(s => !s.isDeleted).length} services • Total: {itinerary.currency} {totalServicesCost.toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {servicesChanged && (
                  <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded">
                    Unsaved changes
                  </span>
                )}
                {showServicesSection ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </div>
            </button>

            {showServicesSection && (
              <div className="p-5">
                {services.filter(s => !s.isDeleted).length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm mb-2">No services added yet</p>
                    <p className="text-xs">Click "Calculate Pricing" to auto-generate services from your itinerary</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {servicesByDay.map(({ day, services: dayServices }) => (
                      <div key={day.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 bg-[#647C47] rounded flex items-center justify-center text-white text-xs font-bold">
                              {day.day_number}
                            </span>
                            <span className="font-medium text-gray-900 text-sm">{day.title}</span>
                            <span className={`px-2 py-0.5 rounded text-xs ${getCityColor(day.city).bg} ${getCityColor(day.city).text}`}>
                              {day.city}
                            </span>
                          </div>
                          <button
                            onClick={() => addNewService(day.id, day.day_number)}
                            className="text-xs text-[#647C47] hover:text-[#4a5c35] font-medium flex items-center gap-1"
                          >
                            <Plus size={14} /> Add Service
                          </button>
                        </div>

                        {dayServices.length > 0 ? (
                          <div className="divide-y divide-gray-100">
                            {dayServices.map(service => (
                              <div
                                key={service.id}
                                className={`px-4 py-3 ${
                                  editingServiceId === service.id ? 'bg-amber-50' : 'hover:bg-gray-50'
                                }`}
                              >
                                {editingServiceId === service.id ? (
                                  // Edit Mode - Three rows for clear layout
                                  <div className="space-y-3">
                                    {/* Row 1: Type and Name */}
                                    <div className="flex items-center gap-2">
                                      <span className="text-lg w-8">{getServiceIcon(service.service_type)}</span>
                                      <select
                                        value={service.service_type}
                                        onChange={(e) => updateService(service.id, { service_type: e.target.value })}
                                        className="w-36 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-[#647C47]"
                                      >
                                        {SERVICE_TYPES.map(t => (
                                          <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                      </select>
                                      <input
                                        type="text"
                                        value={service.service_name}
                                        onChange={(e) => updateService(service.id, { service_name: e.target.value })}
                                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-[#647C47]"
                                        placeholder="Service name"
                                      />
                                    </div>
                                    
                                    {/* Row 2: Supplier Selection - Full Width */}
                                    <div className="flex items-center gap-2 pl-10">
                                      <label className="text-xs font-medium text-gray-600 whitespace-nowrap">
                                        📦 Supplier:
                                      </label>
                                      <select
                                        value={service.supplier_id || ''}
                                        onChange={(e) => {
                                          const supplierId = e.target.value || null
                                          const supplier = suppliers.find(s => s.id === supplierId)
                                          updateService(service.id, { 
                                            supplier_id: supplierId,
                                            supplier_name: supplier?.name || null
                                          })
                                        }}
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-[#647C47] bg-white"
                                      >
                                        <option value="">-- No Supplier (Optional) --</option>
                                        {getSuppliersForServiceType(service.service_type).length > 0 && (
                                          <optgroup label={`Recommended for ${service.service_type}`}>
                                            {getSuppliersForServiceType(service.service_type).map(s => (
                                              <option key={s.id} value={s.id}>
                                                {s.name} {s.city ? `(${s.city})` : ''} - {s.type}
                                              </option>
                                            ))}
                                          </optgroup>
                                        )}
                                        {suppliers.filter(s => !getSuppliersForServiceType(service.service_type).find(r => r.id === s.id)).length > 0 && (
                                          <optgroup label="All Other Suppliers">
                                            {suppliers.filter(s => !getSuppliersForServiceType(service.service_type).find(r => r.id === s.id)).map(s => (
                                              <option key={s.id} value={s.id}>
                                                {s.name} {s.city ? `(${s.city})` : ''} - {s.type}
                                              </option>
                                            ))}
                                          </optgroup>
                                        )}
                                      </select>
                                    </div>

                                    {/* Row 3: Qty, Rate, Total, Actions */}
                                    <div className="flex items-center gap-3 pl-10">
                                      <div className="flex items-center gap-1">
                                        <label className="text-xs text-gray-500">Qty:</label>
                                        <input
                                          type="number"
                                          value={service.quantity}
                                          onChange={(e) => {
                                            const qty = parseInt(e.target.value) || 1
                                            const total = qty * (service.rate_non_eur || service.rate_eur || 0)
                                            updateService(service.id, { quantity: qty, total_cost: total })
                                          }}
                                          className="w-16 px-2 py-1.5 border border-gray-300 rounded text-sm text-center focus:outline-none focus:border-[#647C47]"
                                          min="1"
                                        />
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <label className="text-xs text-gray-500">Rate:</label>
                                        <input
                                          type="number"
                                          value={service.rate_non_eur || service.rate_eur || 0}
                                          onChange={(e) => {
                                            const rate = parseFloat(e.target.value) || 0
                                            updateService(service.id, { 
                                              rate_non_eur: rate, 
                                              rate_eur: rate,
                                              total_cost: service.quantity * rate 
                                            })
                                          }}
                                          className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm text-right focus:outline-none focus:border-[#647C47]"
                                          step="0.01"
                                          placeholder="0.00"
                                        />
                                      </div>
                                      <div className="flex-1"></div>
                                      <div className="text-right font-semibold text-gray-900 text-lg">
                                        {itinerary.currency} {service.total_cost?.toFixed(2) || '0.00'}
                                      </div>
                                      <button
                                        onClick={() => setEditingServiceId(null)}
                                        className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 flex items-center gap-1"
                                        title="Done editing"
                                      >
                                        <Check size={14} /> Done
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  // View Mode
                                  <div className="flex items-center gap-3">
                                    <span className="text-lg">{getServiceIcon(service.service_type)}</span>
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-gray-900">{service.service_name}</p>
                                      <p className="text-xs text-gray-500">
                                        <span className="capitalize">{service.service_type.replace('_', ' ')}</span>
                                        {service.quantity > 1 && ` • Qty: ${service.quantity}`}
                                        {service.supplier_name && (
                                          <span className="ml-2 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-medium">
                                            📦 {service.supplier_name}
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-sm font-semibold text-gray-900">
                                        {itinerary.currency} {service.total_cost?.toFixed(2) || '0.00'}
                                      </span>
                                      <button
                                        onClick={() => setEditingServiceId(service.id)}
                                        className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-gray-100 rounded"
                                        title="Edit"
                                      >
                                        <Edit3 size={14} />
                                      </button>
                                      <button
                                        onClick={() => deleteService(service.id)}
                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                                        title="Delete"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="px-4 py-6 text-center text-gray-400 text-sm">
                            No services for this day
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Total Cost Bar */}
                <div className="mt-5 p-4 bg-[#e8ede3] rounded-lg flex items-center justify-between">
                  <span className="font-semibold text-[#4a5c35]">Total Cost</span>
                  <span className="text-xl font-bold text-[#4a5c35]">
                    {itinerary.currency} {totalServicesCost.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN - Summary & Actions */}
        <div>
          {/* Trip Summary */}
          <div className="bg-white rounded-xl p-5 mb-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Trip Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Duration</span>
                <span className="font-semibold text-gray-900">{days.length} days</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Travelers</span>
                <span className="font-semibold text-gray-900">
                  {itinerary.num_adults} adults
                  {itinerary.num_children > 0 && `, ${itinerary.num_children} children`}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tier</span>
                <select
                  value={itinerary.tier}
                  onChange={(e) => setItinerary({ ...itinerary, tier: e.target.value })}
                  className="font-semibold text-gray-900 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs border-none focus:outline-none"
                >
                  {TIERS.map(tier => (
                    <option key={tier} value={tier}>{tier.toUpperCase()}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Package</span>
                <span className="font-semibold text-gray-900">
                  {PACKAGE_TYPES.find(p => p.id === itinerary.package_type)?.name || 'Land Package'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Start Date</span>
                <span className="font-semibold text-gray-900">{itinerary.start_date}</span>
              </div>
            </div>

            {/* Cities Breakdown */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-3">
                Cities Involved
              </label>
              {Object.entries(citiesBreakdown).map(([city, count]) => (
                <div key={city} className="flex items-center justify-between py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${getCityColor(city).dot}`}></span>
                    {city}
                  </span>
                  <span className="text-gray-500">{count} day{count > 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action Box */}
          <div className="bg-[#f4f7f1] rounded-xl p-5 border border-[#b8c9a8]">
            <p className="text-sm text-[#4a5c35] mb-4">
              ✨ Edit content and pricing, then save or recalculate from rate tables.
            </p>
            <button
              onClick={saveDraft}
              disabled={saving || calculating}
              className="w-full py-3 bg-[#647C47] text-white rounded-lg text-sm font-semibold hover:bg-[#4a5c35] mb-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={calculatePricing}
              disabled={calculating || saving}
              className="w-full py-3 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Calculator size={16} />
              {calculating ? 'Calculating...' : 'Recalculate from Rates'}
            </button>
            <p className="text-xs text-gray-500 mt-3 text-center">
              Recalculating will regenerate services from your rate tables
            </p>
          </div>

          {/* Tips */}
          <div className="mt-4 p-4 bg-[#e8ede3] rounded-lg border border-[#b8c9a8]">
            <h4 className="text-sm font-semibold text-[#4a5c35] mb-2">💡 Tips</h4>
            <ul className="text-xs text-[#647C47] space-y-1.5 list-disc pl-4">
              <li>Edit services directly in the pricing section</li>
              <li>Add/remove services for each day</li>
              <li>Changes are saved when you click Save Draft</li>
              <li>Calculate Pricing regenerates from rate tables</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ATTRACTION PICKER MODAL */}
      {showAttractionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAttractionModal(false)}>
          <div className="bg-white rounded-2xl w-[550px] max-h-[80vh] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold">Add Attraction</h3>
              <button onClick={() => setShowAttractionModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-4">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search attractions..."
                  value={attractionSearch}
                  onChange={(e) => setAttractionSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#647C47]"
                />
              </div>
              
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => setAttractionCityFilter(null)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    !attractionCityFilter ? 'bg-[#647C47] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-[#647C47]'
                  }`}
                >
                  All Cities
                </button>
                {[...new Set(attractions.map(a => a.city))].map(city => (
                  <button
                    key={city}
                    onClick={() => setAttractionCityFilter(city)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      attractionCityFilter === city ? 'bg-[#647C47] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-[#647C47]'
                    }`}
                  >
                    {city}
                  </button>
                ))}
              </div>

              <div className="max-h-[400px] overflow-y-auto space-y-2">
                {filteredAttractions.map(attr => {
                  const currentDay = days.find(d => d.id === attractionModalDayId)
                  const isAdded = currentDay?.attractions.includes(attr.activity_name)
                  
                  return (
                    <div
                      key={attr.id}
                      onClick={() => {
                        if (!isAdded && attractionModalDayId) {
                          addAttraction(attractionModalDayId, attr.activity_name)
                        }
                      }}
                      className={`p-3.5 rounded-lg border flex justify-between items-center transition-all ${
                        isAdded ? 'border-green-300 bg-green-50 cursor-default' : 'border-gray-200 hover:border-[#b8c9a8] hover:bg-[#f4f7f1] cursor-pointer'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-sm text-gray-900">
                          {attr.activity_name}
                          {isAdded && <Check size={14} className="inline ml-2 text-green-600" />}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">📍 {attr.city}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-[#647C47]">€{attr.base_rate_eur} / €{attr.base_rate_non_eur}</div>
                        <div className="text-[11px] text-gray-500">EUR / non-EUR</div>
                      </div>
                    </div>
                  )
                })}
                {filteredAttractions.length === 0 && <p className="text-center text-gray-500 py-8">No attractions found</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}