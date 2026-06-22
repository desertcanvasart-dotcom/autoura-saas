import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

const ALLOWED_STATUSES = ['needs_review', 'in_progress', 'responded', 'archived'] as const

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
      .select('id, review_status')
      .single()

    if (error) {
      console.error('Error updating concierge brief:', error.message)
      return NextResponse.json({ success: false, error: 'Failed to update brief' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in concierge-briefs PATCH:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
