import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// ENTRANCE FEES API
// File: app/api/rates/entrance-fees/route.ts
//
// This endpoint powers the attractions dropdown
// in TourManagerContent.tsx
// ============================================

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
    const city = searchParams.get('city')
    const category = searchParams.get('category')
    const isAddon = searchParams.get('is_addon')
    const activeOnly = searchParams.get('active_only')
    const limit = searchParams.get('limit')
    const search = searchParams.get('search')

    let query = getSupabaseAdmin()
      .from('entrance_fees')
      .select('*')
      .order('city', { ascending: true })
      .order('attraction_name', { ascending: true })

    // Apply filters
    if (city) query = query.eq('city', city)
    if (category) query = query.eq('category', category)
    if (isAddon === 'true') query = query.eq('is_addon', true)
    if (isAddon === 'false') query = query.eq('is_addon', false)
    if (activeOnly === 'true') query = query.eq('is_active', true)
    if (search) query = query.ilike('attraction_name', `%${search}%`)
    if (limit) query = query.limit(parseInt(limit))

    const { data, error } = await query

    if (error) {
      console.error('GET entrance_fees error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      data: data || [],
      count: data?.length || 0
    })
  } catch (error: any) {
    console.error('GET entrance_fees catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const newFee = {
      service_code: body.service_code || `ENT-${Date.now().toString(36).toUpperCase()}`,
      attraction_name: body.attraction_name,
      city: body.city || null,
      fee_type: body.fee_type || 'standard',
      eur_rate: parseFloat(body.eur_rate) || 0,
      non_eur_rate: parseFloat(body.non_eur_rate) || 0,
      egyptian_rate: body.egyptian_rate ? parseFloat(body.egyptian_rate) : null,
      student_discount_percentage: body.student_discount_percentage || 50,
      child_discount_percent: body.child_discount_percent || 50,
      season: body.season || 'all_year',
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      category: body.category || null,
      notes: body.notes || null,
      is_active: body.is_active !== false,
      is_addon: body.is_addon === true,
      addon_note: body.addon_note || null,
      supplier_id: body.supplier_id || null
    }

    const { data, error } = await getSupabaseAdmin()
      .from('entrance_fees')
      .insert(newFee)
      .select('*')
      .single()

    if (error) {
      console.error('POST entrance_fees error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('POST entrance_fees catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}