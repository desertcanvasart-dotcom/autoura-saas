import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'
import { gateVolume, incrementVolumeUsage, loadUsageAnchor } from '@/lib/usage-enforcement'
import { roleDenied } from '@/lib/api-role-gate'
import type { TablesInsert } from '@/types/database.types'
import { effectiveItineraryTotal, type PricedService } from '@/lib/itinerary-client-total'

// Generate unique itinerary code
function generateItineraryCode(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(Math.random() * 9000) + 1000
  return `ITN-${year}-${random}`
}

// Calculate days between two dates
function calculateTotalDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 1
  const start = new Date(startDate)
  const end = new Date(endDate)
  const diffTime = Math.abs(end.getTime() - start.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays + 1 // Include both start and end day
}

/**
 * GET /api/itineraries
 * List all itineraries for the authenticated user's tenant
 * RLS policies automatically filter by tenant_id
 */
export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS will automatically filter by tenant
    const supabase = await createAuthenticatedClient()

    const { data, error } = await supabase
      .from('itineraries')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Database error:', error)
      throw error
    }

    // effective_total: what the itinerary page shows — the services' client
    // total when there are priced services, else the stored total_cost (a
    // cache that can be 0 or stale: the list read "EUR 0" for priced trips).
    const list = data || []
    const servicesBy = new Map<string, PricedService[]>()
    const ids = list.map(r => r.id)
    for (let i = 0; i < ids.length; i += 200) {
      const { data: svc } = await supabase
        .from('itinerary_services')
        .select('itinerary_id, total_cost, client_price')
        .in('itinerary_id', ids.slice(i, i + 200))
      for (const row of svc ?? []) {
        if (!row.itinerary_id) continue
        const bucket = servicesBy.get(row.itinerary_id) ?? []
        bucket.push(row)
        servicesBy.set(row.itinerary_id, bucket)
      }
    }
    const rows = list.map(itinerary => ({
      ...itinerary,
      effective_total: effectiveItineraryTotal(itinerary, servicesBy.get(itinerary.id) ?? []),
    }))

    return NextResponse.json({
      success: true,
      data: rows
    })
  } catch (error: any) {
    console.error('❌ API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/itineraries
 * Create a new itinerary for the authenticated user's tenant
 * RLS policies will validate tenant_id
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const denied = roleDenied(authResult.role, 'staff')
    if (denied) return denied

    const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    // Plan limit: itineraries per year. Warns at 80%, allows overage past
    // 100%, stops at 125% — see lib/usage-grace.ts. Checked BEFORE creating so
    // a blocked request never leaves a half-made record.
    const gate = await gateVolume(supabase, tenant_id!, 'itineraries', 'itineraries this year')
    if (!gate.ok) return gate.response!

    // Only the fields a new trip is made of. The body went to the insert
    // whole, so a request could set its own status, totals, profit, owner,
    // share token or created_at — or another tenant's client.
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const text = (k: string) => (typeof raw[k] === 'string' && (raw[k] as string).trim() ? (raw[k] as string).trim() : null)
    const count = (k: string, min: number, fallback: number) => {
      const n = Math.floor(Number(raw[k]))
      return Number.isFinite(n) && n >= min ? n : fallback
    }
    const start_date = text('start_date')
    const end_date = text('end_date')
    const body: TablesInsert<'itineraries'> = {
      tenant_id: tenant_id!,
      itinerary_code: generateItineraryCode(),
      status: 'draft',
      client_name: text('client_name'),
      client_email: text('client_email'),
      client_phone: text('client_phone'),
      trip_name: text('trip_name'),
      start_date,
      end_date,
      total_days: start_date && end_date ? Math.max(calculateTotalDays(start_date, end_date), 1) : 1,
      num_adults: count('num_adults', 1, 1),
      num_children: count('num_children', 0, 0),
      currency: text('currency') || 'EUR',
      notes: text('notes'),
      ...(text('tier') ? { tier: text('tier')! } : {}),
      ...(text('package_type') ? { package_type: text('package_type')! } : {}),
      total_cost: 0,
    }

    const { data, error } = await supabase
      .from('itineraries')
      .insert([body])
      .select()
      .single()

    if (error) {
      console.error('Error creating itinerary:', error)
      throw error
    }

    // Count it only now that it exists — incrementing earlier would burn
    // allowance on failed creates. Fire-and-forget: a lost increment
    // under-counts, a thrown one would fail a create that already succeeded.
    incrementVolumeUsage(tenant_id!, 'itineraries', await loadUsageAnchor(supabase, tenant_id!))

    return NextResponse.json({
      success: true,
      data,
      ...(gate.usage ? { usage: gate.usage } : {})
    })
  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}