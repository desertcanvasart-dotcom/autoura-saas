// Where WhatsApp media lives in storage, and which paths a message may point
// at — shared by the webhook-side reader (/api/whatsapp/media/[id]) and the
// voice-note sender, so the two cannot drift.

export const MEDIA_BUCKET = 'whatsapp-media'

/** The part of a storage client that uploads and makes buckets. */
interface MediaStorage {
  storage: {
    from(bucket: string): { upload(path: string, body: Uint8Array | ArrayBuffer | Blob, opts: { contentType: string; upsert?: boolean }): PromiseLike<{ error: { message: string } | null }> }
    createBucket(name: string, opts: { public: boolean }): PromiseLike<{ error: { message: string } | null }>
  }
}

/**
 * Upload into the whatsapp-media bucket, creating it — PRIVATE — the first
 * time it is needed. Found 2026-11-13: the bucket did not exist on the live
 * system (only Meta's inbound path knew how to make it), so every outgoing
 * voice note, every sent attachment and every kept copy failed with "Bucket
 * not found". Every upload goes through here so none can miss it again.
 */
export async function uploadWhatsAppMedia(
  client: MediaStorage,
  path: string,
  body: Uint8Array | ArrayBuffer | Blob,
  opts: { contentType: string; upsert?: boolean },
): Promise<{ error: { message: string } | null }> {
  let res = await client.storage.from(MEDIA_BUCKET).upload(path, body, opts)
  if (res.error && /bucket.*not.*found/i.test(res.error.message)) {
    // PRIVATE: customers' passports and payment slips. Reads go through
    // /api/whatsapp/media/[id], which checks the caller and signs a link.
    const made = await client.storage.createBucket(MEDIA_BUCKET, { public: false })
    if (made.error && !/already exists/i.test(made.error.message)) return { error: made.error }
    res = await client.storage.from(MEDIA_BUCKET).upload(path, body, opts)
  }
  return { error: res.error }
}

/** A browser voice note is ~10–30 KB a minute; this is generous. */
export const MAX_VOICE_NOTE_BYTES = 10 * 1024 * 1024
export const MAX_VOICE_NOTE_SECONDS = 5 * 60

const SAFE = /[^a-zA-Z0-9_-]/g

/** outbound/<tenant>/<id>.ogg — the tenant in the path is what lets the reader check it. */
export function outboundVoicePath(tenantId: string, id: string): string {
  return `outbound/${tenantId.replace(SAFE, '_')}/${id.replace(SAFE, '_')}.ogg`
}

/**
 * outbound/<tenant>/<id>/<file-name> — an attachment sent from the inbox. The
 * file's own (safe) name ends the path, so the link the provider fetches
 * carries it and the customer's WhatsApp shows "Itinerary.pdf", not an id.
 */
export function outboundFilePath(tenantId: string, id: string, safeName: string): string {
  return `outbound/${tenantId.replace(SAFE, '_')}/${id.replace(SAFE, '_')}/${safeName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
}

/** inbound/<sid>.<ext> — where a customer's file is kept once we have the bytes. */
export function inboundFilePath(messageSid: string, ext: string): string {
  return `inbound/${messageSid.replace(SAFE, '_')}.${ext.replace(/[^a-z0-9]/g, '') || 'bin'}`
}

/**
 * May this message row's media_storage_path be signed? Members can edit the
 * row, and the service role signs whatever it is given, so the path must be
 * the one written for THIS message: inbound/<its sid>.<ext>, or an outbound
 * file under ITS tenant (a voice note, or <id>/<file-name> from the attach button).
 */
export function storagePathBelongsTo(path: string, row: { message_sid: string | null; tenant_id: string }): boolean {
  const sid = String(row.message_sid ?? '').replace(SAFE, '_')
  if (sid && new RegExp(`^inbound/${sid}\\.[a-z0-9]+$`).test(path)) return true
  const tenant = row.tenant_id.replace(SAFE, '_')
  return new RegExp(`^outbound/${tenant}/[a-zA-Z0-9_-]+\\.ogg$`).test(path) ||
    new RegExp(`^outbound/${tenant}/[a-zA-Z0-9_-]+/[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$`).test(path)
}

/**
 * Is this media_url one of OUR Twilio account's media links (inbound media on
 * the Twilio connection stays on Twilio, behind the account's credentials)?
 * Only then may the server fetch it with those credentials — never an
 * arbitrary URL a row was edited to hold.
 */
export function isOwnTwilioMediaUrl(url: string | null | undefined, accountSid: string | undefined): boolean {
  if (!url || !accountSid || !/^AC[a-f0-9]{32}$/i.test(accountSid)) return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === 'api.twilio.com' &&
      new RegExp(`^/2010-04-01/Accounts/${accountSid}/Messages/MM[a-f0-9]{32}/Media/ME[a-f0-9]{32}$`, 'i').test(u.pathname)
  } catch {
    return false
  }
}
