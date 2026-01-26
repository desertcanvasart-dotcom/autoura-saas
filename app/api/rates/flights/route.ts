import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// ============================================
// FLIGHT RATES API - Full CRUD
// File: app/api/rates/flights/route.ts
// ============================================

// Valid enum values
const FLIGHT_TYPES = ['domestic', 'international'] as const
const CABIN_CLASSES = ['economy', 'business', 'first'] as const

const AIRLINES = [
  { code: 'MS', name: 'EgyptAir' },
  { code: 'NP', name: 'Nile Air' },
  { code: 'SM', name: 'Air Cairo' },
  { code: 'FZ', name: 'FlyDubai' },
  { code: 'EK', name: 'Emirates' },
  { code: 'QR', name: 'Qatar Airways' },
  { code: 'TK', name: 'Turkish Airlines' },
  { code: 'LH', name: 'Lufthansa' },
  { code: 'BA', name: 'British Airways' },
  { code: 'AF', name: 'Air France' },
  { code: 'KL', name: 'KLM' },
  { code: 'EY', name: 'Etihad' },
  { code: 'SV', name: 'Saudia' },
  { code: 'RJ', name: 'Royal Jordanian' },
  { code: 'ME', name: 'Middle East Airlines' },
  { code: 'G9', name: 'Air Arabia' }
] as const

const FREQUENCIES = [
  'daily',
  'weekdays',
  'weekends',
  'mon_wed_fri',
  'tue_thu_sat',
  'weekly',
  'charter'
] as const

// GET - List flight rates with filters
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
    const routeFrom = searchParams.get('route_from')
    const routeTo = searchParams.get('route_to')
    const airline = searchParams.get('airline')
    const flightType = searchParams.get('flight_type')
    const cabinClass = searchParams.get('cabin_class')
    const supplierId = searchParams.get('supplier_id')
    const activeOnly = searchParams.get('active_only') !== 'false' // Default true

    // ✅ MULTI-TENANT: RLS policies automatically filter by tenant_id
    // See migration: 007_create_tours_templates_tables.sql
    // Only returns rates belonging to authenticated user's tenant
    let query = supabase
      .from('flight_rates')
      .select(`
        *,
        supplier:suppliers(id, name, city, contact_phone, contact_email)
      `)
      .order('route_from')
      .order('route_to')
      .order('airline')
      .order('cabin_class')

    // Apply filters
    if (routeFrom) query = query.ilike('route_from', `%${routeFrom}%`)
    if (routeTo) query = query.ilike('route_to', `%${routeTo}%`)
    if (airline) query = query.ilike('airline', `%${airline}%`)
    if (flightType) query = query.eq('flight_type', flightType)
    if (cabinClass) query = query.eq('cabin_class', cabinClass)
    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('GET flight_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Also return enum options for UI dropdowns
    return NextResponse.json({ 
      success: true, 
      data: data || [],
      options: {
        flightTypes: FLIGHT_TYPES,
        cabinClasses: CABIN_CLASSES,
        airlines: AIRLINES,
        frequencies: FREQUENCIES
      }
    })
  } catch (error: any) {
    console.error('GET flight_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// POST - Create new flight rate
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
    const routeName = body.route_name || `${body.route_from} to ${body.route_to}`

    // Get airline code
    const airlineCode = body.airline_code || getAirlineCode(body.airline)

    // ✅ MULTI-TENANT: tenant_id is auto-populated by database trigger
    // See migration: 007_create_tours_templates_tables.sql (creates auto_set_tenant_id trigger)
    // The trigger automatically sets tenant_id from the authenticated user's session
    // RLS policies enforce that users can only insert rates for their own tenant
    const newRate = {
      service_code: serviceCode,
      route_from: body.route_from,
      route_to: body.route_to,
      route_name: routeName,
      airline: body.airline,
      airline_code: airlineCode,
      flight_number: body.flight_number || null,
      flight_type: body.flight_type || 'domestic',
      cabin_class: body.cabin_class || 'economy',
      departure_time: body.departure_time || null,
      arrival_time: body.arrival_time || null,
      duration_minutes: body.duration_minutes ? parseInt(body.duration_minutes) : null,
      frequency: body.frequency || null,
      base_rate_eur: parseFloat(body.base_rate_eur) || 0,
      base_rate_non_eur: parseFloat(body.base_rate_non_eur) || parseFloat(body.base_rate_eur) || 0,
      tax_eur: parseFloat(body.tax_eur) || 0,
      tax_non_eur: parseFloat(body.tax_non_eur) || 0,
      baggage_kg: body.baggage_kg ? parseInt(body.baggage_kg) : 23,
      carry_on_kg: body.carry_on_kg ? parseInt(body.carry_on_kg) : 7,
      season: body.season || null,
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      supplier_id: body.supplier_id || null,
      supplier_name: body.supplier_name || null,
      notes: body.notes || null,
      is_active: body.is_active !== false
    }

    // Validate required fields
    if (!newRate.route_from) {
      return NextResponse.json({ success: false, error: 'route_from is required' }, { status: 400 })
    }
    if (!newRate.route_to) {
      return NextResponse.json({ success: false, error: 'route_to is required' }, { status: 400 })
    }
    if (!newRate.airline) {
      return NextResponse.json({ success: false, error: 'airline is required' }, { status: 400 })
    }
    if (newRate.route_from === newRate.route_to) {
      return NextResponse.json({ success: false, error: 'route_from and route_to must be different' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('flight_rates')
      .insert(newRate)
      .select('*')
      .single()

    if (error) {
      console.error('POST flight_rates error:', error)
      
      // Handle unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json({ 
          success: false, 
          error: 'A flight rate with this service code already exists' 
        }, { status: 409 })
      }
      
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error: any) {
    console.error('POST flight_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// PUT - Update flight rate (by ID in body)
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

    // Regenerate route_name if route fields changed
    if (updates.route_from || updates.route_to) {
      const { data: current } = await supabase
        .from('flight_rates')
        .select('*')
        .eq('id', id)
        .single()

      if (current) {
        const merged = { ...current, ...updates }
        updates.route_name = updates.route_name || `${merged.route_from} to ${merged.route_to}`
      }
    }

    // Update airline_code if airline changed
    if (updates.airline) {
      updates.airline_code = getAirlineCode(updates.airline)
    }

    // Parse numeric fields
    if (updates.base_rate_eur !== undefined) {
      updates.base_rate_eur = parseFloat(updates.base_rate_eur) || 0
    }
    if (updates.base_rate_non_eur !== undefined) {
      updates.base_rate_non_eur = parseFloat(updates.base_rate_non_eur) || 0
    }
    if (updates.tax_eur !== undefined) {
      updates.tax_eur = parseFloat(updates.tax_eur) || 0
    }
    if (updates.tax_non_eur !== undefined) {
      updates.tax_non_eur = parseFloat(updates.tax_non_eur) || 0
    }
    if (updates.duration_minutes !== undefined) {
      updates.duration_minutes = updates.duration_minutes ? parseInt(updates.duration_minutes) : null
    }
    if (updates.baggage_kg !== undefined) {
      updates.baggage_kg = updates.baggage_kg ? parseInt(updates.baggage_kg) : null
    }
    if (updates.carry_on_kg !== undefined) {
      updates.carry_on_kg = updates.carry_on_kg ? parseInt(updates.carry_on_kg) : null
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('flight_rates')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT flight_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT flight_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// DELETE - Delete flight rate (by query param)
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
      .from('flight_rates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('DELETE flight_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE flight_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getAirlineCode(airlineName: string): string {
  const airline = AIRLINES.find(a => 
    a.name.toLowerCase() === airlineName.toLowerCase()
  )
  return airline?.code || airlineName.substring(0, 2).toUpperCase()
}

function generateServiceCode(data: any): string {
  const fromCode = getCityCode(data.route_from)
  const toCode = getCityCode(data.route_to)
  const airlineCode = getAirlineCode(data.airline)
  const classCode = (data.cabin_class || 'economy').substring(0, 3).toUpperCase()
  
  return `FLT-${airlineCode}-${fromCode}-${toCode}-${classCode}`
}

function getCityCode(city: string): string {
  if (!city) return 'XXX'
  
  // Common Egyptian city codes
  const cityCodeMap: Record<string, string> = {
    'cairo': 'CAI',
    'alexandria': 'ALX',
    'aswan': 'ASW',
    'luxor': 'LXR',
    'hurghada': 'HRG',
    'sharm el sheikh': 'SSH',
    'marsa alam': 'RMF',
    'abu simbel': 'ABS',
    'borg el arab': 'HBE',
    'sohag': 'HMB',
    'asyut': 'ATZ',
    'taba': 'TCP'
  }
  
  const lowerCity = city.toLowerCase()
  
  // Check for known cities
  for (const [name, code] of Object.entries(cityCodeMap)) {
    if (lowerCity.includes(name)) {
      return code
    }
  }
  
  // Extract code if in format "City (CODE)"
  const codeMatch = city.match(/\(([A-Z]{3})\)/)
  if (codeMatch) {
    return codeMatch[1]
  }
  
  // Fallback: first 3 letters
  return city.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase()
}