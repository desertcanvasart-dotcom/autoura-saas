// =====================================================
// CONTENT VARIATIONS API
// =====================================================
// 📁 COPY TO: app/api/content-library/[id]/variations/route.ts
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { loadVocabulary } from '@/lib/vocabulary-server'
import { PRESET_TIERS } from '@/lib/vocabulary'

/** The tenant's tier keys (hidden ones included — a stored key must still
 *  read), the preset when the vocabulary is empty. */
async function validTiers(supabase: Parameters<typeof loadVocabulary>[0]): Promise<string[]> {
  const keys = (await loadVocabulary(supabase, 'tier')).map(i => i.key)
  return keys.length ? keys : [...PRESET_TIERS]
}

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

// GET - List variations for a content item
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const tier = searchParams.get('tier')

    let query = supabase
      .from('content_variations')
      .select('*')
      .eq('content_id', id)
      .order('tier', { ascending: true })

    const VALID_TIERS = await validTiers(supabase as Parameters<typeof loadVocabulary>[0])
    if (tier && VALID_TIERS.includes(tier)) {
      query = query.eq('tier', tier)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching variations:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Sort by tier order
    const tierOrder = { budget: 0, standard: 1, deluxe: 2, luxury: 3 }
    const sortedData = data?.sort((a, b) => 
      (tierOrder[a.tier as keyof typeof tierOrder] || 0) - 
      (tierOrder[b.tier as keyof typeof tierOrder] || 0)
    )

    return NextResponse.json(sortedData)
  } catch (error) {
    console.error('Variations GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new variation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id: contentId } = await params
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { tier, title, description, highlights, inclusions, internal_notes } = body

    // Validation
    const VALID_TIERS = await validTiers(supabase as Parameters<typeof loadVocabulary>[0])
    if (!tier || !VALID_TIERS.includes(tier)) {
      return NextResponse.json(
        { error: `Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}` },
        { status: 400 }
      )
    }

    if (!description) {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      )
    }

    // Check if content exists
    const { data: content, error: contentError } = await supabase
      .from('content_library')
      .select('id')
      .eq('id', contentId)
      .single()

    if (contentError || !content) {
      return NextResponse.json(
        { error: 'Content item not found' },
        { status: 404 }
      )
    }

    // Create variation
    const { data, error } = await supabase
      .from('content_variations')
      .insert({
        content_id: contentId,
        tier,
        title: title || null,
        description,
        highlights: highlights || [],
        inclusions: inclusions || [],
        internal_notes: internal_notes || null,
        created_by: user.id,
        updated_by: user.id
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `A ${tier} variation already exists for this content` },
          { status: 409 }
        )
      }
      console.error('Error creating variation:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Variations POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Bulk update/replace all variations
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id: contentId } = await params
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { variations } = body

    if (!Array.isArray(variations)) {
      return NextResponse.json(
        { error: 'variations must be an array' },
        { status: 400 }
      )
    }

    // Validate all variations
    const VALID_TIERS = await validTiers(supabase as Parameters<typeof loadVocabulary>[0])
    for (const v of variations) {
      if (!v.tier || !VALID_TIERS.includes(v.tier)) {
        return NextResponse.json(
          { error: `Invalid tier: ${v.tier}` },
          { status: 400 }
        )
      }
      if (!v.description) {
        return NextResponse.json(
          { error: `Description required for ${v.tier} tier` },
          { status: 400 }
        )
      }
    }

    // Check for duplicate tiers in request
    const tiers = variations.map(v => v.tier)
    if (new Set(tiers).size !== tiers.length) {
      return NextResponse.json(
        { error: 'Duplicate tiers in request' },
        { status: 400 }
      )
    }

    // Get existing variations
    const { data: existing } = await supabase
      .from('content_variations')
      .select('id, tier')
      .eq('content_id', contentId)

    const existingMap = new Map(existing?.map(e => [e.tier, e.id]) || [])
    const results = []

    for (const v of variations) {
      const existingId = existingMap.get(v.tier)
      
      if (existingId) {
        // Update existing
        const { data, error } = await supabase
          .from('content_variations')
          .update({
            title: v.title || null,
            description: v.description,
            highlights: v.highlights || [],
            inclusions: v.inclusions || [],
            internal_notes: v.internal_notes || null,
            is_active: v.is_active ?? true,
            updated_by: user.id
          })
          .eq('id', existingId)
          .select()
          .single()

        if (!error && data) {
          results.push(data)
        }
      } else {
        // Create new
        const { data, error } = await supabase
          .from('content_variations')
          .insert({
            content_id: contentId,
            tier: v.tier,
            title: v.title || null,
            description: v.description,
            highlights: v.highlights || [],
            inclusions: v.inclusions || [],
            internal_notes: v.internal_notes || null,
            created_by: user.id,
            updated_by: user.id
          })
          .select()
          .single()

        if (!error && data) {
          results.push(data)
        }
      }
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error('Variations PUT error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Update single variation by tier
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id: contentId } = await params
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { tier, variation_id, ...updates } = body

    if (!tier && !variation_id) {
      return NextResponse.json(
        { error: 'Either tier or variation_id is required' },
        { status: 400 }
      )
    }

    // Remove fields that shouldn't be updated
    delete updates.id
    delete updates.content_id
    delete updates.created_at
    delete updates.created_by

    // Add updated_by
    updates.updated_by = user.id

    let query = supabase
      .from('content_variations')
      .update(updates)

    if (variation_id) {
      query = query.eq('id', variation_id)
    } else {
      query = query.eq('content_id', contentId).eq('tier', tier)
    }

    const { data, error } = await query.select().single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Variation not found' },
          { status: 404 }
        )
      }
      console.error('Error updating variation:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Variations PATCH error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete variation(s)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id: contentId } = await params
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const tier = searchParams.get('tier')
    const variationId = searchParams.get('variation_id')

    let query = supabase
      .from('content_variations')
      .delete()

    if (variationId) {
      query = query.eq('id', variationId)
    } else if (tier) {
      query = query.eq('content_id', contentId).eq('tier', tier)
    } else {
      return NextResponse.json(
        { error: 'Either tier or variation_id query parameter is required' },
        { status: 400 }
      )
    }

    const { error } = await query

    if (error) {
      console.error('Error deleting variation:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Variations DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}