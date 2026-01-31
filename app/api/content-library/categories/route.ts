// =====================================================
// CONTENT CATEGORIES API
// =====================================================
// 📁 COPY TO: app/api/content-library/categories/route.ts
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Helper to create Supabase client
async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )
}

// GET - List all categories (with content counts)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const includeCount = searchParams.get('include_count') === 'true'
    const activeOnly = searchParams.get('active_only') !== 'false'

    let query = supabase
      .from('content_categories')
      .select('*')
      .order('sort_order', { ascending: true })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data: categories, error } = await query

    if (error) {
      console.error('Error fetching categories:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // If counts requested, fetch them
    if (includeCount && categories) {
      const { data: counts, error: countError } = await supabase
        .from('content_library')
        .select('category_id')
        .eq('is_active', true)

      if (!countError && counts) {
        const countMap = counts.reduce((acc: Record<string, number>, item) => {
          acc[item.category_id] = (acc[item.category_id] || 0) + 1
          return acc
        }, {})

        const categoriesWithCounts = categories.map((cat: any) => ({
          ...cat,
          content_count: countMap[cat.id] || 0
        }))

        return NextResponse.json(categoriesWithCounts)
      }
    }

    return NextResponse.json(categories)
  } catch (error) {
    console.error('Categories GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new category
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, slug, description, icon, sort_order } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    // Generate slug if not provided
    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

    const { data, error } = await supabase
      .from('content_categories')
      .insert({
        name,
        slug: finalSlug,
        description: description || null,
        icon: icon || null,
        sort_order: sort_order || 0
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') { // Unique violation
        return NextResponse.json(
          { error: 'A category with this slug already exists' },
          { status: 409 }
        )
      }
      console.error('Error creating category:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Categories POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Update category
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Category ID is required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('content_categories')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating category:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Categories PATCH error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete category
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Category ID is required' },
        { status: 400 }
      )
    }

    // Check if category has content
    const { count } = await supabase
      .from('content_library')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id)

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Cannot delete category with ${count} content items. Move or delete content first.` },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('content_categories')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting category:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Categories DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}