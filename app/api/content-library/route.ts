// =====================================================
// CONTENT LIBRARY API - FIXED VERSION
// =====================================================
// 📁 REPLACE: app/api/content-library/route.ts
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

// Helper to generate slug
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// GET - List content items with filters
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    // Parse filters
    const categoryId = searchParams.get('category_id')
    const search = searchParams.get('search')
    const activeOnly = searchParams.get('active_only') !== 'false'

    // First, fetch content items
    let query = supabase
      .from('content_library')
      .select('*')
      .order('name', { ascending: true })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    if (categoryId) {
      query = query.eq('category_id', categoryId)
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,short_description.ilike.%${search}%,location.ilike.%${search}%`)
    }

    const { data: contentItems, error: contentError } = await query

    if (contentError) {
      console.error('Error fetching content:', contentError)
      return NextResponse.json({ error: contentError.message }, { status: 500 })
    }

    if (!contentItems || contentItems.length === 0) {
      return NextResponse.json({
        data: [],
        pagination: { page: 1, limit: 50, total: 0, total_pages: 0 }
      })
    }

    // Fetch categories for the content items
    const categoryIds = [...new Set(contentItems.map(c => c.category_id))]
    const { data: categories } = await supabase
      .from('content_categories')
      .select('id, name, slug, icon')
      .in('id', categoryIds)

    const categoryMap = new Map(categories?.map(c => [c.id, c]) || [])

    // Fetch variations for all content items
    const contentIds = contentItems.map(c => c.id)
    const { data: variations } = await supabase
      .from('content_variations')
      .select('id, content_id, tier, is_active')
      .in('content_id', contentIds)

    // Group variations by content_id
    const variationMap = new Map<string, { id: string; tier: string; is_active: boolean }[]>()
    variations?.forEach(v => {
      if (!variationMap.has(v.content_id)) {
        variationMap.set(v.content_id, [])
      }
      variationMap.get(v.content_id)!.push(v)
    })

    // Build enriched response
    const TIERS = ['budget', 'standard', 'deluxe', 'luxury']
    const enrichedData = contentItems.map(item => {
      const itemVariations = variationMap.get(item.id) || []
      const existingTiers = itemVariations.map(v => v.tier)
      
      return {
        ...item,
        category: categoryMap.get(item.category_id) || null,
        variation_count: itemVariations.length,
        missing_tiers: TIERS.filter(t => !existingTiers.includes(t))
      }
    })

    return NextResponse.json({
      data: enrichedData,
      pagination: {
        page: 1,
        limit: 50,
        total: enrichedData.length,
        total_pages: 1
      }
    })
  } catch (error) {
    console.error('Content GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new content item
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      category_id,
      name,
      slug,
      short_description,
      location,
      duration,
      tags,
      metadata,
      variations
    } = body

    // Validation
    if (!category_id || !name) {
      return NextResponse.json(
        { error: 'category_id and name are required' },
        { status: 400 }
      )
    }

    // Generate slug if not provided
    const finalSlug = slug || generateSlug(name)

    // Create content item
    const { data: content, error: contentError } = await supabase
      .from('content_library')
      .insert({
        category_id,
        name,
        slug: finalSlug,
        short_description: short_description || null,
        location: location || null,
        duration: duration || null,
        tags: tags || [],
        metadata: metadata || {},
        created_by: user.id,
        updated_by: user.id
      })
      .select()
      .single()

    if (contentError) {
      if (contentError.code === '23505') {
        return NextResponse.json(
          { error: 'Content with this slug already exists in this category' },
          { status: 409 }
        )
      }
      console.error('Error creating content:', contentError)
      return NextResponse.json({ error: contentError.message }, { status: 500 })
    }

    // Create variations if provided
    if (variations && variations.length > 0 && content) {
      const variationsToInsert = variations.map((v: {
        tier: string
        title?: string
        description: string
        highlights?: string[]
        inclusions?: string[]
        internal_notes?: string
      }) => ({
        content_id: content.id,
        tier: v.tier,
        title: v.title || null,
        description: v.description,
        highlights: v.highlights || [],
        inclusions: v.inclusions || [],
        internal_notes: v.internal_notes || null,
        created_by: user.id,
        updated_by: user.id
      }))

      const { data: createdVariations, error: variationsError } = await supabase
        .from('content_variations')
        .insert(variationsToInsert)
        .select()

      if (variationsError) {
        console.error('Error creating variations:', variationsError)
        return NextResponse.json({
          ...content,
          variations: [],
          warning: 'Content created but variations failed: ' + variationsError.message
        }, { status: 201 })
      }

      return NextResponse.json({
        ...content,
        variations: createdVariations
      }, { status: 201 })
    }

    return NextResponse.json(content, { status: 201 })
  } catch (error) {
    console.error('Content POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Update content item
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
        { error: 'Content ID is required' },
        { status: 400 }
      )
    }

    // Add updated_by
    updates.updated_by = user.id

    const { data, error } = await supabase
      .from('content_library')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating content:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Content PATCH error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete content item
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
        { error: 'Content ID is required' },
        { status: 400 }
      )
    }

    // Variations are deleted via CASCADE
    const { error } = await supabase
      .from('content_library')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting content:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Content DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}