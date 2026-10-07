import { NextRequest, NextResponse } from 'next/server'
import { markTeamNotificationsRead } from '@/lib/notifications'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

const ALLOWED_STATUSES = ['needs_review', 'in_progress', 'responded', 'archived'] as const

// GET /api/concierge-briefs/[id]
// Full brief including full_transcript (RLS-scoped to the tenant).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createAuthenticatedClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('concierge_briefs')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: 'Brief not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in concierge-brief GET:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/concierge-briefs/[id]
// Triage action: update a brief's review_status (tenant-scoped via RLS).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const authResult = await requireAuth()
    if (authResult.error || !authResult.supabase) {
      return NextResponse.json(
        { success: false, error: authResult.error || 'Authentication failed' },
        { status: authResult.status || 401 }
      )
    }
    const { supabase } = authResult

    const body = await request.json()
    const reviewStatus = body.review_status

    if (!ALLOWED_STATUSES.includes(reviewStatus)) {
      return NextResponse.json(
        { success: false, error: `review_status must be one of: ${ALLOWED_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('concierge_briefs')
      .update({ review_status: reviewStatus })
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)
      .select('id, review_status')
      .maybeSingle()

    if (error) {
      console.error('Error updating concierge brief:', error.message)
      return NextResponse.json({ success: false, error: 'Failed to update brief' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ success: false, error: 'Brief not found' }, { status: 404 })
    }

    // Picked up (or answered, or archived) by one = no longer new for anyone.
    if (reviewStatus !== 'needs_review') await markTeamNotificationsRead(`concierge:${id}`)

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in concierge-briefs PATCH:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/concierge-briefs/[id]
// Permanently remove a lead — test enquiries, spam. Only an ARCHIVED lead
// (archive first, then delete: a live enquiry is never one click from gone),
// and only manager and above. Its revisions go with it (ON DELETE CASCADE);
// email threads linked to it are kept, unlinked (SET NULL). The CRM client
// the lead created is a separate record and stays in Clients.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const authResult = await requireAuth()
    if (authResult.error || !authResult.supabase) {
      return NextResponse.json(
        { success: false, error: authResult.error || 'Authentication failed' },
        { status: authResult.status || 401 }
      )
    }
    if (!['owner', 'admin', 'manager'].includes(authResult.role || '')) {
      return NextResponse.json(
        { success: false, error: 'Only a manager or admin can delete a lead' },
        { status: 403 }
      )
    }
    const { supabase } = authResult

    const { data: brief } = await supabase
      .from('concierge_briefs')
      .select('id, review_status')
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)
      .maybeSingle()
    if (!brief) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 })
    }
    if (brief.review_status !== 'archived') {
      return NextResponse.json(
        { success: false, error: 'Archive the lead first — only an archived lead can be deleted' },
        { status: 409 }
      )
    }

    const { data: deleted, error } = await supabase
      .from('concierge_briefs')
      .delete()
      .eq('id', id)
      .eq('tenant_id', authResult.tenant_id)
      .select('id')
    if (error) {
      console.error('Error deleting concierge brief:', error.message)
      return NextResponse.json({ success: false, error: 'Failed to delete the lead' }, { status: 500 })
    }
    // Zero rows = RLS refused it; never report a delete that did not happen.
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ success: false, error: 'The lead could not be deleted' }, { status: 403 })
    }

    await markTeamNotificationsRead(`concierge:${id}`)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in concierge-briefs DELETE:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
