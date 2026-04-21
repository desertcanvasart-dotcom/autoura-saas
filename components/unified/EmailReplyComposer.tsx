'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Loader2, RefreshCw, X, Check, Send } from 'lucide-react'

interface Conversation {
  id: string
  thread_id: string
  client_email: string
  client_name?: string
  subject: string
  client?: { full_name?: string; email?: string }
}

interface Draft {
  id: string
  draft_body: string
  ai_confidence?: 'high' | 'medium' | 'low' | null
  ai_flags?: { subject?: string | null; rationale?: string | null } | null
}

interface Props {
  conversation: Conversation
  userId: string
  onSent?: () => void
}

export default function EmailReplyComposer({ conversation, userId, onSent }: Props) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const [drafts, setDrafts] = useState<Draft[]>([])
  const [generating, setGenerating] = useState(false)
  const [retrievedCount, setRetrievedCount] = useState(0)
  const [tone, setTone] = useState<string | null>(null)
  const [panelError, setPanelError] = useState<string | null>(null)
  const [lastParentId, setLastParentId] = useState<string | null>(null)
  const [acceptedDraftId, setAcceptedDraftId] = useState<string | null>(null)

  // Reset + prefill subject when conversation changes
  useEffect(() => {
    const base = conversation.subject || ''
    setSubject(base.toLowerCase().startsWith('re:') ? base : base ? `Re: ${base}` : '')
    setBody('')
    setDrafts([])
    setSendError(null)
    setPanelError(null)
    setRetrievedCount(0)
    setLastParentId(null)
    setAcceptedDraftId(null)
  }, [conversation.id])

  const generate = async (regenerate = false) => {
    if (generating) return
    setGenerating(true)
    setPanelError(null)
    try {
      const res = await fetch('/api/ai/suggest-email-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_conversation_id: conversation.id,
          count: 2,
          parent_draft_id: regenerate ? lastParentId : null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setPanelError(data.error || 'Failed to generate drafts')
        setDrafts([])
      } else {
        setDrafts(data.drafts || [])
        setTone(data.tone || null)
        setRetrievedCount(data.retrieved_count || 0)
        setLastParentId(data.drafts?.[0]?.id || null)
      }
    } catch (e: any) {
      setPanelError(e?.message || 'Network error')
    } finally {
      setGenerating(false)
    }
  }

  const accept = (draft: Draft) => {
    setBody(draft.draft_body)
    if (draft.ai_flags?.subject) setSubject(draft.ai_flags.subject)
    setAcceptedDraftId(draft.id)
    setDrafts([])
    fetch(`/api/ai/suggest-reply/${draft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'accept' }),
    }).catch(() => {})
  }

  const dismiss = (draftId: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== draftId))
    fetch(`/api/ai/suggest-reply/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss' }),
    }).catch(() => {})
  }

  const dismissAll = () => {
    const ids = drafts.map((d) => d.id)
    setDrafts([])
    setPanelError(null)
    Promise.all(
      ids.map((id) =>
        fetch(`/api/ai/suggest-reply/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'dismiss' }),
        })
      )
    ).catch(() => {})
  }

  const send = async () => {
    const to = conversation.client_email
    if (!to || !body.trim() || !subject.trim() || sending) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          to,
          subject,
          body,
          threadId: conversation.thread_id,
          conversation_id: conversation.id,
          draft_id: acceptedDraftId,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setSendError(data.error || 'Send failed')
        return
      }
      setBody('')
      setAcceptedDraftId(null)
      onSent?.()
    } catch (e: any) {
      setSendError(e?.message || 'Network error')
    } finally {
      setSending(false)
    }
  }

  const confidenceColor = (c?: string | null) =>
    c === 'high' ? 'bg-green-100 text-green-700'
      : c === 'low' ? 'bg-amber-100 text-amber-700'
      : 'bg-gray-100 text-gray-600'

  return (
    <div className="border-t border-gray-200 bg-white">
      {/* Copilot panel */}
      <div className="bg-gradient-to-b from-purple-50/40 to-white">
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span className="font-medium text-gray-700">AI Copilot</span>
            {tone && <span className="text-gray-400">· {tone}</span>}
            {retrievedCount > 0 && (
              <span className="text-purple-600 bg-purple-50 border border-purple-100 rounded-full px-1.5 py-0.5 text-[10px]">
                {retrievedCount} memory match{retrievedCount === 1 ? '' : 'es'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {drafts.length > 0 && (
              <button
                onClick={() => generate(true)}
                disabled={generating}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-purple-600 px-2 py-1 rounded disabled:opacity-50"
                title="Regenerate with different angles"
              >
                <RefreshCw className={`w-3 h-3 ${generating ? 'animate-spin' : ''}`} />
                Regenerate
              </button>
            )}
            {drafts.length === 0 && (
              <button
                onClick={() => generate(false)}
                disabled={generating}
                className="flex items-center gap-1.5 text-xs bg-purple-600 text-white px-3 py-1.5 rounded-full hover:bg-purple-700 disabled:opacity-50"
              >
                {generating ? (
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
              <button onClick={dismissAll} className="p-1 text-gray-400 hover:text-gray-600 rounded" title="Dismiss all">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {panelError && <div className="px-4 pb-2 text-xs text-red-600">{panelError}</div>}

        {drafts.length > 0 && (
          <div className="px-4 pb-3 space-y-2">
            {drafts.map((d, idx) => (
              <div key={d.id} className="rounded-lg border border-purple-100 bg-white p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Option {idx + 1}</span>
                    {d.ai_confidence && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${confidenceColor(d.ai_confidence)}`}>
                        {d.ai_confidence}
                      </span>
                    )}
                    {d.ai_flags?.subject && (
                      <span className="text-[11px] text-gray-500 truncate">{d.ai_flags.subject}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => accept(d)}
                      className="flex items-center gap-1 text-xs bg-[#647C47] text-white px-2.5 py-1 rounded-full hover:bg-[#566b3c]"
                    >
                      <Check className="w-3 h-3" />
                      Use
                    </button>
                    <button onClick={() => dismiss(d.id)} className="p-1 text-gray-400 hover:text-red-500 rounded">
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

      {/* Reply compose */}
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-14">To</span>
          <input
            value={conversation.client_email || ''}
            readOnly
            className="flex-1 text-sm px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-14">Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/40"
          />
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="Write your reply…"
          className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/40 resize-y"
        />
        {sendError && <div className="text-xs text-red-600">{sendError}</div>}
        <div className="flex items-center justify-end">
          <button
            onClick={send}
            disabled={sending || !body.trim() || !subject.trim()}
            className="flex items-center gap-1.5 bg-[#647C47] text-white text-sm px-4 py-1.5 rounded-lg hover:bg-[#566b3c] disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending…' : 'Send reply'}
          </button>
        </div>
      </div>
    </div>
  )
}
