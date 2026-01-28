import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
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

    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const city = searchParams.get('city')
    const mealType = searchParams.get('meal_type')
    const cuisineType = searchParams.get('cuisine_type')
    const tier = searchParams.get('tier')
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = supabase
      .from('meal_rates')
      .select('*')
      .order('restaurant_name')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (city) query = query.eq('city', city)
    if (mealType) query = query.eq('meal_type', mealType)
    if (cuisineType) query = query.eq('cuisine_type', cuisineType)
    if (tier) query = query.eq('tier', tier)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) {
      console.error('GET meal_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('GET meal_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json()

    const newRate = {
      service_code: body.service_code || `MEAL-${Date.now().toString(36).toUpperCase()}`,
      restaurant_name: body.restaurant_name,
      meal_type: body.meal_type || null,
      cuisine_type: body.cuisine_type || null,
      restaurant_type: body.restaurant_type || null,
      city: body.city || null,
      base_rate_eur: parseFloat(body.base_rate_eur) || 0,
      base_rate_non_eur: parseFloat(body.base_rate_non_eur) || 0,
      season: body.season || null,
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      supplier_id: body.supplier_id || null,
      supplier_name: body.supplier_name || null,
      tier: body.tier || null,
      meal_category: body.meal_category || null,
      dietary_options: body.dietary_options || [],
      per_person_rate: body.per_person_rate !== false,
      minimum_pax: body.minimum_pax ? parseInt(body.minimum_pax) : null,
      notes: body.notes || null,
      is_active: body.is_active !== false
    }

    const { data, error } = await supabase
      .from('meal_rates')
      .insert(newRate)
      .select('*')
      .single()

    if (error) {
      console.error('POST meal_rates error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('POST meal_rates catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}