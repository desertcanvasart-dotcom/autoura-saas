'use client'

import { useState } from 'react'
import { Sparkles, Loader2, RefreshCw, X, Check } from 'lucide-react'

interface Draft {
  id: string
  draft_body: string
  ai_confidence?: 'high' | 'medium' | 'low' | null
  ai_flags?: { rationale?: string | null } | null
}

interface Props {
  whatsappConversationId: string | null
  onAccept: (text: string, draftId: string) => void
  disabled?: boolean
}

export default function CopilotSuggestPanel({ whatsappConversationId, onAccept, disabled }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tone, setTone] = useState<'professional' | 'friendly' | 'formal' | null>(null)
  const [lastParentId, setLastParentId] = useState<string | null>(null)

  const generate = async (regenerate = false) => {
    if (!whatsappConversationId || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/suggest-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsapp_conversation_id: whatsappConversationId,
          count: 2,
          parent_draft_id: regenerate ? lastParentId : null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to generate drafts')
        setDrafts([])
      } else {
        setDrafts(data.drafts || [])
        setTone(data.tone || null)
        setLastParentId(data.drafts?.[0]?.id || null)
      }
    } catch (e: any) {
      setError(e?.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  const accept = async (draft: Draft) => {
    onAccept(draft.draft_body, draft.id)
    // Fire-and-forget status update; UI doesn't wait for it
    fetch(`/api/ai/suggest-reply/${draft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'accept' }),
    }).catch(() => {})
    setDrafts([])
  }

  const dismiss = async (draftId: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== draftId))
    fetch(`/api/ai/suggest-reply/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss' }),
    }).catch(() => {})
  }

  const dismissAll = async () => {
    const ids = drafts.map((d) => d.id)
    setDrafts([])
    setError(null)
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/ai/suggest-reply/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'dismiss' }),
        }).catch(() => {})
      )
    )
  }

  if (!whatsappConversationId) return null

  const confidenceColor = (c?: string | null) =>
    c === 'high' ? 'bg-green-100 text-green-700'
      : c === 'low' ? 'bg-amber-100 text-amber-700'
      : 'bg-gray-100 text-gray-600'

  return (
    <div className="border-t border-gray-200 bg-gradient-to-b from-purple-50/40 to-white">
      <div className="px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <Sparkles className="w-3.5 h-3.5 text-purple-600" />
          <span className="font-medium text-gray-700">AI Copilot</span>
          {tone && <span className="text-gray-400">· {tone}</span>}
        </div>
        <div className="flex items-center gap-1">
          {drafts.length > 0 && (
            <button
              onClick={() => generate(true)}
              disabled={loading || disabled}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-purple-600 px-2 py-1 rounded disabled:opacity-50"
              title="Regenerate with different angles"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Regenerate
            </button>
          )}
          {drafts.length === 0 && (
            <button
              onClick={() => generate(false)}
              disabled={loading || disabled}
              className="flex items-center gap-1.5 text-xs bg-purple-600 text-white px-3 py-1.5 rounded-full hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Thinking...
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3" />
                  Suggest Reply
                </>
              )}
            </button>
          )}
          {drafts.length > 0 && (
            <button
              onClick={dismissAll}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
              title="Dismiss all"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 pb-2 text-xs text-red-600">{error}</div>
      )}

      {drafts.length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          {drafts.map((d, idx) => (
            <div
              key={d.id}
              className="rounded-lg border border-purple-100 bg-white p-3 hover:border-purple-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                    Option {idx + 1}
                  </span>
                  {d.ai_confidence && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${confidenceColor(d.ai_confidence)}`}>
                      {d.ai_confidence}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => accept(d)}
                    className="flex items-center gap-1 text-xs bg-[#25D366] text-white px-2.5 py-1 rounded-full hover:bg-[#20bd5a]"
                    title="Insert into compose"
                  >
                    <Check className="w-3 h-3" />
                    Use
                  </button>
                  <button
                    onClick={() => dismiss(d.id)}
                    className="p-1 text-gray-400 hover:text-red-500 rounded"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{d.draft_body}</p>
              {d.ai_flags?.rationale && (
                <p className="mt-1.5 text-[11px] text-gray-400 italic">{d.ai_flags.rationale}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
