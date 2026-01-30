import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Lazy-initialized Supabase admin client (avoids build-time errors when env vars unavailable)
let _supabaseAdmin: ReturnType<typeof createClient> | null = null

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

// Helper function to get min capacity based on vehicle type
function getMinCapacityForVehicle(vehicleType: string): number {
  const vehicleCapacities: Record<string, number> = {
    'Sedan': 1,
    'SUV': 1,
    '4x4': 1,
    'Minivan': 3,
    'Van': 9,
    'Minibus': 15,
    'Bus': 25
  }
  return vehicleCapacities[vehicleType] || 1
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await (getSupabaseAdmin() as any)
      .from('transportation_rates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching transportation rate:', error)
      return NextResponse.json({ error: 'Transportation rate not found' }, { status: 404 })
    }

    // Transform to match frontend expectations
    const transformedData = {
      ...data,
      capacity_min: getMinCapacityForVehicle(data.vehicle_type),
      base_rate_non: data.base_rate_non_eur
    }

    return NextResponse.json(transformedData)
  } catch (error) {
    console.error('Error in transportation rate GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Validate required fields
    if (!body.city || !body.vehicle_type || !body.service_type) {
      return NextResponse.json(
        { error: 'City, vehicle type, and service type are required' },
        { status: 400 }
      )
    }

    // Validate base_rate_eur
    if (body.base_rate_eur === undefined || body.base_rate_eur === null) {
      return NextResponse.json(
        { error: 'EUR rate is required' },
        { status: 400 }
      )
    }

    // Build update object matching ACTUAL database columns
    const updateData = {
      service_code: body.service_code,
      service_type: body.service_type,
      vehicle_type: body.vehicle_type,
      // capacity_min does NOT exist in database - don't include
      capacity_max: body.capacity_max || 2,
      city: body.city,
      base_rate_eur: parseFloat(body.base_rate_eur) || 0,
      // FIXED: Use correct column name base_rate_non_eur
      base_rate_non_eur: parseFloat(body.base_rate_non || body.base_rate_non_eur) || 0,
      season: body.season || null,
      rate_valid_from: body.rate_valid_from,
      rate_valid_to: body.rate_valid_to,
      supplier_name: body.supplier_name || null,
      notes: body.notes || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
      updated_at: new Date().toISOString()
    }

    console.log('Updating transportation rate:', id, updateData)

    const { data, error } = await (getSupabaseAdmin() as any)
      .from('transportation_rates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating transportation rate:', error)
      return NextResponse.json(
        { error: `Failed to update transportation rate: ${error.message}` },
        { status: 500 }
      )
    }

    // Transform response to match frontend expectations
    const transformedData = {
      ...data,
      capacity_min: getMinCapacityForVehicle(data.vehicle_type),
      base_rate_non: data.base_rate_non_eur
    }

    return NextResponse.json(transformedData)
  } catch (error) {
    console.error('Error in transportation rate PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { error } = await getSupabaseAdmin()
      .from('transportation_rates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting transportation rate:', error)
      return NextResponse.json(
        { error: `Failed to delete transportation rate: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in transportation rate DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}