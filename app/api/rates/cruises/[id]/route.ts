import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const { id } = await params

    const { data, error } = await supabase
      .from('nile_cruises')
      .select(`
        *,
        supplier:supplier_id (id, name, city, contact_phone, contact_email, star_rating)
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('GET nile_cruises by id error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET nile_cruises by id catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // ✅ SECURITY: Require authentication - prevents unauthorized rate modification
    const authResult = await requireAuth()
    if (authResult.error) {
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
    const { id } = await params
    const body = await request.json()

    const updateData = {
      // Basic info
      cruise_code: body.cruise_code,
      ship_name: body.ship_name,
      ship_category: body.ship_category || 'deluxe',
      route_name: body.route_name,
      embark_city: body.embark_city || 'Luxor',
      disembark_city: body.disembark_city || 'Aswan',
      duration_nights: body.duration_nights || [4],
      cabin_type: body.cabin_type || 'standard',

      // Tier and preferences
      tier: body.tier || 'standard',
      is_preferred: body.is_preferred || false,
      is_active: body.is_active !== false,

      // Supplier
      supplier_id: body.supplier_id || null,

      // Legacy rates (calculated from PPD)
      rate_single_eur: parseFloat(body.rate_single_eur) || 0,
      rate_double_eur: parseFloat(body.rate_double_eur) || 0,
      rate_triple_eur: body.rate_triple_eur ? parseFloat(body.rate_triple_eur) : null,

      // PPD Model - Low Season
      ppd_eur: parseFloat(body.ppd_eur) || 0,
      ppd_non_eur: parseFloat(body.ppd_non_eur) || 0,
      single_supplement_eur: parseFloat(body.single_supplement_eur) || 0,
      single_supplement_non_eur: parseFloat(body.single_supplement_non_eur) || 0,
      triple_reduction_eur: parseFloat(body.triple_reduction_eur) || 0,
      triple_reduction_non_eur: parseFloat(body.triple_reduction_non_eur) || 0,
      low_season_start: body.low_season_start || null,
      low_season_end: body.low_season_end || null,

      // PPD Model - High Season
      high_season_ppd_eur: parseFloat(body.high_season_ppd_eur) || 0,
      high_season_ppd_non_eur: parseFloat(body.high_season_ppd_non_eur) || 0,
      high_season_single_supplement_eur: parseFloat(body.high_season_single_supplement_eur) || 0,
      high_season_single_supplement_non_eur: parseFloat(body.high_season_single_supplement_non_eur) || 0,
      high_season_triple_reduction_eur: parseFloat(body.high_season_triple_reduction_eur) || 0,
      high_season_triple_reduction_non_eur: parseFloat(body.high_season_triple_reduction_non_eur) || 0,
      high_season_start: body.high_season_start || null,
      high_season_end: body.high_season_end || null,

      // PPD Model - Peak Season
      peak_season_ppd_eur: parseFloat(body.peak_season_ppd_eur) || 0,
      peak_season_ppd_non_eur: parseFloat(body.peak_season_ppd_non_eur) || 0,
      peak_season_single_supplement_eur: parseFloat(body.peak_season_single_supplement_eur) || 0,
      peak_season_single_supplement_non_eur: parseFloat(body.peak_season_single_supplement_non_eur) || 0,
      peak_season_triple_reduction_eur: parseFloat(body.peak_season_triple_reduction_eur) || 0,
      peak_season_triple_reduction_non_eur: parseFloat(body.peak_season_triple_reduction_non_eur) || 0,
      peak_season_1_start: body.peak_season_1_start || null,
      peak_season_1_end: body.peak_season_1_end || null,
      peak_season_2_start: body.peak_season_2_start || null,
      peak_season_2_end: body.peak_season_2_end || null,

      // Rate validity
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,

      // Other
      meals_included: body.meals_included || 'full_board',
      sightseeing_included: body.sightseeing_included || false,
      description: body.description || null,
      notes: body.notes || null,
      supplements: body.supplements || [],

      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('nile_cruises')
      .update(updateData)
      .eq('id', id)
      .select(`*, supplier:supplier_id (id, name)`)
      .single()

    if (error) {
      console.error('PUT nile_cruises error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT nile_cruises catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // ✅ SECURITY: Require authentication - prevents unauthorized rate deletion
    const authResult = await requireAuth()
    if (authResult.error) {
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
    const { id } = await params

    const { error } = await supabase
      .from('nile_cruises')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('DELETE nile_cruises error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Cruise deleted successfully' })
  } catch (error: any) {
    console.error('DELETE nile_cruises catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
