import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const city = searchParams.get('city')
    const serviceType = searchParams.get('serviceType')
    const vehicleType = searchParams.get('vehicleType')
    const supplierId = searchParams.get('supplier_id')
    const activeOnly = searchParams.get('activeOnly') === 'true'

    // No supplier embed: transportation_rates.supplier_id has NO FK in the
    // live schema, so `supplier:supplier_id(...)` makes PostgREST reject the
    // whole query (PGRST200) — this GET silently returned an error and the
    // page showed an empty list. The denormalized supplier_name column covers
    // the display; a real FK + embed is a schema decision for later.
    let query = (createAdminClient() as any)
      .from('transportation_rates')
      .select('*')
      .eq('tenant_id', authResult.tenant_id)
      .order('city', { ascending: true })
      .order('service_type', { ascending: true })
      .order('vehicle_type', { ascending: true })

    if (city) query = query.eq('city', city)
    if (serviceType) query = query.eq('service_type', serviceType)
    if (vehicleType) query = query.eq('vehicle_type', vehicleType)
    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('Error fetching transportation rates:', error)
      return NextResponse.json({ error: 'Failed to fetch transportation rates' }, { status: 500 })
    }

    const transformedData = (data || []).map((rate: any) => ({
      ...rate,
      capacity_min: getMinCapacityForVehicle(rate.vehicle_type),
      base_rate_non: rate.base_rate_non_eur
    }))

    return NextResponse.json(transformedData)
  } catch (error) {
    console.error('Error in transportation rates GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function getMinCapacityForVehicle(vehicleType: string): number {
  const capacities: Record<string, number> = {
    'Sedan': 1, 'SUV': 1, '4x4': 1, 'Minivan': 3, 'Van': 9, 'Minibus': 15, 'Bus': 25
  }
  return capacities[vehicleType] || 1
}

// WIDE payload support: the route-first entry form sends `vehicles` —
// { sedan: { rate_eur, rate_non_eur, capacity_min, capacity_max }, … } —
// and one row per ROUTE is written with per-class columns, matching what the
// bulk importer produces and what the engine/grid expand. A class with no
// positive EUR rate writes NULLs (vehicle not offered), never a default.
export const VEHICLE_CLASSES = ['sedan', 'minivan', 'van', 'minibus', 'bus'] as const

interface VehiclePayloadEntry {
  rate_eur?: string | number
  rate_non_eur?: string | number
  capacity_min?: string | number
  capacity_max?: string | number
}

export function buildWideVehicleColumns(vehicles: Record<string, VehiclePayloadEntry> | undefined | null) {
  const cols: Record<string, number | null> = {}
  let offered = 0
  for (const cls of VEHICLE_CLASSES) {
    const v = vehicles?.[cls]
    const rate = Number(v?.rate_eur)
    if (v && Number.isFinite(rate) && rate > 0) {
      offered++
      cols[`${cls}_rate_eur`] = rate
      const nonEur = Number(v.rate_non_eur)
      cols[`${cls}_rate_non_eur`] = Number.isFinite(nonEur) && nonEur > 0 ? nonEur : null
      const capMin = Math.trunc(Number(v.capacity_min))
      const capMax = Math.trunc(Number(v.capacity_max))
      cols[`${cls}_capacity_min`] = Number.isFinite(capMin) ? capMin : null
      cols[`${cls}_capacity_max`] = Number.isFinite(capMax) ? capMax : null
    } else {
      cols[`${cls}_rate_eur`] = null
      cols[`${cls}_rate_non_eur`] = null
      cols[`${cls}_capacity_min`] = null
      cols[`${cls}_capacity_max`] = null
    }
  }
  return { cols, offered }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const body = await request.json()
    const isWide = body.vehicles && typeof body.vehicles === 'object'

    if (!body.city || !body.service_type || (!isWide && !body.vehicle_type)) {
      return NextResponse.json({ error: 'City, service type, and vehicle rates are required' }, { status: 400 })
    }

    let wideCols: Record<string, number | null> = {}
    if (isWide) {
      const { cols, offered } = buildWideVehicleColumns(body.vehicles)
      if (offered === 0) {
        return NextResponse.json({ error: 'At least one vehicle needs a EUR rate' }, { status: 400 })
      }
      wideCols = cols
    } else if (body.base_rate_eur === undefined || body.base_rate_eur === null) {
      return NextResponse.json({ error: 'EUR rate is required' }, { status: 400 })
    }

    const serviceCode = body.service_code ||
      (isWide
        ? `${body.city.toUpperCase().replace(/\s+/g, '-')}-${body.service_type.toUpperCase().replace(/_/g, '-')}${body.destination_city ? '-TO-' + body.destination_city.toUpperCase().replace(/\s+/g, '-') : ''}`
        : `${body.city.toUpperCase().replace(/\s+/g, '-')}-${body.service_type.toUpperCase().replace(/_/g, '-')}-${body.vehicle_type.toUpperCase()}`)

    // Real columns ONLY. The previous payload wrote service_code, season,
    // rate_valid_from/to, supplier_id/name and notes — NONE of which exist in
    // the live schema, so every create 400'd with PGRST204 and this page has
    // never successfully saved a rate. route_name is the real identifier
    // column (the grid's grouping key uses it).
    const newRate = {
      tenant_id: authResult.tenant_id,
      route_name: body.route_name || serviceCode,
      service_type: body.service_type,
      vehicle_type: isWide ? null : body.vehicle_type,
      capacity: isWide ? null : (body.capacity_max || 2),
      city: body.city,
      base_rate_eur: isWide ? null : (parseFloat(body.base_rate_eur) || 0),
      base_rate_non_eur: isWide ? null : (parseFloat(body.base_rate_non || body.base_rate_non_eur) || 0),
      ...wideCols,
      duration: body.duration || null,
      area: body.area || null,
      includes: body.includes || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
      origin_city: body.origin_city || null,
      destination_city: body.destination_city || null
    }

    const { data, error } = await (createAdminClient() as any)
      .from('transportation_rates')
      .insert([newRate])
      .select('*')
      .single()

    if (error) {
      console.error('Error creating transportation rate:', error)
      return NextResponse.json({ error: `Failed to create: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({
      ...data,
      capacity_min: getMinCapacityForVehicle(data.vehicle_type),
      base_rate_non: data.base_rate_non_eur
    }, { status: 201 })
  } catch (error) {
    console.error('Error in transportation rates POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}