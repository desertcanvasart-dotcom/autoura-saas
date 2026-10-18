import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const supabase = createAdminClient()

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const category = searchParams.get('category') // 'customer', 'partner', 'internal', or 'all'

    // Fetch from message_templates (new templates), scoped to the tenant
    let query = (supabase as any)
      .from('message_templates')
      .select('*')
      .eq('tenant_id', authResult.tenant_id)
      .eq('is_active', true)
      // Email templates here; WhatsApp ones live on the Templates page.
      .eq('channel', 'email')
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

    // The legacy email_templates table was read with the service key and no
    // tenant filter — any agency's templates, had it existed. Not read now.
    // Transform message_templates to match the expected format
    const transformedMessageTemplates = (messageTemplates || []).map((template: any) => ({
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

    const allTemplates = transformedMessageTemplates

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
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    const denied = roleDenied(authResult.role, 'staff')
    if (denied) return denied
    const supabase = createAdminClient()

    const body = await request.json()
    const { name, subject, content, category } = body

    if (!name || !content) {
      return NextResponse.json({
        success: false,
        error: 'Name and content are required'
      }, { status: 400 })
    }

    // Extract placeholders from content
    const placeholderMatches = content.match(/\{\{[^}]+\}\}/g) || []
    const placeholders = [...new Set(placeholderMatches)]

    const { data, error } = await (supabase as any)
      .from('message_templates')
      .insert({
        tenant_id: authResult.tenant_id,
        name,
        subject,
        body: content,
        category: category || 'customer',
        channel: 'email',
        placeholders,
        is_active: true,
        created_by: authResult.user!.id,
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

// PUT — edit a template. The page called PUT and DELETE, which this route did
// not have: every edit and delete answered 405 and the page said nothing.
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const denied = roleDenied(authResult.role, 'staff')
    if (denied) return denied
    const body = await request.json().catch(() => ({}))
    const { id, name, subject, content, category } = body ?? {}
    if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
    if (!String(name ?? '').trim() || !String(content ?? '').trim()) {
      return NextResponse.json({ success: false, error: 'Name and content are required' }, { status: 400 })
    }
    const placeholders = [...new Set((String(content).match(/\{\{[^}]+\}\}/g) || []))]
    const { data, error } = await (createAdminClient() as any)
      .from('message_templates')
      .update({ name: String(name).trim(), subject: subject ?? null, body: content, category: category || 'customer', placeholders, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)
      .select('id')
    if (error) {
      console.error('Error updating template:', error)
      return NextResponse.json({ success: false, error: 'Failed to update template' }, { status: 500 })
    }
    if (!data?.length) return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Email templates PUT error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE — switch a template off (is_active false), as the list reads only active ones.
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const denied = roleDenied(authResult.role, 'staff')
    if (denied) return denied
    const body = await request.json().catch(() => ({}))
    if (!body?.id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 })
    const { data, error } = await (createAdminClient() as any)
      .from('message_templates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', body.id)
      .eq('tenant_id', authResult.tenant_id)
      .select('id')
    if (error) {
      console.error('Error deleting template:', error)
      return NextResponse.json({ success: false, error: 'Failed to delete template' }, { status: 500 })
    }
    if (!data?.length) return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Email templates DELETE error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
