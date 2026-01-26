import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const supabase = await createAuthenticatedClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { id } = await params

    // Query with RLS - automatically filters by tenant
    const { data, error } = await supabase
      .from('accommodation_rates')
      .select(`
        *,
        supplier:supplier_id (id, name, city, contact_phone, contact_email, star_rating, tier, is_preferred)
      `)
      .eq('id', id)
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error fetching accommodation rate:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user and get Supabase client
    const authResult = await requireAuth()

    if (authResult.error) {
      return NextResponse.json({
        success: false,
        error: authResult.error
      }, { status: authResult.status })
    }

    const { supabase } = authResult
    const { id } = await params
    const body = await request.json()

    // Prevent manual tenant_id changes
    delete body.tenant_id

    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    // Map all fields
    if (body.service_code !== undefined) updateData.service_code = body.service_code
    if (body.property_name !== undefined) updateData.property_name = body.property_name
    if (body.property_type !== undefined) updateData.property_type = body.property_type
    if (body.city !== undefined) updateData.city = body.city || null
    if (body.board_basis !== undefined) updateData.board_basis = body.board_basis
    // Low Season / Base rates - EUR
    if (body.single_rate_eur !== undefined) updateData.single_rate_eur = body.single_rate_eur || null
    if (body.double_rate_eur !== undefined) updateData.double_rate_eur = body.double_rate_eur || null
    if (body.triple_rate_eur !== undefined) updateData.triple_rate_eur = body.triple_rate_eur || null
    if (body.suite_rate_eur !== undefined) updateData.suite_rate_eur = body.suite_rate_eur || null
    // Low Season / Base rates - Non-EUR
    if (body.single_rate_non_eur !== undefined) updateData.single_rate_non_eur = body.single_rate_non_eur || null
    if (body.double_rate_non_eur !== undefined) updateData.double_rate_non_eur = body.double_rate_non_eur || null
    if (body.triple_rate_non_eur !== undefined) updateData.triple_rate_non_eur = body.triple_rate_non_eur || null
    if (body.suite_rate_non_eur !== undefined) updateData.suite_rate_non_eur = body.suite_rate_non_eur || null
    // Low Season dates
    if (body.low_season_from !== undefined) updateData.low_season_from = body.low_season_from || null
    if (body.low_season_to !== undefined) updateData.low_season_to = body.low_season_to || null
    // High Season rates - EUR
    if (body.high_season_single_eur !== undefined) updateData.high_season_single_eur = body.high_season_single_eur || null
    if (body.high_season_double_eur !== undefined) updateData.high_season_double_eur = body.high_season_double_eur || null
    if (body.high_season_triple_eur !== undefined) updateData.high_season_triple_eur = body.high_season_triple_eur || null
    if (body.high_season_suite_eur !== undefined) updateData.high_season_suite_eur = body.high_season_suite_eur || null
    // High Season rates - Non-EUR
    if (body.high_season_single_non_eur !== undefined) updateData.high_season_single_non_eur = body.high_season_single_non_eur || null
    if (body.high_season_double_non_eur !== undefined) updateData.high_season_double_non_eur = body.high_season_double_non_eur || null
    if (body.high_season_triple_non_eur !== undefined) updateData.high_season_triple_non_eur = body.high_season_triple_non_eur || null
    if (body.high_season_suite_non_eur !== undefined) updateData.high_season_suite_non_eur = body.high_season_suite_non_eur || null
    // High Season dates
    if (body.high_season_from !== undefined) updateData.high_season_from = body.high_season_from || null
    if (body.high_season_to !== undefined) updateData.high_season_to = body.high_season_to || null
    // Peak Season rates - EUR
    if (body.peak_season_single_eur !== undefined) updateData.peak_season_single_eur = body.peak_season_single_eur || null
    if (body.peak_season_double_eur !== undefined) updateData.peak_season_double_eur = body.peak_season_double_eur || null
    if (body.peak_season_triple_eur !== undefined) updateData.peak_season_triple_eur = body.peak_season_triple_eur || null
    if (body.peak_season_suite_eur !== undefined) updateData.peak_season_suite_eur = body.peak_season_suite_eur || null
    // Peak Season rates - Non-EUR
    if (body.peak_season_single_non_eur !== undefined) updateData.peak_season_single_non_eur = body.peak_season_single_non_eur || null
    if (body.peak_season_double_non_eur !== undefined) updateData.peak_season_double_non_eur = body.peak_season_double_non_eur || null
    if (body.peak_season_triple_non_eur !== undefined) updateData.peak_season_triple_non_eur = body.peak_season_triple_non_eur || null
    if (body.peak_season_suite_non_eur !== undefined) updateData.peak_season_suite_non_eur = body.peak_season_suite_non_eur || null
    // Peak Season dates
    if (body.peak_season_from !== undefined) updateData.peak_season_from = body.peak_season_from || null
    if (body.peak_season_to !== undefined) updateData.peak_season_to = body.peak_season_to || null
    if (body.peak_season_2_from !== undefined) updateData.peak_season_2_from = body.peak_season_2_from || null
    if (body.peak_season_2_to !== undefined) updateData.peak_season_2_to = body.peak_season_2_to || null
    // Validity & metadata
    if (body.rate_valid_from !== undefined) updateData.rate_valid_from = body.rate_valid_from || null
    if (body.rate_valid_to !== undefined) updateData.rate_valid_to = body.rate_valid_to || null
    if (body.tier !== undefined) updateData.tier = body.tier
    if (body.supplier_id !== undefined) updateData.supplier_id = body.supplier_id || null
    if (body.supplier_name !== undefined) updateData.supplier_name = body.supplier_name || null
    if (body.notes !== undefined) updateData.notes = body.notes || null
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    // Update with RLS - automatically scoped to tenant
    const { data, error } = await supabase
      .from('accommodation_rates')
      .update(updateData)
      .eq('id', id)
      .select(`*, supplier:supplier_id (id, name, city)`)
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error updating accommodation rate:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user and get Supabase client
    const authResult = await requireAuth()

    if (authResult.error) {
      return NextResponse.json({
        success: false,
        error: authResult.error
      }, { status: authResult.status })
    }

    const { supabase } = authResult
    const { id } = await params

    // Delete with RLS - automatically scoped to tenant
    const { error } = await supabase
      .from('accommodation_rates')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting accommodation rate:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}