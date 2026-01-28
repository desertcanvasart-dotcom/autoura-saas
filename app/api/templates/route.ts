import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// GET - List all templates
export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const channel = searchParams.get('channel')
    const search = searchParams.get('search')

    let query = supabase
      .from('message_templates')
      .select('*')
      .eq('is_active', true)
      .order('category')
      .order('subcategory')
      .order('name')

    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    if (channel && channel !== 'all') {
      if (channel === 'email' || channel === 'whatsapp') {
        query = query.or(`channel.eq.${channel},channel.eq.both`)
      }
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,body.ilike.%${search}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching templates:', error)
      return NextResponse.json({ success: false, error: 'Failed to fetch templates' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Templates GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new template
export async function POST(request: NextRequest) {
  try {
    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const body = await request.json()
    const { name, description, category, subcategory, channel, subject, body: templateBody, language, parent_template_id } = body

    if (!name || !templateBody) {
      return NextResponse.json({ success: false, error: 'Name and body are required' }, { status: 400 })
    }

    // Extract placeholders from body
    const placeholderMatches = templateBody.match(/\{\{[^}]+\}\}/g) || []
    const placeholders = [...new Set(placeholderMatches)]

    const { data, error } = await supabase
      .from('message_templates')
      .insert({
        tenant_id, // ✅ Explicit tenant_id
        name,
        description,
        category: category || 'customer',
        subcategory,
        channel: channel || 'email',
        subject,
        body: templateBody,
        placeholders,
        is_active: true,
        language: language || 'en',
        parent_template_id: parent_template_id || null,
        version: 1,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating template:', error)
      return NextResponse.json({ success: false, error: 'Failed to create template' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Templates POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}