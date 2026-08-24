import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isValidShareToken, toClientTripMessages, cleanClientText } from '@/lib/itinerary-share'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendPushToTenant } from '@/lib/push'

/**
 * The trip thread, traveller side. Token-authenticated like the report
 * route: the unrevoked share token IS the credential (middleware self-auth
 * allowlist; sweep proof = isValidShareToken + revoked_at). GET returns the
 * thread through the toClientTripMessages allowlist; POST writes an inbound
 * row with every identity derived server-side and mirrors the thread into
 * unified_conversations so it surfaces where the office already watches.
 */

const MAX_MESSAGE = 2000
const MAX_NAME = 120
// Store-backed cap behind the in-memory limiters: a chat is chattier than a
// problem report, but 60 traveller messages in an hour is not a chat.
const MAX_MESSAGES_PER_HOUR = 60


async function resolveShare(token: string) {
  if (!isValidShareToken(token)) return null
  const supabase = createAdminClient()
  const { data: share } = await supabase
    .from('itinerary_shares')
    .select('itinerary_id, tenant_id, revoked_at')
    .eq('token', token)
    .maybeSingle()
  if (!share || share.revoked_at) return null
  return { supabase, share }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const resolved = await resolveShare(token)
    if (!resolved) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    const { supabase, share } = resolved
    const { data: rows } = await supabase
      .from('trip_messages')
      .select('direction, content, sender_name, created_at')
      .eq('itinerary_id', share.itinerary_id)
      .order('created_at', { ascending: false })
      .limit(50)
    return NextResponse.json({
      success: true,
      messages: toClientTripMessages((rows ?? []) as Array<Record<string, unknown>>),
    })
  } catch (err) {
    console.error('[share messages GET]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkRateLimit(`share-msg:${ip}`, 'contact').success ||
        !checkRateLimit(`share-msg:${token}`, 'contact').success) {
      return NextResponse.json(
        { success: false, error: 'Too many messages — please slow down.' },
        { status: 429 }
      )
    }

    const resolved = await resolveShare(token)
    if (!resolved) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    const { supabase, share } = resolved

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
    }
    const { message: rawMessage, name: rawName } = (body ?? {}) as Record<string, unknown>
    const content = cleanClientText(rawMessage, MAX_MESSAGE)
    if (!content) {
      return NextResponse.json({ success: false, error: 'Please write a message.' }, { status: 400 })
    }
    const name = cleanClientText(rawName, MAX_NAME)

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('trip_messages')
      .select('id', { count: 'exact', head: true })
      .eq('itinerary_id', share.itinerary_id)
      .eq('direction', 'inbound')
      .gte('created_at', hourAgo)
    if ((count ?? 0) >= MAX_MESSAGES_PER_HOUR) {
      return NextResponse.json(
        { success: false, error: 'Too many messages this hour — please contact your operator directly.' },
        { status: 429 }
      )
    }

    const { data: itinerary } = await supabase
      .from('itineraries')
      .select('trip_name, client_id, client_name, client_email')
      .eq('id', share.itinerary_id)
      .maybeSingle()

    // The comms anchor: reuse the thread's conversation, else find the
    // client's by email, else start one. Best-effort — a conversation
    // failure must not lose the message itself.
    let conversationId: string | null = null
    try {
      const { data: prev } = await supabase
        .from('trip_messages')
        .select('unified_conversation_id')
        .eq('itinerary_id', share.itinerary_id)
        .not('unified_conversation_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      conversationId = (prev?.unified_conversation_id as string | null) ?? null

      if (!conversationId && itinerary?.client_email) {
        const { data: existing } = await supabase
          .from('unified_conversations')
          .select('id')
          .eq('tenant_id', share.tenant_id)
          .eq('contact_email', itinerary.client_email)
          .maybeSingle()
        conversationId = existing?.id ?? null
      }
      if (!conversationId) {
        const { data: created } = await supabase
          .from('unified_conversations')
          .insert({
            tenant_id: share.tenant_id,
            client_id: itinerary?.client_id ?? null,
            contact_name: itinerary?.client_name ?? name ?? itinerary?.trip_name ?? 'Traveller',
            contact_email: itinerary?.client_email ?? null,
          })
          .select('id')
          .single()
        conversationId = created?.id ?? null
      }
    } catch (err) {
      console.error('[share messages POST] conversation link failed:', err)
    }

    const { data: inserted, error: insErr } = await supabase
      .from('trip_messages')
      .insert({
        tenant_id: share.tenant_id,
        itinerary_id: share.itinerary_id,
        unified_conversation_id: conversationId,
        direction: 'inbound',
        content,
        sender_name: name ?? itinerary?.client_name ?? null,
      })
      .select('direction, content, sender_name, created_at')
      .single()
    if (insErr) {
      console.error('[share messages POST] insert failed:', insErr.message)
      return NextResponse.json(
        { success: false, error: 'Could not send — please try again.' },
        { status: 500 }
      )
    }

    // Conversation counters: read-modify-write at signal fidelity (the
    // view_count precedent) — never worth failing the send over.
    if (conversationId) {
      try {
        const { data: conv } = await supabase
          .from('unified_conversations')
          .select('total_messages, unread_messages')
          .eq('id', conversationId)
          .maybeSingle()
        await supabase
          .from('unified_conversations')
          .update({
            total_messages: (conv?.total_messages ?? 0) + 1,
            unread_messages: (conv?.unread_messages ?? 0) + 1,
            last_message_at: new Date().toISOString(),
            last_message_preview: content.length > 120 ? `${content.slice(0, 117)}…` : content,
            last_message_channel: 'trip',
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversationId)
      } catch (err) {
        console.error('[share messages POST] counter update failed:', err)
      }
    }

    void sendPushToTenant(share.tenant_id, {
      title: `${name ?? itinerary?.client_name ?? 'Traveller'} — ${itinerary?.trip_name ?? 'trip message'}`,
      body: content.length > 120 ? `${content.slice(0, 117)}…` : content,
      url: `/itineraries/${share.itinerary_id}`,
      tag: `trip-msg-${share.itinerary_id}`,
    })

    return NextResponse.json({
      success: true,
      message: toClientTripMessages([inserted as Record<string, unknown>])[0] ?? null,
    })
  } catch (err) {
    console.error('[share messages POST]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
