// ============================================
// /api/resources/transportation — routes and the vehicles priced on them
// ============================================
// GET  — every transportation_rates row for the tenant (one row per vehicle
//        per route; the page groups them into routes)
// POST — save a ROUTE: { route fields…, vehicles: [{ vehicle_type, rate_eur,
//        rate_non_eur?, capacity_min?, capacity_max? }], existing_ids?: [] }
//        Writes one row per offered vehicle, updating the route's existing
//        rows (existing_ids) in place and deleting the ones no longer
//        offered. Vehicle types are the tenant's vocabulary keys; labels are
//        accepted and resolved. Migration 337: the tall shape is the only
//        shape — there are no per-class columns any more.

import { NextRequest, NextResponse } from 'next/server'
import { rateCurrencyWriteField } from '@/lib/rates/rate-currency'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { loadVocabularyForTenant } from '@/lib/vocabulary-server'
import { resolveVocabularyKey } from '@/lib/vocabulary'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const searchParams = request.nextUrl.searchParams
    const city = searchParams.get('city')
    const serviceType = searchParams.get('serviceType')
    const vehicleType = searchParams.get('vehicleType')
    const supplierId = searchParams.get('supplier_id')
    const activeOnly = searchParams.get('activeOnly') === 'true'

    let query = (createAdminClient() as any)
      .from('transportation_rates')
      .select('*')
      .eq('tenant_id', authResult.tenant_id)
      .order('city', { ascending: true })
      .order('service_type', { ascending: true })
      .order('route_name', { ascending: true })
      .order('capacity_max', { ascending: true })
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
    return NextResponse.json((data || []).map((rate: any) => ({ ...rate, base_rate_non: rate.base_rate_non_eur })))
  } catch (error) {
    console.error('Error in transportation rates GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export interface VehiclePayload {
  vehicle_type: string
  rate_eur?: string | number
  rate_non_eur?: string | number
  capacity_min?: string | number
  capacity_max?: string | number
}

/** Route-level code — one per route, no vehicle suffix. */
function routeCode(body: Record<string, any>): string {
  const city = String(body.city || '').toUpperCase().replace(/\s+/g, '-')
  const type = String(body.service_type || '').toUpperCase().replace(/_/g, '-')
  const dest = body.destination_city ? '-TO-' + String(body.destination_city).toUpperCase().replace(/\s+/g, '-') : ''
  return `${city}-${type}${dest}`
}

/**
 * Save a route: one row per offered vehicle. `existingIds` are the route's
 * current rows (from the page's grouping); a vehicle already on the route is
 * updated, a new one inserted, a vehicle left blank deleted.
 */
export async function saveRoute(tenantId: string, body: Record<string, any>, existingIds: string[]): Promise<{ status: number; json: Record<string, unknown> }> {
  const admin = createAdminClient() as any
  if (!body.city || !body.service_type) {
    return { status: 400, json: { success: false, error: 'City and service type are required' } }
  }
  // A legacy single-vehicle payload is one vehicle.
  const vehiclesIn: VehiclePayload[] = Array.isArray(body.vehicles)
    ? body.vehicles
    : body.vehicle_type ? [{ vehicle_type: body.vehicle_type, rate_eur: body.base_rate_eur, rate_non_eur: body.base_rate_non_eur ?? body.base_rate_non, capacity_min: body.capacity_min, capacity_max: body.capacity_max }] : []

  const vocab = await loadVocabularyForTenant(admin, tenantId, 'vehicle_type')
  const offered: Array<{ key: string; rate_eur: number; rate_non_eur: number; capacity_min: number | null; capacity_max: number | null }> = []
  for (const v of vehiclesIn) {
    const rate = Number(v.rate_eur)
    if (!Number.isFinite(rate) || rate <= 0) continue // blank = not offered on this route
    const key = vocab.length ? resolveVocabularyKey(vocab, v.vehicle_type) : String(v.vehicle_type || '').trim().toLowerCase()
    if (!key) return { status: 400, json: { success: false, error: `Vehicle "${v.vehicle_type}" is not in your vehicle list (Settings → Your vocabulary)` } }
    const nonEur = Number(v.rate_non_eur)
    const min = Math.trunc(Number(v.capacity_min)); const max = Math.trunc(Number(v.capacity_max))
    if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
      return { status: 400, json: { success: false, error: `${key}: capacity min cannot exceed max` } }
    }
    if (offered.some(o => o.key === key)) return { status: 400, json: { success: false, error: `Vehicle "${key}" is listed twice` } }
    offered.push({
      key, rate_eur: rate,
      rate_non_eur: Number.isFinite(nonEur) && nonEur > 0 ? nonEur : rate,
      capacity_min: Number.isFinite(min) && min > 0 ? min : null,
      capacity_max: Number.isFinite(max) && max > 0 ? max : null,
    })
  }
  if (offered.length === 0) return { status: 400, json: { success: false, error: 'At least one vehicle needs a rate' } }

  const routeFields = {
    ...rateCurrencyWriteField(body),
    route_name: body.route_name || routeCode(body),
    service_type: body.service_type,
    city: body.city,
    origin_city: body.origin_city || null,
    destination_city: body.destination_city || null,
    duration: body.duration || null,
    area: body.area || null,
    includes: body.includes || null,
    is_active: body.is_active !== undefined ? body.is_active : true,
    // The transport company (migration 355) — one per route, on every row.
    supplier_id: body.supplier_id || null,
    updated_at: new Date().toISOString(),
  }

  // The route's current rows, by vehicle key.
  let existing: any[] = []
  if (existingIds.length) {
    const { data } = await admin.from('transportation_rates').select('*').eq('tenant_id', tenantId).in('id', existingIds)
    existing = data ?? []
  }
  const byKey = new Map<string, any>(existing.map(r => [String(r.vehicle_type || '').toLowerCase(), r]))
  const out: any[] = []

  for (const v of offered) {
    const row = {
      ...routeFields,
      vehicle_type: v.key,
      base_rate_eur: v.rate_eur,
      base_rate_non_eur: v.rate_non_eur,
      capacity_min: v.capacity_min,
      capacity_max: v.capacity_max,
    }
    const current = byKey.get(v.key)
    if (current) {
      const { data, error } = await admin.from('transportation_rates').update(row).eq('id', current.id).eq('tenant_id', tenantId).select().single()
      if (error) return { status: 500, json: { success: false, error: `Failed to update ${v.key}: ${error.message}` } }
      out.push(data); byKey.delete(v.key)
    } else {
      const { data, error } = await admin.from('transportation_rates').insert({ ...row, tenant_id: tenantId }).select().single()
      if (error) {
        if (error.code === '23505') return { status: 409, json: { success: false, error: `This route already prices "${v.key}" — edit that route instead of adding it again` } }
        return { status: 500, json: { success: false, error: `Failed to add ${v.key}: ${error.message}` } }
      }
      out.push(data)
    }
  }
  // Vehicles no longer offered on this route.
  const gone = [...byKey.values()].map(r => r.id)
  if (gone.length) {
    const { error } = await admin.from('transportation_rates').delete().eq('tenant_id', tenantId).in('id', gone)
    if (error) return { status: 500, json: { success: false, error: `Failed to remove vehicles: ${error.message}` } }
  }
  return { status: 200, json: { success: true, data: out.map(r => ({ ...r, base_rate_non: r.base_rate_non_eur })) } }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const body = await request.json()
    const existingIds = Array.isArray(body.existing_ids) ? body.existing_ids.map(String) : []
    const { status, json } = await saveRoute(authResult.tenant_id!, body, existingIds)
    return NextResponse.json(json, { status: status === 200 && existingIds.length === 0 ? 201 : status })
  } catch (error) {
    console.error('Error in transportation rates POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
