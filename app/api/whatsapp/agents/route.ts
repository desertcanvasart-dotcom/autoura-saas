import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'

// GET /api/whatsapp/agents - List all team members (for WhatsApp assignment)
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
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
    const supabase = createClient()
    const body = await request.json()

    const { name, email, phone, user_id, avatar_url, max_conversations, role } = body

    if (!name) {
      return NextResponse.json({ error: 'Agent name is required' }, { status: 400 })
    }

    // Check if team member with same email already exists
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
        name,
        email: email || null,
        phone: phone || null,
        user_id: user_id || null,
        avatar_url: avatar_url || null,
        role: role || 'sales',
        max_conversations: max_conversations || 50,
        is_active: true,
        is_available: true,
        current_conversations: 0
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
    const supabase = createClient()
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
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 })
    }

    // Soft delete - just deactivate
    const { data, error } = await supabase
      .from('team_members')
      .update({
        is_active: false,
        is_available: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Unassign all conversations from this team member
    await supabase
      .from('whatsapp_conversations')
      .update({
        assigned_team_member_id: null,
        assigned_agent_id: null,
        assigned_at: null
      })
      .eq('assigned_team_member_id', id)

    return NextResponse.json({ 
      success: true, 
      message: 'Agent deactivated successfully'
    })
  } catch (error: any) {
    console.error('Error deactivating agent:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}