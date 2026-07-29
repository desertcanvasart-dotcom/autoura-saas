import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// GET /api/whatsapp/agents - List all team members (for WhatsApp assignment)
export async function GET(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - protects team member data
    const supabase = await createAuthenticatedClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active_only') !== 'false'
    const availableOnly = searchParams.get('available_only') === 'true'

    let query = supabase
      .from('team_members')
      .select('id, name, email, phone, avatar_url, role, is_active, is_available, max_conversations, current_conversations, last_assigned_at, created_at, updated_at')
      .order('name', { ascending: true })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    if (availableOnly) {
      query = query.eq('is_available', true)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({
      success: true,
      agents: data || [],
      count: data?.length || 0
    })
  } catch (error: any) {
    console.error('Error fetching agents:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/whatsapp/agents - Create new team member / agent
export async function POST(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - prevents unauthorized agent creation
    // (also resolves tenant_id, which team_members inserts require)
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({
        error: authResult.error
      }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult

    const body = await request.json()

    const { name, email, phone, role } = body

    if (!name) {
      return NextResponse.json({ error: 'Agent name is required' }, { status: 400 })
    }

    if (email) {
      const { data: existing } = await supabase
        .from('team_members')
        .select('id')
        .eq('email', email)
        .single()

      if (existing) {
        return NextResponse.json({ error: 'Team member with this email already exists' }, { status: 400 })
      }
    }

    const { data, error } = await supabase
      .from('team_members')
      .insert({
        tenant_id,
        name,
        email: email || null,
        phone: phone || null,
        role: role || 'sales',
        is_active: true
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      agent: data,
      message: 'Agent created successfully'
    })
  } catch (error: any) {
    console.error('Error creating agent:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH /api/whatsapp/agents - Update team member / agent
export async function PATCH(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - prevents unauthorized agent modification
    const supabase = await createAuthenticatedClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('team_members')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      agent: data,
      message: 'Agent updated successfully'
    })
  } catch (error: any) {
    console.error('Error updating agent:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE /api/whatsapp/agents - Deactivate agent (soft delete)
export async function DELETE(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - prevents unauthorized agent deactivation
    const supabase = await createAuthenticatedClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('team_members')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: 'Agent deactivated successfully'
    })
  } catch (error: any) {
    console.error('Error deactivating agent:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
