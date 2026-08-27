import { NextRequest, NextResponse } from 'next/server'
import { rateCurrencyWriteField } from '@/lib/rates/rate-currency'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { buildWideVehicleColumns } from '../route'

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
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { id } = await params

    const { data, error } = await (createAdminClient() as any)
      .from('transportation_rates')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)
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
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { id } = await params
    const body = await request.json()
    const isWide = body.vehicles && typeof body.vehicles === 'object'

    // Validate required fields (wide payloads carry rates per vehicle class
    // instead of a single vehicle_type/base_rate pair)
    if (!body.city || !body.service_type || (!isWide && !body.vehicle_type)) {
      return NextResponse.json(
        { error: 'City, service type, and vehicle rates are required' },
        { status: 400 }
      )
    }

    let wideCols: Record<string, number | null> = {}
    if (isWide) {
      const { cols, offered } = buildWideVehicleColumns(body.vehicles)
      if (offered === 0) {
        return NextResponse.json({ error: 'At least one vehicle needs a EUR rate' }, { status: 400 })
      }
      wideCols = cols
    } else if (body.base_rate_eur === undefined || body.base_rate_eur === null) {
      return NextResponse.json(
        { error: 'EUR rate is required' },
        { status: 400 }
      )
    }

    // Real columns ONLY — the previous payload wrote service_code, season,
    // rate_valid_from/to, supplier fields and notes, none of which exist in
    // the live schema (PGRST204 on every update).
    const updateData = {
      ...rateCurrencyWriteField(body),
      route_name: body.route_name || body.service_code || null,
      service_type: body.service_type,
      vehicle_type: isWide ? null : body.vehicle_type,
      capacity: isWide ? null : (body.capacity_max || 2),
      city: body.city,
      origin_city: body.origin_city || null,
      destination_city: body.destination_city || null,
      base_rate_eur: isWide ? null : (parseFloat(body.base_rate_eur) || 0),
      base_rate_non_eur: isWide ? null : (parseFloat(body.base_rate_non || body.base_rate_non_eur) || 0),
      ...wideCols,
      duration: body.duration || null,
      area: body.area || null,
      includes: body.includes || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
      updated_at: new Date().toISOString()
    }



    const { data, error } = await (createAdminClient() as any)
      .from('transportation_rates')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)
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
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { id } = await params

    const { error } = await createAdminClient()
      .from('transportation_rates')
      .delete()
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)

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