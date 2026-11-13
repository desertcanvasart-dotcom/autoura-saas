// ============================================
// POST /api/whatsapp/voice-note — send a recorded voice note (2026-11-07)
// ============================================
// The inbox's microphone button posts the browser's recording here as
// multipart form data: `conversation_id` and `audio`. The recording is
// re-wrapped as Ogg/Opus (lib/whatsapp/webm-opus-to-ogg — the only audio
// WhatsApp plays as a voice note), stored in the PRIVATE whatsapp-media bucket
// under outbound/<tenant>/<uuid>.ogg, and sent with a short-lived signed link
// the provider fetches once. The message row keeps the storage path, so the
// inbox plays it back through /api/whatsapp/media/[id] like an inbound one.

import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendGuard } from '@/lib/send-guard'
import { requireAuth } from '@/lib/supabase-server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { toWhatsAppVoiceNote, oggOpusDurationSeconds, VoiceNoteFormatError } from '@/lib/whatsapp/webm-opus-to-ogg'
import { MEDIA_BUCKET, outboundVoicePath, MAX_VOICE_NOTE_BYTES, MAX_VOICE_NOTE_SECONDS, uploadWhatsAppMedia } from '@/lib/whatsapp/voice-note-storage'

export const dynamic = 'force-dynamic'

// The provider fetches the file right after the send; an hour covers retries.
const PROVIDER_LINK_TTL_SECONDS = 60 * 60

let _admin: ReturnType<typeof createClient> | null = null
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _admin
}

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status })

export async function POST(request: NextRequest) {
  // Staff only, and the same per-person/per-company ceiling as text messages.
  const gate = await sendGuard('messaging')
  if (gate) return gate
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return fail(auth.error, auth.status)
    const { supabase, tenant_id, user } = auth
    if (!supabase || !tenant_id || !user) return fail('Authentication failed', 401)

    const form = await request.formData().catch(() => null)
    const conversationId = form?.get('conversation_id')
    const audio = form?.get('audio')
    if (typeof conversationId !== 'string' || !(audio instanceof Blob)) {
      return fail('Send conversation_id and the recording as audio.', 400)
    }
    if (audio.size === 0) return fail('The recording is empty.', 400)
    if (audio.size > MAX_VOICE_NOTE_BYTES) return fail('The recording is too large.', 413)

    // The caller's RLS-bound read: a conversation they cannot see is a 404.
    const { data: conv } = await supabase
      .from('whatsapp_conversations')
      .select('id, phone_number, tenant_id')
      .eq('id', conversationId)
      .maybeSingle()
    if (!conv || conv.tenant_id !== tenant_id) return fail('Conversation not found', 404)

    let ogg: Uint8Array
    try {
      ogg = toWhatsAppVoiceNote(new Uint8Array(await audio.arrayBuffer()))
    } catch (e) {
      if (e instanceof VoiceNoteFormatError) return fail(e.message, 400)
      throw e
    }
    const seconds = oggOpusDurationSeconds(ogg)
    if (seconds > MAX_VOICE_NOTE_SECONDS) return fail(`Voice notes can be up to ${MAX_VOICE_NOTE_SECONDS / 60} minutes.`, 400)

    const path = outboundVoicePath(tenant_id, randomUUID())
    const { error: upErr } = await uploadWhatsAppMedia(admin() as never, path, ogg, { contentType: 'audio/ogg', upsert: false })
    if (upErr) {
      console.error('voice note upload error:', upErr.message)
      return fail('Could not store the voice note.', 500)
    }
    const removeFile = () => admin().storage.from(MEDIA_BUCKET).remove([path]).then(() => undefined, () => undefined)

    const { data: signed, error: signErr } = await admin().storage.from(MEDIA_BUCKET).createSignedUrl(path, PROVIDER_LINK_TTL_SECONDS)
    if (signErr || !signed?.signedUrl) {
      await removeFile()
      return fail('Could not prepare the voice note.', 500)
    }

    const to = conv.phone_number.startsWith('+') ? conv.phone_number : `+${conv.phone_number}`
    const sent = await sendWhatsAppMessage({
      to,
      body: '',
      mediaUrl: signed.signedUrl,
      tenantId: tenant_id,
      statusCallback: `${process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net'}/api/whatsapp/status-callback`,
    })
    if (!sent.success || !sent.messageId) {
      await removeFile()
      return fail(sent.error || 'WhatsApp did not accept the voice note.', 502)
    }

    const sentAt = new Date().toISOString()
    const { data: saved, error: saveErr } = await supabase
      .from('whatsapp_messages')
      .insert({
        tenant_id,
        conversation_id: conv.id,
        message_sid: sent.messageId,
        direction: 'outbound',
        message_body: '',
        media_type: 'audio/ogg',
        media_storage_path: path,
        status: 'sent',
        sent_at: sentAt,
        sent_by: user.id,
        metadata: { voice_note: true, seconds: Math.round(seconds * 10) / 10 },
      })
      .select()
      .single()
    if (saveErr) throw saveErr

    return NextResponse.json({ success: true, message: saved, message_id: sent.messageId })
  } catch (error) {
    console.error('voice note send error:', error)
    return fail('Failed to send the voice note.', 500)
  }
}
