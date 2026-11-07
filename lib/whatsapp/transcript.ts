// What a WhatsApp message SAYS — its text, or the transcript of its voice note
// (2026-11-07). Pure, so the inbox, the copilot and the summaries read a voice
// note the same way. The transcript lives in whatsapp_messages.metadata:
//   { transcript: { status: 'done' | 'failed' | 'pending', text?, model?, at?, error? } }

export type TranscriptStatus = 'done' | 'failed' | 'pending'

export interface Transcript {
  status: TranscriptStatus
  text?: string
  model?: string
  at?: string
  error?: string
}

export function transcriptOf(metadata: unknown): Transcript | null {
  if (!metadata || typeof metadata !== 'object') return null
  const t = (metadata as { transcript?: unknown }).transcript
  if (!t || typeof t !== 'object') return null
  const status = (t as { status?: unknown }).status
  if (status !== 'done' && status !== 'failed' && status !== 'pending') return null
  return t as Transcript
}

/** The transcript's text when it finished with words in it. */
export function transcriptText(metadata: unknown): string {
  const t = transcriptOf(metadata)
  return t?.status === 'done' ? (t.text ?? '').trim() : ''
}

/** The words of a message: its typed text, else what its voice note said. */
export function messageWords(m: { message_body?: string | null; message_text?: string | null; metadata?: unknown }): string {
  return (m.message_body || m.message_text || '').trim() || transcriptText(m.metadata)
}

/** metadata with the transcript set, keeping whatever else it held. */
export function withTranscript(metadata: unknown, transcript: Transcript): Record<string, unknown> {
  const base = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {}
  return { ...base, transcript }
}

/** Is this an audio message worth transcribing? */
export function isVoiceMessage(m: { media_type?: string | null; media_url?: string | null; media_storage_path?: string | null }): boolean {
  return Boolean((m.media_type || '').startsWith('audio/') && (m.media_url || m.media_storage_path))
}
