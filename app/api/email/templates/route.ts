import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Lazy-initialized Supabase client (avoids build-time errors when env vars unavailable)
let _supabase: ReturnType<typeof createClient> | null = null

function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabase
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const category = searchParams.get('category') // 'customer', 'partner', 'internal', or 'all'

    // Fetch from message_templates (new templates)
    let query = getSupabase()
      .from('message_templates')
      .select('*')
      .eq('is_active', true)
      .order('category')
      .order('subcategory')
      .order('name')

    // Filter by category if specified
    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    const { data: messageTemplates, error: msgError } = await query

    if (msgError) {
      console.error('Error fetching message_templates:', msgError)
    }

    // Also fetch from email_templates (legacy templates) if table exists
    let legacyTemplates: any[] = []
    try {
      const { data: legacy, error: legacyError } = await getSupabase()
        .from('email_templates')
        .select('*')
        .order('name')

      if (!legacyError && legacy) {
        legacyTemplates = legacy
      }
    } catch (e) {
      // email_templates table might not exist, that's okay
      console.log('Legacy email_templates table not found, using message_templates only')
    }

    // Transform message_templates to match the expected format
    const transformedMessageTemplates = (messageTemplates || []).map(template => ({
      id: template.id,
      name: template.name,
      subject: template.subject || '',
      content: template.body, // body → content
      category: template.category,
      subcategory: template.subcategory,
      description: template.description,
      channel: template.channel,
      placeholders: template.placeholders,
      // Add a flag to identify source
      source: 'message_templates'
    }))

    // Transform legacy templates
    const transformedLegacyTemplates = legacyTemplates.map(template => ({
      ...template,
      source: 'email_templates'
    }))

    // Merge both sources (new templates first)
    const allTemplates = [...transformedMessageTemplates, ...transformedLegacyTemplates]

    return NextResponse.json({ 
      success: true, 
      templates: allTemplates 
    })

  } catch (error) {
    console.error('Email templates GET error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error',
      templates: [] 
    }, { status: 500 })
  }
}

// POST - Create new template (saves to message_templates)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, name, subject, content, category } = body

    if (!name || !content) {
      return NextResponse.json({ 
        success: false, 
        error: 'Name and content are required' 
      }, { status: 400 })
    }

    // Extract placeholders from content
    const placeholderMatches = content.match(/\{\{[^}]+\}\}/g) || []
    const placeholders = [...new Set(placeholderMatches)]

    const { data, error } = await (getSupabase() as any)
      .from('message_templates')
      .insert({
        name,
        subject,
        body: content,
        category: category || 'customer',
        channel: 'email',
        placeholders,
        is_active: true,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating template:', error)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to create template' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      template: {
        id: data.id,
        name: data.name,
        subject: data.subject,
        content: data.body,
        category: data.category,
      }
    })

  } catch (error) {
    console.error('Email templates POST error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}