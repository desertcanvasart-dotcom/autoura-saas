'use client'

import { useEffect, useState } from 'react'
import { Wand2, Undo2, Loader2, AlertTriangle, Check } from 'lucide-react'
import { POLISH_STYLES, DEFAULT_POLISH_STYLE, polishStyle, type PolishStyle } from '@/lib/whatsapp/polish-reply'

const STYLE_KEY = 'autoura.whatsapp.polishStyle'

/**
 * "Polish" — the words in the message box, rewritten as a finished message in
 * the style picked, in the language of the customer's last message. The
 * result replaces the box's text (never sent by itself); Undo brings the
 * notes back. Rules: lib/whatsapp/polish-reply.ts.
 */
export default function PolishBar({
  conversationId,
  text,
  setText,
  disabled = false,
}: {
  conversationId: string | null | undefined
  text: string
  setText: (value: string) => void
  disabled?: boolean
}) {
  const [style, setStyle] = useState<PolishStyle>(DEFAULT_POLISH_STYLE)
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState<string | null>(null) // what was typed before polishing
  const [polished, setPolished] = useState<string | null>(null)
  const [info, setInfo] = useState<{ language: string | null; unsourced: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The last style used is pre-selected (this browser only).
  useEffect(() => {
    try { const s = localStorage.getItem(STYLE_KEY); if (s) setStyle(polishStyle(s).key) } catch { /* storage blocked */ }
  }, [])

  // Another conversation, or the box emptied (sent): start fresh.
  useEffect(() => { setNotes(null); setPolished(null); setInfo(null); setError(null) }, [conversationId])
  useEffect(() => { if (!text.trim()) { setNotes(null); setPolished(null); setInfo(null) } }, [text])

  const pickStyle = (s: PolishStyle) => {
    setStyle(s)
    try { localStorage.setItem(STYLE_KEY, s) } catch { /* storage blocked */ }
  }

  const polish = async () => {
    if (!conversationId || busy) return
    // Polishing again in another style starts from the original notes.
    const source = notes !== null && polished !== null && text === polished ? notes : text
    if (!source.trim()) { setError('Type what you want to say first, in your own words.'); return }
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/whatsapp/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, notes: source, style }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) { setError(data.error || 'Could not polish the message.'); return }
      setNotes(source)
      setPolished(data.message)
      setText(data.message)
      setInfo({ language: data.language ?? null, unsourced: Array.isArray(data.unsourced_numbers) ? data.unsourced_numbers : [] })
    } catch {
      setError('Could not reach the server — try again.')
    } finally {
      setBusy(false)
    }
  }

  const undo = () => {
    if (notes === null) return
    setText(notes)
    setNotes(null); setPolished(null); setInfo(null)
  }

  const showResult = info !== null && polished !== null && text === polished

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
      <div className="flex items-center rounded-full border border-gray-200 bg-white">
        <button
          type="button"
          onClick={polish}
          disabled={disabled || busy || !conversationId || !text.trim()}
          className="flex items-center gap-1.5 rounded-l-full px-3 py-1.5 font-medium text-[#128C7E] hover:bg-gray-50 disabled:opacity-50"
          title="Rewrite what you typed as a finished message, in the customer's language"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          {busy ? 'Polishing…' : 'Polish'}
        </button>
        <select
          value={style}
          onChange={e => pickStyle(e.target.value as PolishStyle)}
          disabled={busy}
          aria-label="Polish style"
          className="rounded-r-full border-l border-gray-200 bg-transparent py-1.5 pl-2 pr-6 text-gray-700 focus:outline-none"
        >
          {POLISH_STYLES.map(s => <option key={s.key} value={s.key} title={s.hint}>{s.label}</option>)}
        </select>
      </div>

      {notes !== null && (
        <button type="button" onClick={undo} disabled={busy} className="flex items-center gap-1 rounded-full px-2 py-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800">
          <Undo2 className="h-3.5 w-3.5" /> Undo
        </button>
      )}

      {showResult && info.unsourced.length === 0 && (
        <span className="flex items-center gap-1 text-green-700">
          <Check className="h-3.5 w-3.5" /> Ready{info.language ? ` in ${info.language}` : ''} — read it, then send
        </span>
      )}
      {showResult && info.unsourced.length > 0 && (
        <span className="flex items-center gap-1 text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" />
          Check {info.unsourced.join(', ')} — not in your notes or the chat
        </span>
      )}
      {error && <span className="text-red-600">{error}</span>}
    </div>
  )
}
