import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
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

    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const activeOnly = searchParams.get('active_only') === 'true'

    // Query with RLS - automatically filters by tenant
    let query = supabase
      .from('accommodation_rates')
      .select('*')
      .order('id')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('GET error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('GET catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const body = await request.json()

    // Prevent manual tenant_id setting - RLS will handle it
    delete body.tenant_id

    console.log('=== HOTELS API POST START ===')
    console.log('Body received:', JSON.stringify(body, null, 2))

    // Minimal insert with only required fields
    const newRate: Record<string, any> = {
      service_code: body.service_code || `HTL-${Date.now()}`,
      property_name: body.property_name,
      property_type: body.property_type || 'hotel',
      board_basis: body.board_basis || 'BB',
      base_rate_eur: parseFloat(body.double_rate_eur) || 0,
      base_rate_non_eur: parseFloat(body.double_rate_non_eur) || 0,
      tier: body.tier || 'standard',
      is_active: body.is_active !== false
    }

    // Add optional fields
    if (body.city) newRate.city = body.city
    if (body.supplier_id) newRate.supplier_id = body.supplier_id
    if (body.supplier_name) newRate.supplier_name = body.supplier_name
    if (body.notes) newRate.notes = body.notes

    console.log('Inserting:', JSON.stringify(newRate, null, 2))

    // Insert with RLS - tenant_id auto-populated by trigger
    const { data: insertData, error: insertError } = await supabase
      .from('accommodation_rates')
      .insert(newRate)
      .select('*')
      .single()

    if (insertError) {
      console.error('Supabase insert error:', insertError)
      return NextResponse.json({
        success: false,
        error: insertError.message,
        details: insertError
      }, { status: 500 })
    }

    console.log('=== INSERT SUCCESSFUL ===')
    console.log('Inserted data:', insertData)

    return NextResponse.json({ success: true, data: insertData })
  } catch (error: any) {
    console.error('=== HOTELS API POST ERROR ===')
    console.error('Error:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}