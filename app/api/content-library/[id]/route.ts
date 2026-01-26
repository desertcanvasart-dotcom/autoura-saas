// =====================================================
// SINGLE CONTENT ITEM API
// =====================================================
// 📁 COPY TO: app/api/content-library/[id]/route.ts
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

// GET - Fetch single content item with all details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params

    const { data, error } = await supabase
      .from('content_library')
      .select(`
        *,
        category:content_categories(*),
        variations:content_variations(*)
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Content not found' }, { status: 404 })
      }
      console.error('Error fetching content:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calculate missing tiers
    const TIERS = ['budget', 'standard', 'deluxe', 'luxury']
    const existingTiers = data.variations?.map((v: { tier: string }) => v.tier) || []
    const enrichedData = {
      ...data,
      variation_count: data.variations?.length || 0,
      missing_tiers: TIERS.filter(t => !existingTiers.includes(t))
    }

    return NextResponse.json(enrichedData)
  } catch (error) {
    console.error('Content GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Full update of content item
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params
    
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
      is_active,
      variations
    } = body

    // Update content item
    const { data: content, error: contentError } = await supabase
      .from('content_library')
      .update({
        category_id,
        name,
        slug,
        short_description,
        location,
        duration,
        tags: tags || [],
        metadata: metadata || {},
        is_active: is_active ?? true,
        updated_by: user.id
      })
      .eq('id', id)
      .select()
      .single()

    if (contentError) {
      console.error('Error updating content:', contentError)
      return NextResponse.json({ error: contentError.message }, { status: 500 })
    }

    // Update variations if provided
    if (variations && Array.isArray(variations)) {
      // Get existing variations
      const { data: existingVariations } = await supabase
        .from('content_variations')
        .select('id, tier')
        .eq('content_id', id)

      const existingTierMap = new Map(
        existingVariations?.map(v => [v.tier, v.id]) || []
      )

      // Get tiers being submitted (only ones with content)
      const submittedTiers = new Set(variations.map(v => v.tier))

      // Delete variations that are no longer being submitted (user cleared description)
      for (const [tier, variationId] of existingTierMap) {
        if (!submittedTiers.has(tier)) {
          await supabase
            .from('content_variations')
            .delete()
            .eq('id', variationId)
        }
      }

      // Update or insert submitted variations
      for (const variation of variations) {
        const existingId = existingTierMap.get(variation.tier)

        if (existingId) {
          // Update existing
          await supabase
            .from('content_variations')
            .update({
              title: variation.title || null,
              description: variation.description,
              highlights: variation.highlights || [],
              inclusions: variation.inclusions || [],
              internal_notes: variation.internal_notes || null,
              is_active: variation.is_active ?? true,
              updated_by: user.id
            })
            .eq('id', existingId)
        } else {
          // Insert new
          await supabase
            .from('content_variations')
            .insert({
              content_id: id,
              tier: variation.tier,
              title: variation.title || null,
              description: variation.description,
              highlights: variation.highlights || [],
              inclusions: variation.inclusions || [],
              internal_notes: variation.internal_notes || null,
              created_by: user.id,
              updated_by: user.id
            })
        }
      }
    }

    // Fetch updated content with variations
    const { data: updated, error: fetchError } = await supabase
      .from('content_library')
      .select(`
        *,
        category:content_categories(*),
        variations:content_variations(*)
      `)
      .eq('id', id)
      .single()

    if (fetchError) {
      return NextResponse.json(content)
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Content PUT error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Partial update of content item
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    // Remove any fields that shouldn't be directly updated
    delete body.id
    delete body.created_at
    delete body.created_by
    
    // Add updated_by
    body.updated_by = user.id

    const { data, error } = await supabase
      .from('content_library')
      .update(body)
      .eq('id', id)
      .select(`
        *,
        category:content_categories(*),
        variations:content_variations(*)
      `)
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
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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