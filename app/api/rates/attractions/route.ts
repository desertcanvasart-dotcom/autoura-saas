// ============================================
// ATTRACTIONS API
// File: app/api/rates/attractions/route.ts
// 
// Handles CRUD operations for attraction/entrance fee rates
// Uses entrance_fees table
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// GET - Fetch all attractions
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

    const { searchParams } = new URL(request.url)
    const city = searchParams.get('city')
    const category = searchParams.get('category')
    const activeOnly = searchParams.get('active_only') === 'true'
    const addonsOnly = searchParams.get('addons_only') === 'true'
    
    let query = supabase
      .from('entrance_fees')
      .select('*')
      .order('attraction_name', { ascending: true })
    
    if (city) {
      query = query.eq('city', city)
    }
    
    if (category) {
      query = query.eq('category', category)
    }
    
    if (activeOnly) {
      query = query.eq('is_active', true)
    }
    
    if (addonsOnly) {
      query = query.eq('is_addon', true)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('[Attractions API] Error fetching:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    
    // Transform field names for frontend compatibility
    const transformedData = data?.map((item: any) => ({
      id: item.id,
      service_code: item.service_code || `ENT-${item.id?.substring(0, 6).toUpperCase()}`,
      attraction_name: item.attraction_name,
      city: item.city,
      fee_type: item.fee_type || 'standard',
      eur_rate: item.eur_rate,
      non_eur_rate: item.non_eur_rate,
      egyptian_rate: item.egyptian_rate,
      student_discount_percentage: item.student_discount_percentage,
      child_discount_percent: item.child_discount_percent,
      season: item.season,
      rate_valid_from: item.rate_valid_from,
      rate_valid_to: item.rate_valid_to,
      category: item.category,
      notes: item.notes,
      is_active: item.is_active !== false, // Default to true if not set
      is_addon: item.is_addon || false,
      addon_note: item.addon_note,
      supplier_id: item.supplier_id,
      created_at: item.created_at,
      updated_at: item.updated_at
    })) || []
    
    return NextResponse.json({ 
      success: true, 
      data: transformedData,
      count: transformedData.length
    })
    
  } catch (error: any) {
    console.error('[Attractions API] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// POST - Create new attraction
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
    
    const {
      service_code,
      attraction_name,
      city,
      fee_type,
      eur_rate,
      non_eur_rate,
      egyptian_rate,
      student_discount_percentage,
      child_discount_percent,
      season,
      rate_valid_from,
      rate_valid_to,
      category,
      notes,
      is_active,
      is_addon,
      addon_note,
      supplier_id
    } = body
    
    // Validate required fields
    if (!attraction_name || !city) {
      return NextResponse.json({ 
        success: false, 
        error: 'Attraction name and city are required' 
      }, { status: 400 })
    }
    
    const { data, error } = await supabase
      .from('entrance_fees')
      .insert({
        service_code: service_code || `ENT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        attraction_name,
        city,
        fee_type: fee_type || 'standard',
        eur_rate: eur_rate || 0,
        non_eur_rate: non_eur_rate || 0,
        egyptian_rate: egyptian_rate || null,
        student_discount_percentage: student_discount_percentage || null,
        child_discount_percent: child_discount_percent || null,
        season: season || 'all_year',
        rate_valid_from,
        rate_valid_to,
        category,
        notes,
        is_active: is_active !== false,
        is_addon: is_addon || false,
        addon_note: addon_note || null,
        supplier_id: supplier_id || null
      })
      .select()
      .single()
    
    if (error) {
      console.error('[Attractions API] Error creating:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true, 
      data,
      message: 'Attraction created successfully'
    })
    
  } catch (error: any) {
    console.error('[Attractions API] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}