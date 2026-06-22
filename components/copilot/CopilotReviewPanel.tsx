'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  MessageSquare, Mail, Check, X, RefreshCw, Send, Sparkles, AlertTriangle, Loader2, ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import CopilotContextCard from './CopilotContextCard'
import type { CopilotThreadDetail, CopilotDraft } from '@/app/types/copilot'

const CONF: Record<string, string> = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-red-100 text-red-700',
}

export default function CopilotReviewPanel({
  detail, loading, onChanged,
}: {
  detail: CopilotThreadDetail | null
  loading: boolean
  onChanged: () => void | Promise<void>
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [showRegen, setShowRegen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  // The active draft = newest pending/approved draft for this thread.
  const activeDraft: CopilotDraft | null = useMemo(() => {
    if (!detail) return null
    return detail.drafts.find(d => d.status === 'pending' || d.status === 'approved')
      || detail.drafts[0] || null
  }, [detail])

  const latestInbound = detail && detail.inbox.length ? detail.inbox[detail.inbox.length - 1] : null

  useEffect(() => {
    setText(activeDraft ? (activeDraft.edited_body ?? activeDraft.draft_body) : '')
    setNotice(null)
    setShowRegen(false)
    setInstruction('')
  }, [activeDraft?.id])

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 text-[#647C47] animate-spin" /></div>
  }
  if (!detail) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
        <Sparkles className="h-10 w-10 mb-3 text-gray-300" />
        <p className="text-sm">Select a thread to review its AI-drafted reply.</p>
      </div>
    )
  }

  const t = detail.thread
  const flags = activeDraft?.ai_flags || {}
  const escalate = !!(flags.escalate || flags.escalation_reason)

  const act = async (action: string, fn: () => Promise<Response>) => {
    setBusy(action)
    setNotice(null)
    try {
      const res = await fn()
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.success === false) {
        setNotice(data.error || 'Action failed')
      } else if (data.requiresManualSend) {
        setNotice(data.message || 'Draft approved — send from the Inbox.')
        await onChanged()
      } else {
        await onChanged()
      }
    } catch (e: any) {
      setNotice(e?.message || 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  const draftId = activeDraft?.id
  const isSent = activeDraft?.status === 'sent'

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          {t.channel === 'whatsapp'
            ? <MessageSquare className="h-4 w-4 text-green-600" />
            : <Mail className="h-4 w-4 text-blue-600" />}
          <h3 className="text-sm font-semibold text-gray-900">{t.client_name || t.contact_info}</h3>
          {t.client_id && (
            <Link href={`/clients/${t.client_id}`} className="text-xs text-[#647C47] hover:underline inline-flex items-center gap-0.5">
              <ExternalLink className="h-3 w-3" /> client
            </Link>
          )}
          <span className="ml-auto text-xs text-gray-400">{t.contact_info}</span>
        </div>
        {t.subject && <p className="text-xs text-gray-500 mt-0.5 truncate">{t.subject}</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Inbound message */}
        {latestInbound && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Customer message</div>
            <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-800 whitespace-pre-wrap">{latestInbound.message_body}</div>
          </div>
        )}

        {/* Context */}
        <CopilotContextCard context={detail.context} />

        {/* Escalation banner */}
        {escalate && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>AI flagged this for escalation{flags.escalation_reason ? `: ${flags.escalation_reason}` : '.'}</span>
          </div>
        )}

        {/* Draft */}
        {activeDraft ? (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">AI draft reply</span>
              {activeDraft.ai_confidence && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${CONF[activeDraft.ai_confidence] || ''}`}>
                  {activeDraft.ai_confidence} confidence
                </span>
              )}
              {activeDraft.status !== 'pending' && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">{activeDraft.status}</span>
              )}
            </div>
            {activeDraft.operator_notes && (
              <p className="text-xs text-gray-500 italic mb-1">{activeDraft.operator_notes}</p>
            )}
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              disabled={isSent}
              rows={6}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] disabled:bg-gray-50 disabled:text-gray-500"
            />

            {showRegen && (
              <input
                value={instruction}
                onChange={e => setInstruction(e.target.value)}
                placeholder="Optional instruction for the new draft (e.g. 'offer a 10% discount')"
                className="w-full mt-2 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
              />
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg p-4 text-center">
            No AI draft yet for this thread. Drafts are generated automatically when a message arrives.
          </div>
        )}

        {notice && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{notice}</p>}
      </div>

      {/* Actions */}
      {activeDraft && !isSent && (
        <div className="border-t border-gray-200 px-5 py-3 flex items-center gap-2 shrink-0">
          <button
            onClick={() => act('reject', () => fetch(`/api/copilot/drafts/${draftId}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reject' }),
            }))}
            disabled={!!busy}
            className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <X className="h-3.5 w-3.5" /> Reject
          </button>

          <button
            onClick={() => {
              if (!showRegen) { setShowRegen(true); return }
              act('regenerate', () => fetch(`/api/copilot/drafts/${draftId}/regenerate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction }),
              }))
            }}
            disabled={!!busy}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1"
          >
            {busy === 'regenerate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {showRegen ? 'Generate' : 'Regenerate'}
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => act('approve', () => fetch(`/api/copilot/drafts/${draftId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', edited_body: text }),
              }))}
              disabled={!!busy}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1"
            >
              <Check className="h-3.5 w-3.5" /> Approve
            </button>
            <button
              onClick={() => act('send', () => fetch(`/api/copilot/drafts/${draftId}/send`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ edited_body: text }),
              }))}
              disabled={!!busy}
              className="px-4 py-1.5 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-50 inline-flex items-center gap-1"
            >
              {busy === 'send' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {t.channel === 'whatsapp' ? 'Send' : 'Approve & hand off'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
