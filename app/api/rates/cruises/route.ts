import { NextRequest, NextResponse } from 'next/server'
import { rateCurrencyWriteField } from '@/lib/rates/rate-currency'
import { requireAuth } from '@/lib/supabase-server'
import { validateRatePayload } from '@/lib/rate-validation'
import { sanitizeSeasons, legacyColumnMirror } from '@/lib/rates/rate-seasons'

export async function GET(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - protects pricing data
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const shipName = searchParams.get('ship_name')
    const route = searchParams.get('route')
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = supabase
      .from('nile_cruises')
      .select(`
        *,
        supplier:supplier_id (id, name, city, contact_phone, contact_email, star_rating)
      `)
      .order('ship_name')
      .order('cabin_type')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (shipName) query = query.ilike('ship_name', `%${shipName}%`)
    // Column is route_name; `route` does not exist, so any request carrying
    // the route filter 400'd on a nonexistent column.
    if (route) query = query.eq('route_name', route)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error fetching cruises:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - protects pricing data
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const body = await request.json()

    const rateCheck = validateRatePayload(body)
    if (!rateCheck.ok) {
      return NextResponse.json(
        { success: false, error: 'Invalid rate values', violations: rateCheck.errors },
        { status: 400 }
      )
    }

    // Include supplier_id in insert
    const parsedSeasons = 'seasons' in body ? sanitizeSeasons(body.seasons, 'cruise') : undefined
    const seasonsPatch: Record<string, unknown> = parsedSeasons === undefined
      ? {}
      : { seasons: parsedSeasons, ...legacyColumnMirror(parsedSeasons, 'cruise') }

    const newCruise = {
      // Dated rate periods (C3.2). Only named when the client sent them, so a
      // database without migration 305 never sees the column; the first period
      // is mirrored onto the base columns for date-less readers.
      ...seasonsPatch,
      ...rateCurrencyWriteField(body),
      ...body,
      supplier_id: body.supplier_id || null
    }

    const { data, error } = await supabase
      .from('nile_cruises')
      .insert([newCruise])
      .select(`*, supplier:supplier_id (id, name)`)
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error creating cruise:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}