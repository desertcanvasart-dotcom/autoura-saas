'use client'

// ============================================
// The AI Copilot inside the Email tab's reply window
// ============================================
// The same drafts as the Conversations reply box (/api/ai/suggest-email-reply,
// lib/copilot-suggest): the Email tab knows only the Gmail thread, so it asks
// by gmail_thread_id and the route finds the conversation. A pre-written draft
// shows as soon as the window opens; Suggest Reply writes new ones. Use puts
// a draft in the message and tells the composer which draft and conversation
// it came from, so the send marks it sent and files the reply.

import { useEffect, useState } from 'react'
import { Check, Loader2, Sparkles, X } from 'lucide-react'
import PricesUsed, { ratesOf } from '@/components/copilot/PricesUsed'

interface Draft {
  id: string
  draft_body: string
  ai_confidence?: 'high' | 'medium' | 'low' | null
  ai_flags?: { subject?: string | null } | null
  context_used?: { rates?: string | null; tenant_prompt?: boolean } | null
}

export interface UsedDraft {
  id: string
  body: string
  subject: string | null
  /** Written under the company's own prompt, which signs the email itself. */
  signed: boolean
  rates: string | null
  conversationId: string | null
}

export default function ComposeCopilot({ gmailThreadId, onUse }: {
  gmailThreadId: string
  onUse: (draft: UsedDraft) => void
}) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skipReason, setSkipReason] = useState<string | null>(null)
  const [lastParentId, setLastParentId] = useState<string | null>(null)

  // Whatever is already waiting: pre-written drafts, or one approved in Copilot.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/ai/suggest-email-reply?gmail_thread_id=${encodeURIComponent(gmailThreadId)}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled || !data?.success) return
        setConversationId(data.unified_conversation_id ?? null)
        if (data.skipped) setSkipReason(data.skip_reason || 'not a travel enquiry')
        const waiting: Draft[] = data.drafts ?? []
        if (data.approved?.body) {
          waiting.unshift({
            id: data.approved.id, draft_body: data.approved.body,
            ai_flags: { subject: data.approved.subject ?? null },
            context_used: typeof data.approved.rates === 'string' ? { rates: data.approved.rates } : null,
          })
        }
        setDrafts(waiting)
        setLastParentId(waiting[0]?.id ?? null)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [gmailThreadId])

  const generate = async () => {
    if (generating) return
    setGenerating(true); setError(null)
    try {
      const res = await fetch('/api/ai/suggest-email-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gmail_thread_id: gmailThreadId, count: 2, parent_draft_id: drafts.length ? lastParentId : null }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || 'Could not write a draft')
        return
      }
      setConversationId(data.unified_conversation_id ?? conversationId)
      setSkipReason(data.skipped ? (data.skip_reason || 'not a travel enquiry') : null)
      setDrafts(data.drafts || [])
      setLastParentId(data.drafts?.[0]?.id ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setGenerating(false)
    }
  }

  const patch = (id: string, action: 'accept' | 'dismiss') =>
    fetch(`/api/ai/suggest-reply/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    }).catch(() => {})

  const use = (d: Draft) => {
    onUse({
      id: d.id,
      body: d.draft_body,
      subject: d.ai_flags?.subject ?? null,
      signed: Boolean(d.context_used?.tenant_prompt) || ratesOf(d) !== null,
      rates: ratesOf(d),
      conversationId,
    })
    setDrafts([])
    void patch(d.id, 'accept')
  }

  const dismiss = (id: string) => {
    setDrafts(prev => prev.filter(d => d.id !== id))
    void patch(id, 'dismiss')
  }

  return (
    <div className="border-b border-gray-100 bg-gradient-to-b from-primary-50/40 to-white">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2 text-xs">
          <Sparkles className="h-3.5 w-3.5 text-primary-600" />
          <span className="font-medium text-gray-700">AI Copilot</span>
          {skipReason && drafts.length === 0 && <span className="text-amber-700">· Copilot skipped: {skipReason}</span>}
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-1.5 rounded-full bg-primary-600 px-3 py-1.5 text-xs text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {generating ? <><Loader2 className="h-3 w-3 animate-spin" />Thinking…</> : <><Sparkles className="h-3 w-3" />{drafts.length ? 'New suggestions' : 'Suggest Reply'}</>}
        </button>
      </div>
      {error && <div className="mx-4 mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>}
      {drafts.length > 0 && (
        <div className="max-h-72 space-y-2 overflow-y-auto px-4 pb-3">
          {drafts.map((d, idx) => (
            <div key={d.id} className="rounded-lg border border-primary-100 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {drafts.length > 1 ? `Option ${idx + 1}` : 'Draft'}
                  {d.ai_confidence ? ` · ${d.ai_confidence}` : ''}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => use(d)} className="flex items-center gap-1 rounded-full bg-primary-500 px-2.5 py-1 text-xs text-white hover:bg-[#566b3c]">
                    <Check className="h-3 w-3" /> Use
                  </button>
                  <button type="button" onClick={() => dismiss(d.id)} className="rounded p-1 text-gray-400 hover:text-red-500" aria-label="Dismiss draft">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {ratesOf(d) !== null && <PricesUsed rates={ratesOf(d)!} />}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{d.draft_body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
