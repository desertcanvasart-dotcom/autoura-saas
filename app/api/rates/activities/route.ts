import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const city = searchParams.get('city')
    const category = searchParams.get('category')
    const pricingType = searchParams.get('pricing_type')
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = supabaseAdmin
      .from('activity_rates')
      .select('*')
      .order('activity_name')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (city) query = query.eq('city', city)
    if (category) query = query.eq('activity_category', category)
    if (pricingType) query = query.eq('pricing_type', pricingType)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('GET activity_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('GET activity_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const newRate = {
      service_code: body.service_code || `ACT-${Date.now().toString(36).toUpperCase()}`,
      activity_name: body.activity_name,
      activity_category: body.activity_category || null,
      activity_type: body.activity_type || null,
      duration: body.duration || null,
      city: body.city || null,
      base_rate_eur: parseFloat(body.base_rate_eur) || 0,
      base_rate_non_eur: parseFloat(body.base_rate_non_eur) || 0,
      // Add-on pricing fields
      pricing_type: body.pricing_type || 'per_person',
      unit_label: body.unit_label || null,
      min_capacity: parseInt(body.min_capacity) || 1,
      max_capacity: parseInt(body.max_capacity) || 99,
      // Other fields
      season: body.season || null,
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      supplier_id: body.supplier_id || null,
      supplier_name: body.supplier_name || null,
      notes: body.notes || null,
      is_active: body.is_active !== false
    }

    const { data, error } = await supabaseAdmin
      .from('activity_rates')
      .insert(newRate)
      .select('*')
      .single()

    if (error) {
      console.error('POST activity_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('POST activity_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}