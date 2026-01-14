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
    const tier = searchParams.get('tier')
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = supabaseAdmin
      .from('hotel_contacts')
      .select(`
        *,
        supplier:suppliers(id, name, city, contact_phone, contact_email)
      `)
      .order('property_name')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (city) query = query.eq('city', city)
    if (tier) query = query.eq('tier', tier)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('GET hotel_contacts error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('GET hotel_contacts catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const newHotel = {
      // Basic info
      service_code: body.service_code || `ACC-${Date.now().toString(36).toUpperCase()}`,
      property_name: body.property_name,
      property_type: body.property_type || 'hotel',
      city: body.city || null,
      board_basis: body.board_basis || 'BB',
      tier: body.tier || 'standard',
      supplier_id: body.supplier_id || null,
      supplier_name: body.supplier_name || null,
      
      // Hotel contacts
      contact_name: body.contact_name || null,
      contact_email: body.contact_email || null,
      contact_phone: body.contact_phone || null,
      reservations_email: body.reservations_email || null,
      reservations_phone: body.reservations_phone || null,
      
      // Low Season dates
      low_season_from: body.low_season_from || null,
      low_season_to: body.low_season_to || null,
      
      // Low Season rates - EUR
      single_rate_eur: parseFloat(body.single_rate_eur) || 0,
      double_rate_eur: parseFloat(body.double_rate_eur) || 0,
      triple_rate_eur: parseFloat(body.triple_rate_eur) || 0,
      suite_rate_eur: parseFloat(body.suite_rate_eur) || 0,
      
      // Low Season rates - Non-EUR
      single_rate_non_eur: parseFloat(body.single_rate_non_eur) || 0,
      double_rate_non_eur: parseFloat(body.double_rate_non_eur) || 0,
      triple_rate_non_eur: parseFloat(body.triple_rate_non_eur) || 0,
      suite_rate_non_eur: parseFloat(body.suite_rate_non_eur) || 0,
      
      // High Season dates
      high_season_from: body.high_season_from || null,
      high_season_to: body.high_season_to || null,
      
      // High Season rates - EUR
      high_season_single_eur: parseFloat(body.high_season_single_eur) || 0,
      high_season_double_eur: parseFloat(body.high_season_double_eur) || 0,
      high_season_triple_eur: parseFloat(body.high_season_triple_eur) || 0,
      high_season_suite_eur: parseFloat(body.high_season_suite_eur) || 0,
      
      // High Season rates - Non-EUR
      high_season_single_non_eur: parseFloat(body.high_season_single_non_eur) || 0,
      high_season_double_non_eur: parseFloat(body.high_season_double_non_eur) || 0,
      high_season_triple_non_eur: parseFloat(body.high_season_triple_non_eur) || 0,
      high_season_suite_non_eur: parseFloat(body.high_season_suite_non_eur) || 0,
      
      // Peak Season dates (Period 1)
      peak_season_from: body.peak_season_from || null,
      peak_season_to: body.peak_season_to || null,
      
      // Peak Season dates (Period 2 - optional)
      peak_season_2_from: body.peak_season_2_from || null,
      peak_season_2_to: body.peak_season_2_to || null,
      
      // Peak Season rates - EUR
      peak_season_single_eur: parseFloat(body.peak_season_single_eur) || 0,
      peak_season_double_eur: parseFloat(body.peak_season_double_eur) || 0,
      peak_season_triple_eur: parseFloat(body.peak_season_triple_eur) || 0,
      peak_season_suite_eur: parseFloat(body.peak_season_suite_eur) || 0,
      
      // Peak Season rates - Non-EUR
      peak_season_single_non_eur: parseFloat(body.peak_season_single_non_eur) || 0,
      peak_season_double_non_eur: parseFloat(body.peak_season_double_non_eur) || 0,
      peak_season_triple_non_eur: parseFloat(body.peak_season_triple_non_eur) || 0,
      peak_season_suite_non_eur: parseFloat(body.peak_season_suite_non_eur) || 0,
      
      // Rate validity
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      
      // Other
      notes: body.notes || null,
      is_active: body.is_active !== false
    }

    const { data, error } = await supabaseAdmin
      .from('hotel_contacts')
      .insert(newHotel)
      .select('*')
      .single()

    if (error) {
      console.error('POST hotel_contacts error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('POST hotel_contacts catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}