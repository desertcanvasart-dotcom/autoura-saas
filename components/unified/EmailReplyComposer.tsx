'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Loader2, RefreshCw, X, Check, Send, Paperclip, PenLine } from 'lucide-react'
import RichReplyEditor, { plainTextToHtml, htmlToPlainText } from './RichReplyEditor'

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

interface Signature {
  id: string
  name: string
  content: string
  is_default: boolean
}

interface Attachment {
  filename: string
  mimeType: string
  size: number
  data: string // base64 (no prefix)
}

interface Props {
  conversation: Conversation
  userId: string
  onSent?: () => void
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024   // 10MB per file — Gmail practical limit
const MAX_TOTAL_BYTES = 24 * 1024 * 1024        // 24MB combined — Gmail hard limit is 25MB

export default function EmailReplyComposer({ conversation, userId, onSent }: Props) {
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const [drafts, setDrafts] = useState<Draft[]>([])
  const [generating, setGenerating] = useState(false)
  const [retrievedCount, setRetrievedCount] = useState(0)
  const [tone, setTone] = useState<string | null>(null)
  const [panelError, setPanelError] = useState<string | null>(null)
  const [lastParentId, setLastParentId] = useState<string | null>(null)
  const [acceptedDraftId, setAcceptedDraftId] = useState<string | null>(null)

  const [signatures, setSignatures] = useState<Signature[]>([])
  const [signatureId, setSignatureId] = useState<string | null>(null)

  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [attachErr, setAttachErr] = useState<string | null>(null)

  // Fetch signatures once per user
  useEffect(() => {
    fetch(`/api/email/signatures?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        const sigs: Signature[] = data?.signatures || []
        setSignatures(sigs)
        const def = sigs.find((s) => s.is_default) || sigs[0] || null
        setSignatureId(def?.id || null)
      })
      .catch(() => {})
  }, [userId])

  // Reset composer when conversation changes (and seed signature if available)
  useEffect(() => {
    const base = conversation.subject || ''
    setSubject(base.toLowerCase().startsWith('re:') ? base : base ? `Re: ${base}` : '')
    const sig = signatures.find((s) => s.id === signatureId)
    setBodyHtml(sig ? `<p><br/></p>${sigToHtml(sig)}` : '')
    setAttachments([])
    setDrafts([])
    setSendError(null)
    setPanelError(null)
    setAttachErr(null)
    setRetrievedCount(0)
    setLastParentId(null)
    setAcceptedDraftId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, signatures.length])

  // When user picks a different signature mid-compose, swap the marker block
  useEffect(() => {
    const sig = signatures.find((s) => s.id === signatureId)
    if (!sig) return
    const stripped = htmlToPlainText(bodyHtml).trim()
    if (!stripped) {
      setBodyHtml(`<p><br/></p>${sigToHtml(sig)}`)
    } else if (/<div data-signature="true"/.test(bodyHtml)) {
      setBodyHtml(bodyHtml.replace(/<div data-signature="true"[\s\S]*?<\/div>/, sigToHtml(sig)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureId])

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
    const draftHtml = plainTextToHtml(draft.draft_body)
    const sig = signatures.find((s) => s.id === signatureId)
    const combined = sig ? `${draftHtml}${sigToHtml(sig)}` : draftHtml
    setBodyHtml(combined)
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

  const pickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setAttachErr(null)

    const current = attachments.reduce((sum, a) => sum + a.size, 0)
    const next: Attachment[] = [...attachments]

    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setAttachErr(`"${file.name}" exceeds 10MB`)
        continue
      }
      const projected = next.reduce((sum, a) => sum + a.size, 0) + file.size
      if (projected > MAX_TOTAL_BYTES) {
        setAttachErr(`Total attachments would exceed 24MB`)
        break
      }
      const data = await fileToBase64(file)
      next.push({
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        data,
      })
    }
    setAttachments(next)
  }

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx))
  }

  const send = async () => {
    const to = conversation.client_email
    const plain = htmlToPlainText(bodyHtml).trim()
    if (!to || !plain || !subject.trim() || sending) return
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
          body: bodyHtml,
          body_text: plain,
          threadId: conversation.thread_id,
          conversation_id: conversation.id,
          draft_id: acceptedDraftId,
          attachments: attachments.length ? attachments : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setSendError(data.error || 'Send failed')
        return
      }
      setBodyHtml('')
      setAttachments([])
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

  const totalAttachBytes = attachments.reduce((sum, a) => sum + a.size, 0)
  const canSend = !sending && htmlToPlainText(bodyHtml).trim().length > 0 && subject.trim().length > 0

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
              <button onClick={() => generate(true)} disabled={generating} className="flex items-center gap-1 text-xs text-gray-500 hover:text-purple-600 px-2 py-1 rounded disabled:opacity-50" title="Regenerate with different angles">
                <RefreshCw className={`w-3 h-3 ${generating ? 'animate-spin' : ''}`} />
                Regenerate
              </button>
            )}
            {drafts.length === 0 && (
              <button onClick={() => generate(false)} disabled={generating} className="flex items-center gap-1.5 text-xs bg-purple-600 text-white px-3 py-1.5 rounded-full hover:bg-purple-700 disabled:opacity-50">
                {generating ? (<><Loader2 className="w-3 h-3 animate-spin" />Thinking...</>) : (<><Sparkles className="w-3 h-3" />Suggest Reply</>)}
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
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${confidenceColor(d.ai_confidence)}`}>{d.ai_confidence}</span>
                    )}
                    {d.ai_flags?.subject && <span className="text-[11px] text-gray-500 truncate">{d.ai_flags.subject}</span>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => accept(d)} className="flex items-center gap-1 text-xs bg-[#647C47] text-white px-2.5 py-1 rounded-full hover:bg-[#566b3c]">
                      <Check className="w-3 h-3" />Use
                    </button>
                    <button onClick={() => dismiss(d.id)} className="p-1 text-gray-400 hover:text-red-500 rounded">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{d.draft_body}</p>
                {d.ai_flags?.rationale && <p className="mt-1.5 text-[11px] text-gray-400 italic">{d.ai_flags.rationale}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reply compose */}
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-14">To</span>
          <input value={conversation.client_email || ''} readOnly className="flex-1 text-sm px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-14">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/40" />
        </div>

        <RichReplyEditor
          html={bodyHtml}
          onChange={setBodyHtml}
          placeholder="Write your reply…"
          minHeight={200}
        />

        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {attachments.map((a, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 text-[11px] bg-gray-100 border border-gray-200 rounded-full pl-2.5 pr-1 py-0.5">
                <Paperclip className="w-3 h-3 text-gray-500" />
                <span className="truncate max-w-[160px]">{a.filename}</span>
                <span className="text-gray-400">{formatBytes(a.size)}</span>
                <button onClick={() => removeAttachment(idx)} className="p-0.5 text-gray-400 hover:text-red-500 rounded-full">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <span className="text-[11px] text-gray-400 self-center">
              {formatBytes(totalAttachBytes)} total
            </span>
          </div>
        )}

        {attachErr && <div className="text-xs text-amber-600">{attachErr}</div>}
        {sendError && <div className="text-xs text-red-600">{sendError}</div>}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 cursor-pointer px-2 py-1 rounded hover:bg-gray-50">
              <Paperclip className="w-3.5 h-3.5" />
              <span>Attach</span>
              <input type="file" multiple className="hidden" onChange={(e) => { pickFiles(e.target.files); e.target.value = '' }} />
            </label>
            {signatures.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-gray-500 px-2 py-1">
                <PenLine className="w-3.5 h-3.5" />
                <select
                  value={signatureId || ''}
                  onChange={(e) => setSignatureId(e.target.value || null)}
                  className="bg-transparent text-xs focus:outline-none"
                >
                  <option value="">No signature</option>
                  {signatures.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.is_default ? ' (default)' : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <button
            onClick={send}
            disabled={!canSend}
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

// ============================================
// Helpers
// ============================================

function sigToHtml(sig: Signature): string {
  // Wrap in a data-marker so we can swap it out if the user picks a different signature
  const content = sig.content.trim()
  // If the signature is already HTML-looking, trust it. Otherwise wrap plain text.
  const isHtml = /<[a-z][\s\S]*>/i.test(content)
  const body = isHtml ? content : content.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => `<div>${escapeHtml(l)}</div>`).join('')
  return `<div data-signature="true" style="margin-top:16px;color:#6b7280;font-size:13px;">--<br/>${body}</div>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
