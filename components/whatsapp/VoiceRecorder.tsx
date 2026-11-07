'use client'

// The microphone in the WhatsApp send box (2026-11-07): record, listen back,
// then send — or throw it away. The browser records Opus (Ogg in Firefox,
// WebM in Chrome, Edge and Safari 18.4+); the server turns WebM into the Ogg
// voice note WhatsApp plays (POST /api/whatsapp/voice-note). A browser that
// records neither gets a disabled button that says so.

import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Trash2, Send, Loader2 } from 'lucide-react'

const MAX_SECONDS = 5 * 60
const TYPES = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus'] as const

function pickType(): string | null {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null
  return TYPES.find(t => MediaRecorder.isTypeSupported(t)) ?? null
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

type State =
  | { kind: 'idle' }
  | { kind: 'recording'; startedAt: number }
  | { kind: 'review'; blob: Blob; url: string; seconds: number }
  | { kind: 'sending'; blob: Blob; url: string; seconds: number }

export interface VoiceRecorderProps {
  conversationId: string
  /** Hide the text box while a recording is in progress or under review. */
  onActiveChange: (active: boolean) => void
  /** The saved message row, to add to the thread. */
  onSent: (message: unknown) => void
  onError: (message: string) => void
  /** Show the idle microphone button (hidden while text is being typed). */
  showIdleButton: boolean
}

export default function VoiceRecorder({ conversationId, onActiveChange, onSent, onError, showIdleButton }: VoiceRecorderProps) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [elapsed, setElapsed] = useState(0)
  const [supported, setSupported] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const discardNext = useRef(false)

  useEffect(() => { setSupported(pickType()) }, [])
  useEffect(() => { onActiveChange(state.kind !== 'idle') }, [state.kind, onActiveChange])

  // The running clock, and the 5-minute stop.
  useEffect(() => {
    if (state.kind !== 'recording') return
    const t = setInterval(() => {
      const s = (Date.now() - state.startedAt) / 1000
      setElapsed(s)
      if (s >= MAX_SECONDS) recorder.current?.stop()
    }, 250)
    return () => clearInterval(t)
  }, [state])

  // A thread switched mid-recording: stop and throw it away.
  useEffect(() => () => {
    discardNext.current = true
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
  }, [conversationId])

  const start = async () => {
    const type = supported
    if (!type) return
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      onError('The browser did not allow the microphone. Allow it in the address bar and try again.')
      return
    }
    chunks.current = []
    discardNext.current = false
    const rec = new MediaRecorder(stream, { mimeType: type })
    rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data) }
    const startedAt = Date.now()
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      recorder.current = null
      if (discardNext.current) { setState({ kind: 'idle' }); return }
      const blob = new Blob(chunks.current, { type })
      const seconds = (Date.now() - startedAt) / 1000
      if (seconds < 1 || blob.size === 0) { setState({ kind: 'idle' }); return }
      setState({ kind: 'review', blob, url: URL.createObjectURL(blob), seconds })
    }
    recorder.current = rec
    rec.start(250)
    setElapsed(0)
    setState({ kind: 'recording', startedAt })
  }

  const stop = () => recorder.current?.stop()
  const cancel = () => {
    if (state.kind === 'recording') { discardNext.current = true; stop(); return }
    if (state.kind === 'review') { URL.revokeObjectURL(state.url); setState({ kind: 'idle' }) }
  }

  const send = async () => {
    if (state.kind !== 'review') return
    setState({ ...state, kind: 'sending' })
    try {
      const form = new FormData()
      form.set('conversation_id', conversationId)
      form.set('audio', state.blob, state.blob.type.includes('ogg') ? 'voice.ogg' : 'voice.webm')
      const res = await fetch('/api/whatsapp/voice-note', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        onError(data.error || 'The voice note was not sent.')
        setState({ ...state, kind: 'review' })
        return
      }
      URL.revokeObjectURL(state.url)
      setState({ kind: 'idle' })
      onSent(data.message)
    } catch {
      onError('The voice note was not sent. Check the connection and try again.')
      setState({ ...state, kind: 'review' })
    }
  }

  if (state.kind === 'idle') {
    if (!showIdleButton) return null
    return (
      <button
        type="button"
        onClick={start}
        disabled={!supported}
        title={supported ? 'Record a voice message' : 'This browser cannot record WhatsApp voice notes — use Chrome, Edge, Firefox or Safari 18.4+'}
        aria-label="Record a voice message"
        className="p-2.5 bg-[#25D366] text-white rounded-full hover:bg-[#20bd5a] disabled:opacity-50"
      >
        <Mic className="w-5 h-5" />
      </button>
    )
  }

  if (state.kind === 'recording') {
    return (
      <div className="flex flex-1 items-center gap-3" role="status" aria-live="polite">
        <button type="button" onClick={cancel} aria-label="Discard the recording" className="p-2 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100">
          <Trash2 className="w-5 h-5" />
        </button>
        <span className="flex flex-1 items-center gap-2 text-sm text-gray-700">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" aria-hidden />
          Recording… <span className="tabular-nums">{clock(elapsed)}</span>
          <span className="text-xs text-gray-400">(up to {MAX_SECONDS / 60} min)</span>
        </span>
        <button type="button" onClick={stop} aria-label="Stop recording" className="p-2.5 bg-red-500 text-white rounded-full hover:bg-red-600">
          <Square className="w-5 h-5" />
        </button>
      </div>
    )
  }

  const sending = state.kind === 'sending'
  return (
    <div className="flex flex-1 items-center gap-3">
      <button type="button" onClick={cancel} disabled={sending} aria-label="Discard the recording" className="p-2 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100 disabled:opacity-50">
        <Trash2 className="w-5 h-5" />
      </button>
      <audio controls src={state.url} className="h-10 flex-1 min-w-0" aria-label="Your recording" />
      <span className="text-xs text-gray-500 tabular-nums">{clock(state.seconds)}</span>
      <button type="button" onClick={send} disabled={sending} aria-label="Send the voice message" className="p-2.5 bg-[#25D366] text-white rounded-full hover:bg-[#20bd5a] disabled:opacity-50">
        {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
      </button>
    </div>
  )
}
