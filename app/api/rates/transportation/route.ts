import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// ============================================
// TRANSPORTATION RATES API - Full CRUD
// File: app/api/rates/transportation/route.ts
// ============================================

// Valid enum values
const SERVICE_TYPES = [
  'airport_transfer',
  'city_transfer', 
  'day_tour',
  'dinner_transfer',
  'intercity_transfer',
  'sound_light_transfer'
] as const

const DURATIONS = ['full_day', 'half_day', 'one_way'] as const

const VEHICLE_TYPES = ['Sedan', 'Minivan', 'Van', 'Minibus', 'Bus', 'Horse Carriage'] as const

const AREAS = [
  'east_bank',
  'west_bank', 
  'pyramids',
  'islamic_cairo',
  'old_cairo',
  'temple_visit',
  'nubian_village'
] as const

// GET - List transportation rates with filters
export async function GET(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - protects pricing data
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const { supabase } = authResult

    const searchParams = request.nextUrl.searchParams
    const city = searchParams.get('city')
    const serviceType = searchParams.get('service_type')
    const duration = searchParams.get('duration')
    const area = searchParams.get('area')
    const vehicleType = searchParams.get('vehicle_type')
    const originCity = searchParams.get('origin_city')
    const destinationCity = searchParams.get('destination_city')
    const supplierId = searchParams.get('supplier_id')
    const activeOnly = searchParams.get('active_only') !== 'false' // Default true

    // ✅ MULTI-TENANT: RLS policies automatically filter by tenant_id
    // See migration: 007_create_tours_templates_tables.sql
    // Only returns rates belonging to authenticated user's tenant
    let query = supabase
      .from('transportation_rates')
      .select(`
        *,
        supplier:suppliers(id, name, city, contact_phone, contact_email)
      `)
      .order('city')
      .order('service_type')
      .order('duration')
      .order('area')
      .order('vehicle_type')

    // Apply filters
    if (city) query = query.ilike('city', `%${city}%`)
    if (serviceType) query = query.eq('service_type', serviceType)
    if (duration) query = query.eq('duration', duration)
    if (area) query = query.eq('area', area)
    if (vehicleType) query = query.eq('vehicle_type', vehicleType)
    if (originCity) query = query.ilike('origin_city', `%${originCity}%`)
    if (destinationCity) query = query.ilike('destination_city', `%${destinationCity}%`)
    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('GET transportation_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Also return enum options for UI dropdowns
    return NextResponse.json({ 
      success: true, 
      data: data || [],
      options: {
        serviceTypes: SERVICE_TYPES,
        durations: DURATIONS,
        vehicleTypes: VEHICLE_TYPES,
        areas: AREAS
      }
    })
  } catch (error: any) {
    console.error('GET transportation_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// POST - Create new transportation rate
export async function POST(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - protects pricing data
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const { supabase } = authResult

    const body = await request.json()

    // Generate service code if not provided
    const serviceCode = body.service_code || generateServiceCode(body)

    // Generate route name if not provided
    const routeName = body.route_name || generateRouteName(body)

    // ✅ MULTI-TENANT: tenant_id is auto-populated by database trigger
    // See migration: 007_create_tours_templates_tables.sql (creates auto_set_tenant_id trigger)
    // The trigger automatically sets tenant_id from the authenticated user's session
    // RLS policies enforce that users can only insert rates for their own tenant
    const newRate = {
      service_code: serviceCode,
      service_type: body.service_type,
      vehicle_type: body.vehicle_type,
      city: body.city || null,
      origin_city: body.origin_city || null,
      destination_city: body.destination_city || null,
      duration: body.duration || null,
      area: body.area || null,
      route_name: routeName,
      base_rate_eur: parseFloat(body.base_rate_eur) || 0,
      base_rate_non_eur: parseFloat(body.base_rate_non_eur) || parseFloat(body.base_rate_eur) || 0,
      capacity_min: body.capacity_min ? parseInt(body.capacity_min) : null,
      capacity_max: body.capacity_max ? parseInt(body.capacity_max) : null,
      season: body.season || null,
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      supplier_id: body.supplier_id || null,
      supplier_name: body.supplier_name || null,
      notes: body.notes || null,
      is_active: body.is_active !== false
    }

    // Validate required fields
    if (!newRate.service_type) {
      return NextResponse.json({ success: false, error: 'service_type is required' }, { status: 400 })
    }
    if (!newRate.vehicle_type) {
      return NextResponse.json({ success: false, error: 'vehicle_type is required' }, { status: 400 })
    }
    if (newRate.service_type === 'intercity_transfer') {
      if (!newRate.origin_city || !newRate.destination_city) {
        return NextResponse.json({ 
          success: false, 
          error: 'origin_city and destination_city are required for intercity transfers' 
        }, { status: 400 })
      }
    } else if (!newRate.city) {
      return NextResponse.json({ success: false, error: 'city is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('transportation_rates')
      .insert(newRate)
      .select('*')
      .single()

    if (error) {
      console.error('POST transportation_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error: any) {
    console.error('POST transportation_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// PUT - Update transportation rate
export async function PUT(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - protects pricing data
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const { supabase } = authResult

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
    }

    // Regenerate route_name if relevant fields changed
    if (updates.city || updates.service_type || updates.duration || updates.area || updates.vehicle_type) {
      // Fetch current record to merge with updates
      const { data: current } = await supabase
        .from('transportation_rates')
        .select('*')
        .eq('id', id)
        .single()

      if (current) {
        const merged = { ...current, ...updates }
        updates.route_name = updates.route_name || generateRouteName(merged)
      }
    }

    // Parse numeric fields
    if (updates.base_rate_eur !== undefined) {
      updates.base_rate_eur = parseFloat(updates.base_rate_eur) || 0
    }
    if (updates.base_rate_non_eur !== undefined) {
      updates.base_rate_non_eur = parseFloat(updates.base_rate_non_eur) || 0
    }
    if (updates.capacity_min !== undefined) {
      updates.capacity_min = updates.capacity_min ? parseInt(updates.capacity_min) : null
    }
    if (updates.capacity_max !== undefined) {
      updates.capacity_max = updates.capacity_max ? parseInt(updates.capacity_max) : null
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('transportation_rates')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT transportation_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT transportation_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// DELETE - Delete transportation rate
export async function DELETE(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - protects pricing data
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const { supabase } = authResult

    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('transportation_rates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('DELETE transportation_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE transportation_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateServiceCode(data: any): string {
  const parts: string[] = []

  if (data.service_type === 'intercity_transfer') {
    parts.push('INTERCITY')
    parts.push(data.origin_city?.substring(0, 3).toUpperCase() || 'XXX')
    parts.push(data.destination_city?.substring(0, 3).toUpperCase() || 'XXX')
  } else {
    parts.push(data.city?.toUpperCase().replace(/\s+/g, '') || 'CITY')
    
    if (data.area) {
      parts.push(data.area.toUpperCase().replace(/_/g, ''))
    }
    
    if (data.duration === 'half_day') {
      parts.push('HALF')
    } else if (data.duration === 'full_day') {
      parts.push('FULL')
    }
  }

  parts.push(data.vehicle_type?.toUpperCase().replace(/\s+/g, '') || 'VEHICLE')

  return parts.join('-')
}

function generateRouteName(data: any): string {
  if (data.service_type === 'intercity_transfer') {
    return `${data.origin_city || 'Origin'} to ${data.destination_city || 'Destination'} - ${data.vehicle_type || 'Vehicle'}`
  }

  const parts: string[] = []
  parts.push(data.city || 'City')

  if (data.area) {
    const areaNames: Record<string, string> = {
      'east_bank': 'East Bank',
      'west_bank': 'West Bank',
      'pyramids': 'Pyramids',
      'islamic_cairo': 'Islamic Cairo',
      'old_cairo': 'Old Cairo',
      'temple_visit': 'Temple Visit',
      'nubian_village': 'Nubian Village'
    }
    parts.push(areaNames[data.area] || data.area)
  }

  if (data.duration === 'half_day') {
    parts.push('Half Day')
  } else if (data.duration === 'full_day') {
    parts.push('Full Day')
  }

  return `${parts.join(' ')} - ${data.vehicle_type || 'Vehicle'}`
}