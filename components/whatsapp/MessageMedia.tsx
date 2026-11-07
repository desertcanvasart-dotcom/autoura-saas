'use client'

// What a WhatsApp message carries besides text: a voice note plays inline, a
// photo or video shows, anything else is a link (2026-11-07). Every file is
// loaded through /api/whatsapp/media/[id], which re-checks the viewer may see
// the message before handing over the file.

import { FileText, Mic } from 'lucide-react'

export interface MediaMessage {
  id: string
  media_type?: string | null
  media_url?: string | null
  media_storage_path?: string | null
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
  if (t.startsWith('audio/')) return 'Voice message'
  if (t.startsWith('image/')) return 'Photo'
  if (t.startsWith('video/')) return 'Video'
  if (t === 'application/pdf') return 'PDF'
  return 'Attachment'
}

export default function MessageMedia({ message }: { message: MediaMessage }) {
  if (!hasMedia(message)) return null
  const type = message.media_type || ''
  const src = viaMediaRoute(message) ? `/api/whatsapp/media/${message.id}` : message.media_url!

  if (type.startsWith('audio/')) {
    return (
      <div className="mb-1 flex items-center gap-2">
        <Mic className="w-4 h-4 shrink-0 text-gray-500" aria-hidden />
        <audio controls preload="metadata" src={src} className="h-10 w-64 max-w-full" aria-label="Voice message" />
      </div>
    )
  }
  if (type.startsWith('image/')) {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="mb-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element -- a signed, per-view file, not a static asset */}
        <img src={src} alt="Photo" loading="lazy" className="max-h-64 max-w-full rounded-md" />
      </a>
    )
  }
  if (type.startsWith('video/')) {
    return (
      <video controls preload="metadata" src={src} className="mb-1 max-h-64 max-w-full rounded-md" />
    )
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="mb-1 inline-flex items-center gap-1.5 text-sm text-blue-700 hover:underline">
      <FileText className="w-4 h-4" aria-hidden /> Open {mediaLabel(type).toLowerCase()}
    </a>
  )
}
