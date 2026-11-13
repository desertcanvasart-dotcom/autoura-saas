// ============================================
// POST /api/whatsapp/attachment — send a file from the inbox (2026-11-13)
// ============================================
// The inbox's attach button posts multipart form data: `conversation_id`,
// `file`, and an optional `caption`. The file must be a type WhatsApp
// delivers and within its size (lib/whatsapp/attachments checkSendable). It is
// stored in the PRIVATE whatsapp-media bucket under
// outbound/<tenant>/<uuid>/<its own name>, so the link the provider fetches —
// and the document the customer receives — carries the real file name. The
// provider gets a signed link valid for an hour (it fetches right away). The
// message row keeps the storage path and the name, so the inbox shows and
// downloads it through /api/whatsapp/media/[id] like any other.
//
// Modelled on /api/whatsapp/voice-note: the same guard, conversation check
// and clean-up on a failed send.

import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendGuard } from '@/lib/send-guard'
import { requireAuth } from '@/lib/supabase-server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { MEDIA_BUCKET, outboundFilePath, uploadWhatsAppMedia } from '@/lib/whatsapp/voice-note-storage'
import { checkSendable, safeFileName } from '@/lib/whatsapp/attachments'

export const dynamic = 'force-dynamic'

const PROVIDER_LINK_TTL_SECONDS = 60 * 60
const MAX_CAPTION = 1000

let _admin: ReturnType<typeof createClient> | null = null
function admin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _admin
}

const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status })

export async function POST(request: NextRequest) {
  const gate = await sendGuard('messaging')
  if (gate) return gate
  try {
    const auth = await requireAuth()
    if (auth.error !== null) return fail(auth.error, auth.status)
    const { supabase, tenant_id, user } = auth
    if (!supabase || !tenant_id || !user) return fail('Authentication failed', 401)

    const form = await request.formData().catch(() => null)
    const conversationId = form?.get('conversation_id')
    const file = form?.get('file')
    const captionRaw = form?.get('caption')
    if (typeof conversationId !== 'string' || !(file instanceof File)) {
      return fail('Send conversation_id and the file.', 400)
    }
    const caption = typeof captionRaw === 'string' ? captionRaw.trim().slice(0, MAX_CAPTION) : ''

    const check = checkSendable({ name: file.name, type: file.type, size: file.size })
    if (!check.ok) return fail(check.error, check.error.includes(' MB') ? 413 : 400)

    // The caller's RLS-bound read: a conversation they cannot see is a 404.
    const { data: conv } = await supabase
      .from('whatsapp_conversations')
      .select('id, phone_number, tenant_id')
      .eq('id', conversationId)
      .maybeSingle()
    if (!conv || conv.tenant_id !== tenant_id) return fail('Conversation not found', 404)

    const name = safeFileName(file.name, check.mime)
    const path = outboundFilePath(tenant_id, randomUUID(), name)
    const { error: upErr } = await uploadWhatsAppMedia(admin() as never, path, new Uint8Array(await file.arrayBuffer()), { contentType: check.mime, upsert: false })
    if (upErr) {
      console.error('attachment upload error:', upErr.message)
      return fail('Could not store the file.', 500)
    }
    const removeFile = () => admin().storage.from(MEDIA_BUCKET).remove([path]).then(() => undefined, () => undefined)

    const { data: signed, error: signErr } = await admin().storage.from(MEDIA_BUCKET).createSignedUrl(path, PROVIDER_LINK_TTL_SECONDS)
    if (signErr || !signed?.signedUrl) {
      await removeFile()
      return fail('Could not prepare the file.', 500)
    }

    const to = conv.phone_number.startsWith('+') ? conv.phone_number : `+${conv.phone_number}`
    const sent = await sendWhatsAppMessage({
      to,
      body: caption,
      mediaUrl: signed.signedUrl,
      tenantId: tenant_id,
      statusCallback: `${process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net'}/api/whatsapp/status-callback`,
    })
    if (!sent.success || !sent.messageId) {
      await removeFile()
      return fail(sent.error || 'WhatsApp did not accept the file.', 502)
    }

    const { data: saved, error: saveErr } = await supabase
      .from('whatsapp_messages')
      .insert({
        tenant_id,
        conversation_id: conv.id,
        message_sid: sent.messageId,
        direction: 'outbound',
        message_body: caption,
        media_type: check.mime,
        media_storage_path: path,
        media_filename: file.name.slice(0, 200),
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_by: user.id,
        metadata: { attachment: true, bytes: file.size },
      })
      .select()
      .single()
    if (saveErr) throw saveErr

    return NextResponse.json({ success: true, message: saved, message_id: sent.messageId })
  } catch (error) {
    console.error('attachment send error:', error)
    return fail('Failed to send the file.', 500)
  }
}
