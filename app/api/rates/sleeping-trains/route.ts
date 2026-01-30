import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Lazy-initialized Supabase client (avoids build-time errors when env vars unavailable)
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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const originCity = searchParams.get('origin_city')
    const destinationCity = searchParams.get('destination_city')
    const cabinType = searchParams.get('cabin_type')
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = getSupabaseAdmin()
      .from('sleeping_train_rates')
      .select('*')
      .order('origin_city')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (originCity) query = query.eq('origin_city', originCity)
    if (destinationCity) query = query.eq('destination_city', destinationCity)
    if (cabinType) query = query.eq('cabin_type', cabinType)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('GET sleeping_train_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('GET sleeping_train_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const newRate = {
      service_code: body.service_code || `SLP-${Date.now().toString(36).toUpperCase()}`,
      origin_city: body.origin_city || null,
      destination_city: body.destination_city || null,
      cabin_type: body.cabin_type || null,
      rate_oneway_eur: parseFloat(body.rate_oneway_eur) || 0,
      rate_roundtrip_eur: body.rate_roundtrip_eur ? parseFloat(body.rate_roundtrip_eur) : null,
      departure_time: body.departure_time || null,
      arrival_time: body.arrival_time || null,
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      season: body.season || null,
      operator_name: body.operator_name || null,
      supplier_id: body.supplier_id || null,
      description: body.description || null,
      notes: body.notes || null,
      is_active: body.is_active !== false
    }

    const { data, error } = await getSupabaseAdmin()
      .from('sleeping_train_rates')
      .insert(newRate)
      .select('*')
      .single()

    if (error) {
      console.error('POST sleeping_train_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('POST sleeping_train_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}