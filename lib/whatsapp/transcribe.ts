// ============================================
// Turn a customer's WhatsApp voice note into text (2026-11-07)
// ============================================
// Runs on the server with the service role: from the webhook right after a
// voice note arrives (after the reply to Twilio, so it never delays it), and
// from the inbox's "Transcribe" button for older ones. Uses the agency's
// existing OpenAI key (the same one translation uses). No key → nothing
// happens and the inbox simply plays the audio.
//
// The audio is read from wherever the message's file lives: our private
// bucket, or — on the Twilio connection — Twilio's media store, fetched with
// the account's credentials (only our own account's media URLs).

import OpenAI, { toFile } from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MEDIA_BUCKET, storagePathBelongsTo, isOwnTwilioMediaUrl } from './voice-note-storage'
import { isVoiceMessage, transcriptOf, withTranscript, type Transcript } from './transcript'

/** OpenAI's upload limit for transcription. */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024

export function transcriptionModel(): string {
  return process.env.WHATSAPP_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe'
}

export function transcriptionEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY) && process.env.WHATSAPP_TRANSCRIBE !== 'off'
}

let _openai: OpenAI | null = null
function openai(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 90_000, maxRetries: 1 })
  return _openai
}

const EXT: Record<string, string> = {
  'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a',
  'audio/aac': 'm4a', 'audio/x-m4a': 'm4a', 'audio/amr': 'amr', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'webm',
}

/** The words in an audio file. Throws on a provider error. */
export async function transcribeAudio(bytes: Uint8Array, mediaType: string): Promise<string> {
  const type = mediaType.split(';')[0].trim().toLowerCase()
  const file = await toFile(bytes, `voice.${EXT[type] ?? 'ogg'}`, { type })
  const res = await openai().audio.transcriptions.create({ file, model: transcriptionModel() })
  return (res.text ?? '').trim()
}

export interface VoiceRow {
  id: string
  tenant_id: string
  message_sid: string | null
  direction: string
  media_type: string | null
  media_url: string | null
  media_storage_path: string | null
  metadata: unknown
}

export const VOICE_ROW_COLS = 'id, tenant_id, message_sid, direction, media_type, media_url, media_storage_path, metadata'

/** The audio bytes of a message, from our bucket or our Twilio account. */
export async function fetchMessageAudio(admin: SupabaseClient, row: VoiceRow): Promise<Uint8Array> {
  if (row.media_storage_path) {
    if (!storagePathBelongsTo(row.media_storage_path, row)) throw new Error('The stored file does not belong to this message.')
    const { data, error } = await admin.storage.from(MEDIA_BUCKET).download(row.media_storage_path)
    if (error || !data) throw new Error('Could not read the voice note file.')
    return new Uint8Array(await data.arrayBuffer())
  }
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!isOwnTwilioMediaUrl(row.media_url, sid) || !token) throw new Error('The voice note file is not reachable.')
  const res = await fetch(row.media_url!, {
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`Twilio returned ${res.status} for the voice note.`)
  return new Uint8Array(await res.arrayBuffer())
}

export type TranscribeOutcome =
  | { ok: true; transcript: Transcript; reused?: boolean }
  | { ok: false; reason: 'disabled' | 'not_voice' | 'busy'; transcript?: Transcript }

/**
 * Transcribe one message and save the result on it. A message already done
 * is returned as it is (no second charge) unless `force`; one another call
 * is working on is left alone. Failures are saved too, so the inbox can say
 * so and offer to try again.
 */
export async function transcribeMessage(admin: SupabaseClient, row: VoiceRow, opts: { force?: boolean } = {}): Promise<TranscribeOutcome> {
  if (!transcriptionEnabled()) return { ok: false, reason: 'disabled' }
  if (!isVoiceMessage(row)) return { ok: false, reason: 'not_voice' }
  const existing = transcriptOf(row.metadata)
  if (existing?.status === 'done' && !opts.force) return { ok: true, transcript: existing, reused: true }
  if (existing?.status === 'pending' && existing.at && Date.now() - Date.parse(existing.at) < 2 * 60_000) {
    return { ok: false, reason: 'busy', transcript: existing }
  }

  const model = transcriptionModel()
  const save = async (t: Transcript) => {
    const { error } = await admin.from('whatsapp_messages')
      .update({ metadata: withTranscript(row.metadata, t) })
      .eq('id', row.id)
      .eq('tenant_id', row.tenant_id)
    if (error) console.error('transcript save error:', error.message)
  }
  await save({ status: 'pending', model, at: new Date().toISOString() })

  let transcript: Transcript
  try {
    const bytes = await fetchMessageAudio(admin, row)
    if (bytes.length === 0) throw new Error('The voice note is empty.')
    if (bytes.length > MAX_AUDIO_BYTES) throw new Error('The voice note is too long to transcribe.')
    const text = await transcribeAudio(bytes, row.media_type || 'audio/ogg')
    transcript = { status: 'done', text, model, at: new Date().toISOString() }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Transcription failed.'
    console.error('voice note transcription failed:', message)
    transcript = { status: 'failed', model, at: new Date().toISOString(), error: message.slice(0, 200) }
  }
  await save(transcript)
  return { ok: true, transcript }
}
