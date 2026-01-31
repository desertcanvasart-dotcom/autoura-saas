// =====================================================
// WRITING RULES API - SIMPLIFIED
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

// GET - List writing rules
export async function GET() {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('writing_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('Error fetching writing rules:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transform data to match UI expectations
    const transformed = (data || []).map((rule: any) => ({
      ...rule,
      // Use examples_json if available, otherwise convert examples array
      examples: rule.examples_json || {
        good: rule.examples || [],
        bad: []
      },
      // Ensure rule_type has a default
      rule_type: rule.rule_type || 'enforce',
      // Ensure priority has a default
      priority: rule.priority || 5,
      // Map applies_to from applies_to_tiers if not set
      applies_to: rule.applies_to || ['all']
    }))

    return NextResponse.json(transformed)
  } catch (error) {
    console.error('Writing rules GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new writing rule
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
      name,
      category,
      rule_type,
      description,
      examples,
      priority,
      applies_to,
      applies_to_tiers,
      sort_order
    } = body

    if (!name || !description) {
      return NextResponse.json(
        { error: 'name and description are required' },
        { status: 400 }
      )
    }

    // Get tenant_id from user's profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    const { data, error } = await supabase
      .from('writing_rules')
      .insert({
        tenant_id: profile?.tenant_id,
        name,
        category: category || 'general',
        rule_type: rule_type || 'enforce',
        description,
        examples_json: examples || { good: [], bad: [] },
        priority: priority || 5,
        applies_to: applies_to || ['all'],
        applies_to_tiers: applies_to_tiers || ['budget', 'standard', 'deluxe', 'luxury'],
        sort_order: sort_order || 0,
        created_by: user.id
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating writing rule:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transform response to match UI expectations
    const transformed = {
      ...data,
      examples: data.examples_json || { good: [], bad: [] },
      rule_type: data.rule_type || 'enforce',
      priority: data.priority || 5,
      applies_to: data.applies_to || ['all']
    }

    return NextResponse.json(transformed, { status: 201 })
  } catch (error) {
    console.error('Writing rules POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Update writing rule
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, examples, ...updates } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Rule ID is required' },
        { status: 400 }
      )
    }

    // Remove fields that shouldn't be updated
    delete updates.created_at
    delete updates.created_by
    delete updates.tenant_id

    // Map examples to examples_json for storage
    if (examples) {
      updates.examples_json = examples
    }

    updates.updated_by = user.id

    const { data, error } = await supabase
      .from('writing_rules')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating writing rule:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transform response to match UI expectations
    const transformed = {
      ...data,
      examples: data.examples_json || { good: [], bad: [] },
      rule_type: data.rule_type || 'enforce',
      priority: data.priority || 5,
      applies_to: data.applies_to || ['all']
    }

    return NextResponse.json(transformed)
  } catch (error) {
    console.error('Writing rules PATCH error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete writing rule
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
        { error: 'Rule ID is required' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('writing_rules')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting writing rule:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Writing rules DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
