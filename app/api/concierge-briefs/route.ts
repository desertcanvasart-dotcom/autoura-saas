import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'

// GET /api/concierge-briefs
// List AI-Concierge planning briefs for the authenticated user's tenant
// (RLS scopes by tenant). Optional ?status= filter.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createAuthenticatedClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const status = new URL(request.url).searchParams.get('status')

    let query = supabase
      .from('concierge_briefs')
      .select(
        'id, conversation_id, brief_revision, language, visitor_name, visitor_email, ' +
        'visitor_phone, preferred_contact, travelers_count, travelers_detail, dates_specific, ' +
        'dates_window, trip_length_days, origin_city, nationality, destinations, comfort_level, ' +
        'interests, must_see, must_avoid, brief_summary, constraint_dietary, constraint_mobility, ' +
        'constraint_religious, constraint_medical, review_status, is_actionable, flags, client_id, ' +
        'received_at, committed_response_by'
      )
      .order('received_at', { ascending: false })
      .limit(200)

    if (status && status !== 'all') {
      query = query.eq('review_status', status)
    }

    const { data, error } = await query

    if (error) {
      // Table may not exist yet (migration 215 not applied) — return empty.
      console.error('Error fetching concierge briefs:', error.message)
      return NextResponse.json({ success: true, data: [] })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('Error in concierge-briefs GET:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
