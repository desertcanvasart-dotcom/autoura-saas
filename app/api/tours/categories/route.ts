import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// TOUR CATEGORIES API
// File: app/api/tours/categories/route.ts
// 
// FIXED: Using supabaseAdmin to bypass RLS
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List all tour categories
export async function GET(request: NextRequest) {
  try {
    const { data, error } = await supabaseAdmin
      .from('tour_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('Error fetching categories:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch categories' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    })

  } catch (error) {
    console.error('Error in categories GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new category
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.category_name) {
      return NextResponse.json(
        { success: false, error: 'Category name is required' },
        { status: 400 }
      )
    }

    const categoryCode = body.category_code || 
      body.category_name.toUpperCase().replace(/\s+/g, '_').substring(0, 20)

    const { data, error } = await supabaseAdmin
      .from('tour_categories')
      .insert([{
        category_name: body.category_name,
        category_code: categoryCode,
        description: body.description || null,
        icon: body.icon || null,
        sort_order: body.sort_order || 99,
        is_active: body.is_active !== false
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating category:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create category' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Category created successfully'
    }, { status: 201 })

  } catch (error) {
    console.error('Error in categories POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}