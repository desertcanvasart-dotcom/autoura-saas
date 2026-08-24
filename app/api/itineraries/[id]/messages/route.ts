import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { resolveTeamMemberIdForUser } from '@/lib/notifications'
import { cleanClientText } from '@/lib/itinerary-share'

/**
 * The trip thread, office side — session-gated, RLS-scoped. GET returns the
 * thread (and marks traveller messages read); POST replies as the office.
 * RLS pins authenticated inserts to direction='outbound' (mig 291), so this
 * route structurally cannot forge a traveller message even if handed a
 * poisoned body.
 */

const MAX_MESSAGE = 2000

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult
    const { id: itineraryId } = await params

    // NEWEST 200, re-sorted ascending for display: an oldest-first limit
    // would permanently hide new traveller messages once a thread outgrows
    // the window. Reading does NOT mark anything read — that is PATCH's job,
    // fired when a human actually has the thread in view (merely expanding
    // an /ops row must not clear the office's unread signal).
    const { data: rows, error } = await supabase
      .from('trip_messages')
      .select('id, direction, content, sender_name, is_read, created_at')
      .eq('itinerary_id', itineraryId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) {
      console.error('[itinerary messages GET]', error.message)
      return NextResponse.json({ success: false, error: 'Failed to load messages' }, { status: 500 })
    }

    return NextResponse.json({ success: true, messages: (rows ?? []).reverse() })
  } catch (err) {
    console.error('[itinerary messages GET]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Mark the traveller's messages read. Separate from GET so the signal is
 * cleared only when a human has actually seen the thread — the chat
 * component fires this when it scrolls into view (and on reply), not on
 * mount. The mig 292 trigger recomputes the conversation's unread counter
 * from this write, so the inbox badge follows automatically.
 */
export async function PATCH(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult
    const { id: itineraryId } = await params

    const { error } = await supabase
      .from('trip_messages')
      .update({ is_read: true })
      .eq('itinerary_id', itineraryId)
      .eq('direction', 'inbound')
      .eq('is_read', false)
    if (error) {
      console.error('[itinerary messages PATCH]', error.message)
      return NextResponse.json({ success: false, error: 'Failed to mark read' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[itinerary messages PATCH]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id, user } = authResult
    const { id: itineraryId } = await params

    // RLS scopes the read; a foreign itinerary comes back empty.
    const { data: itinerary } = await supabase
      .from('itineraries')
      .select('id')
      .eq('id', itineraryId)
      .maybeSingle()
    if (!itinerary) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    const content = cleanClientText((body ?? {})?.message, MAX_MESSAGE)
    if (!content) {
      return NextResponse.json({ success: false, error: 'Please write a message.' }, { status: 400 })
    }

    // Who is speaking, by name — the traveller sees this on the share page.
    let teamMemberId: string | null = null
    let senderName: string | null = null
    if (user?.email) {
      teamMemberId = await resolveTeamMemberIdForUser(supabase, tenant_id!, user.email)
      if (teamMemberId) {
        const { data: tm } = await supabase
          .from('team_members').select('name').eq('id', teamMemberId).maybeSingle()
        senderName = tm?.name ?? null
      }
    }

    // Thread continuity: reuse the conversation the traveller side linked.
    const { data: prev } = await supabase
      .from('trip_messages')
      .select('unified_conversation_id')
      .eq('itinerary_id', itineraryId)
      .not('unified_conversation_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: inserted, error: insErr } = await supabase
      .from('trip_messages')
      .insert({
        tenant_id: tenant_id!,
        itinerary_id: itineraryId,
        unified_conversation_id: prev?.unified_conversation_id ?? null,
        direction: 'outbound',
        content,
        sender_name: senderName,
        team_member_id: teamMemberId,
        is_read: true,
      })
      .select('id, direction, content, sender_name, is_read, created_at')
      .single()
    if (insErr) {
      console.error('[itinerary messages POST]', insErr.message)
      return NextResponse.json({ success: false, error: 'Failed to send' }, { status: 500 })
    }

    // Conversation counters/preview: recomputed from source by the DB
    // trigger on trip_messages (mig 292).

    return NextResponse.json({ success: true, message: inserted })
  } catch (err) {
    console.error('[itinerary messages POST]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
