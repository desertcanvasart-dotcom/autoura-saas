import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// GET - Get single template
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()

    const { data, error} = await supabase
      .from('message_templates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Template GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update template
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Require authentication - RLS will enforce tenant boundaries
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
    const { name, description, category, subcategory, channel, subject, body: templateBody, language } = body

    // Extract placeholders from body
    const placeholderMatches = templateBody?.match(/\{\{[^}]+\}\}/g) || []
    const placeholders = [...new Set(placeholderMatches)]

    // First get current version
    const { data: currentTemplate } = await supabase
      .from('message_templates')
      .select('version')
      .eq('id', id)
      .single()

    const updateData: any = {
      updated_at: new Date().toISOString(),
      version: (currentTemplate?.version || 0) + 1, // Increment version
      last_modified_by: authResult.user_id
    }
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (category !== undefined) updateData.category = category
    if (subcategory !== undefined) updateData.subcategory = subcategory
    if (channel !== undefined) updateData.channel = channel
    if (subject !== undefined) updateData.subject = subject
    if (language !== undefined) updateData.language = language
    if (templateBody !== undefined) {
      updateData.body = templateBody
      updateData.placeholders = placeholders
    }

    // Do NOT include tenant_id or parent_template_id in update (prevents switching)
    delete updateData.tenant_id
    delete updateData.parent_template_id

    const { data, error } = await supabase
      .from('message_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating template:', error)
      return NextResponse.json({ success: false, error: 'Failed to update template' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Template PUT error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete template (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Require authentication - RLS policies enforce manager role
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

    const { error } = await supabase
      .from('message_templates')
      .update({ is_active: false })
      .eq('id', id)

    if (error) {
      console.error('Error deleting template:', error)
      return NextResponse.json({ success: false, error: 'Failed to delete template' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Template deleted' })
  } catch (error) {
    console.error('Template DELETE error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}