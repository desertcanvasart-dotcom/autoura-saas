// ============================================
// Keep our own copy of a customer's WhatsApp file (2026-11-13)
// ============================================
// On the Twilio connection the webhook stored only Twilio's link to the file,
// and the inbox fetched it from Twilio on every view. Every attachment
// depended on that Twilio account forever: closing it (the move to Meta) or
// Twilio deleting the media would leave every older photo and PDF unopenable.
//
// After a message is stored, its file is copied into the PRIVATE whatsapp-media
// bucket at inbound/<sid>.<ext> and the row gains media_storage_path. The
// Twilio link stays on the row as the fallback. Used by the webhook (fire and
// forget, so Twilio is answered at once) and by the one-off backfill script.
//
// Only our own account's Twilio links are ever fetched with its credentials
// (isOwnTwilioMediaUrl); never an arbitrary URL a row was edited to hold.

import type { SupabaseClient } from '@supabase/supabase-js'
import { MEDIA_BUCKET, inboundFilePath, isOwnTwilioMediaUrl } from './voice-note-storage'
import { bareMime, extFor } from './attachments'

/** Larger than anything WhatsApp delivers (16 MB media, 100 MB documents on Meta). */
const MAX_COPY_BYTES = 100 * 1024 * 1024

export type KeepResult =
  | { ok: true; path: string }
  | { ok: false; reason: string }

export interface KeepDeps {
  fetch?: typeof fetch
  accountSid?: string
  authToken?: string
}

/** Copy one Twilio-hosted file into our bucket and point the row at it. */
export async function keepTwilioMedia(
  admin: SupabaseClient,
  row: { message_sid: string; media_url: string | null; media_type: string | null },
  deps: KeepDeps = {},
): Promise<KeepResult> {
  const sid = deps.accountSid ?? process.env.TWILIO_ACCOUNT_SID
  const token = deps.authToken ?? process.env.TWILIO_AUTH_TOKEN
  const doFetch = deps.fetch ?? fetch
  if (!row.media_url || !isOwnTwilioMediaUrl(row.media_url, sid) || !token) {
    return { ok: false, reason: 'not one of our Twilio media links' }
  }
  try {
    // Only for a message that was stored (a blocked sender's is not) and has
    // no copy yet.
    const { data: stored } = await admin
      .from('whatsapp_messages').select('media_storage_path').eq('message_sid', row.message_sid).maybeSingle()
    if (!stored) return { ok: false, reason: 'message not stored' }
    if ((stored as { media_storage_path: string | null }).media_storage_path) return { ok: false, reason: 'already copied' }

    const res = await doFetch(row.media_url, {
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` },
      redirect: 'follow',
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) return { ok: false, reason: `Twilio answered ${res.status}` }
    const declared = Number(res.headers.get('content-length') || 0)
    if (declared > MAX_COPY_BYTES) return { ok: false, reason: 'file too large to copy' }
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength === 0) return { ok: false, reason: 'empty file' }
    if (bytes.byteLength > MAX_COPY_BYTES) return { ok: false, reason: 'file too large to copy' }

    const mime = bareMime(res.headers.get('content-type')) || bareMime(row.media_type) || 'application/octet-stream'
    const path = inboundFilePath(row.message_sid, extFor(mime))
    const up = await admin.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: mime, upsert: true })
    if (up.error) return { ok: false, reason: `storage: ${up.error.message}` }

    const { error } = await admin
      .from('whatsapp_messages')
      .update({ media_storage_path: path })
      .eq('message_sid', row.message_sid)
      .is('media_storage_path', null)
    if (error) return { ok: false, reason: `saving the path: ${error.message}` }
    return { ok: true, path }
  } catch (err) {
    return { ok: false, reason: (err as Error).message }
  }
}
