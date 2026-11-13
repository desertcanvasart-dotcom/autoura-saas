'use client'

// What a WhatsApp message carries besides text: a voice note plays inline, a
// photo or video shows, anything else is a link (2026-11-07). Every file is
// loaded through /api/whatsapp/media/[id], which re-checks the viewer may see
// the message before handing over the file.

import { useEffect, useState } from 'react'
import { Download, FileText, Mic, Loader2, RotateCcw } from 'lucide-react'
import { labelFor } from '@/lib/whatsapp/attachments'
import { transcriptOf, type Transcript } from '@/lib/whatsapp/transcript'

export interface MediaMessage {
  id: string
  direction?: string
  media_type?: string | null
  media_url?: string | null
  media_storage_path?: string | null
  /** The file's own name (migration 466), when it has one. */
  media_filename?: string | null
  metadata?: unknown
}

/** Files the media route can serve: ours in storage, or Twilio-hosted inbound media. */
function viaMediaRoute(m: MediaMessage): boolean {
  return Boolean(m.media_storage_path) || Boolean(m.media_url?.startsWith('https://api.twilio.com/'))
}

export function hasMedia(m: MediaMessage): boolean {
  return Boolean(m.media_storage_path || m.media_url)
}

/** A short label for lists and previews: "Voice message", "Photo", … */
export function mediaLabel(mediaType: string | null | undefined): string {
  const t = mediaType || ''
  if (t.startsWith('audio/ogg')) return 'Voice message'
  if (t.startsWith('image/')) return 'Photo'
  if (t.startsWith('video/')) return 'Video'
  // Word, Excel, CSV… by name (lib/whatsapp/attachments).
  return labelFor(t)
}

/** "Download", saving the file under its own name (the media route's ?download=1). */
function DownloadLink({ message }: { message: MediaMessage }) {
  if (!viaMediaRoute(message)) return null
  return (
    <a href={`/api/whatsapp/media/${message.id}?download=1`} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-700 hover:underline">
      <Download className="w-3.5 h-3.5" aria-hidden /> Download
    </a>
  )
}

export default function MessageMedia({ message }: { message: MediaMessage }) {
  if (!hasMedia(message)) return null
  const type = message.media_type || ''
  const src = viaMediaRoute(message) ? `/api/whatsapp/media/${message.id}` : message.media_url!

  if (type.startsWith('audio/')) {
    const player = (
      <div className="mb-1 flex items-center gap-2">
        <Mic className="w-4 h-4 shrink-0 text-gray-500" aria-hidden />
        <audio controls preload="metadata" src={src} className="h-10 w-64 max-w-full" aria-label="Voice message" />
      </div>
    )
    // A customer's voice note also shows what it says (lib/whatsapp/transcribe).
    return message.direction === 'inbound'
      ? <div className="mb-1">{player}<VoiceTranscript message={message} /></div>
      : player
  }
  if (type.startsWith('image/')) {
    return (
      <div className="mb-1">
        <a href={src} target="_blank" rel="noopener noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element -- a signed, per-view file, not a static asset */}
          <img src={src} alt={message.media_filename || 'Photo'} loading="lazy" className="max-h-64 max-w-full rounded-md" />
        </a>
        <DownloadLink message={message} />
      </div>
    )
  }
  if (type.startsWith('video/')) {
    return (
      <div className="mb-1">
        <video controls preload="metadata" src={src} className="max-h-64 max-w-full rounded-md" />
        <DownloadLink message={message} />
      </div>
    )
  }
  return (
    <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline">
        <FileText className="w-4 h-4 shrink-0" aria-hidden />
        <span className="break-all">{message.media_filename || `Open ${mediaLabel(type).toLowerCase()}`}</span>
      </a>
      <DownloadLink message={message} />
    </div>
  )
}

/** The words of an inbound voice note: done, in progress, failed, or not yet asked for. */
function VoiceTranscript({ message }: { message: MediaMessage }) {
  const stored = transcriptOf(message.metadata)
  const [local, setLocal] = useState<Transcript | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A fresher stored transcript (the inbox re-reads every 15 s) wins.
  useEffect(() => { if (stored?.status === 'done') setLocal(null) }, [stored?.status])
  const t = local ?? stored

  const run = async (retry: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/whatsapp/messages/${message.id}/transcribe${retry ? '?retry=1' : ''}`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (data.transcript) setLocal(data.transcript)
      if (!res.ok && !data.transcript) setError(data.error || 'Could not transcribe it.')
    } catch {
      setError('Could not transcribe it.')
    } finally {
      setBusy(false)
    }
  }

  if (t?.status === 'done') {
    return t.text
      ? <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap"><span className="text-xs text-gray-400">Transcript: </span>{t.text}</p>
      : <p className="mt-1 text-xs italic text-gray-400">No speech in this voice note.</p>
  }
  // A run that died (a restart mid-way) is pending for ever; after 2 min offer to try again.
  const stalePending = t?.status === 'pending' && (!t.at || Date.now() - Date.parse(t.at) > 2 * 60_000)
  if (busy || (t?.status === 'pending' && !stalePending)) {
    return <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500"><Loader2 className="w-3 h-3 animate-spin" /> Transcribing…</p>
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      {(t?.status === 'failed' || stalePending) && <span className="text-red-600">Transcript failed.</span>}
      {error && <span className="text-red-600">{error}</span>}
      <button type="button" onClick={() => run(t?.status === 'failed' || stalePending)} className="inline-flex items-center gap-1 text-blue-700 hover:underline">
        {t?.status === 'failed' || stalePending ? <RotateCcw className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
        {t?.status === 'failed' || stalePending ? 'Try again' : 'Transcribe'}
      </button>
    </div>
  )
}
