import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

/**
 * GET /api/templates/schedule
 * List scheduled sends for the current tenant
 */
export async function GET(request: NextRequest) {
  try {
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
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    let query = supabase
      .from('scheduled_sends')
      .select(`
        *,
        template:message_templates(id, name, channel)
      `)
      .eq('tenant_id', tenant_id)
      .order('scheduled_for', { ascending: true })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching scheduled sends:', error)
      return NextResponse.json({ success: false, error: 'Failed to fetch scheduled sends' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Scheduled sends GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/templates/schedule
 * Schedule a new send
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id, user_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const body = await request.json()
    const {
      templateId,
      recipientType,
      recipientId,
      recipientContact,
      channel,
      subject,
      body: messageBody,
      scheduledFor,
      timezone
    } = body

    if (!templateId || !recipientContact || !messageBody || !scheduledFor) {
      return NextResponse.json({
        success: false,
        error: 'Template, recipient, message body, and scheduled time are required'
      }, { status: 400 })
    }

    // Validate scheduled time is in the future
    const scheduledDate = new Date(scheduledFor)
    if (scheduledDate <= new Date()) {
      return NextResponse.json({
        success: false,
        error: 'Scheduled time must be in the future'
      }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('scheduled_sends')
      .insert({
        tenant_id,
        template_id: templateId,
        recipient_type: recipientType || 'client',
        recipient_id: recipientId,
        recipient_contact: recipientContact,
        channel,
        subject,
        body: messageBody,
        scheduled_for: scheduledFor,
        timezone: timezone || 'UTC',
        status: 'pending',
        created_by: user_id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error scheduling send:', error)
      return NextResponse.json({ success: false, error: 'Failed to schedule send' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Schedule POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/templates/schedule
 * Cancel a scheduled send
 */
export async function DELETE(request: NextRequest) {
  try {
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
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('scheduled_sends')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('status', 'pending') // Can only cancel pending sends

    if (error) {
      console.error('Error cancelling scheduled send:', error)
      return NextResponse.json({ success: false, error: 'Failed to cancel scheduled send' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Scheduled send cancelled' })
  } catch (error) {
    console.error('Schedule DELETE error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
