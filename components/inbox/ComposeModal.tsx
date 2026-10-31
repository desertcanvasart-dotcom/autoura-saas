'use client'

import { useState, useEffect, useRef } from 'react'
import { useDismissOnOutside } from '@/lib/use-dismiss-on-outside'
import dynamic from 'next/dynamic'
import { replacePlaceholders, getPlaceholders } from '@/lib/template-placeholders'
import {
  X, AlertCircle, File, Minus, Image, FileText, FileImage, FileArchive, Signature,
  Users, Building2, Loader2, Paperclip, Send, Clock, ChevronDown, User, Hotel, ClipboardList,
} from 'lucide-react'
import { sanitizeEmailHtml } from '@/lib/sanitize-html'
import {
  replyRecipients, replySubject, forwardSubject, quotedOriginal, forwardedOriginal,
} from '@/lib/email/reply-rules'
import RecipientInput from './RecipientInput'
import { UNDO_SEND_MS, schedulePresets, toDateTimeLocal, scheduleTimeProblem } from '@/lib/email/scheduled-send'
import type { Email, Attachment, EmailSignature, EmailTemplate, Client } from './types'

// The tiptap editor is heavy and only needed once the compose window opens,
// so it is fetched then rather than in the inbox's first load.
const RichTextEditor = dynamic(() => import('@/components/email/RichTextEditor'), {
  ssr: false,
  loading: () => <div className="min-h-[200px] rounded-lg border border-gray-200 bg-gray-50 animate-pulse" />,
})

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

/** An attachment of the original that a forward carries over (sent server-side). */
interface CarriedAttachment {
  messageId: string
  attachmentId: string
  filename: string
  mimeType: string
  size: number
}

/** How long typing must pause before the draft is saved. */
const AUTOSAVE_DELAY_MS = 2500

/** What the composer opens with, from the mode and the message it answers. */
function initialFields(mode: ComposeMode, source: Email | null | undefined, isOwn: (a: string) => boolean) {
  if (!source || mode === 'new') return { to: '', cc: '', subject: '', quote: '', threadId: null as string | null, carried: [] as CarriedAttachment[] }
  const original = { ...source, body: sanitizeEmailHtml(source.body || '') }
  if (mode === 'forward') {
    return {
      to: '',
      cc: '',
      subject: forwardSubject(source.subject),
      quote: forwardedOriginal(original),
      threadId: null,
      carried: (source.attachments ?? []).map(a => ({
        messageId: source.id, attachmentId: a.id, filename: a.filename, mimeType: a.mimeType, size: a.size,
      })),
    }
  }
  const r = replyRecipients(original, isOwn, mode === 'replyAll')
  return {
    to: r.to.join(', '),
    cc: r.cc.join(', '),
    subject: replySubject(source.subject),
    quote: quotedOriginal(original),
    threadId: source.threadId,
    carried: [],
  }
}

const COMPOSE_TITLES: Record<ComposeMode, string> = {
  new: 'New Message', reply: 'Reply', replyAll: 'Reply all', forward: 'Forward',
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return FileImage
  if (mimeType.includes('pdf')) return FileText
  if (mimeType.includes('zip') || mimeType.includes('rar')) return FileArchive
  return File
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// UPDATED: Compose Modal Component with CLIENT + PARTNER template integration
// Replace your existing ComposeModal in app/inbox/page.tsx with this version

export default function ComposeModal({
  onClose,
  userId,
  mode = 'new',
  source = null,
  draftMessageId = null,
  draftGmailId = null,
  ownAddresses = [],
  onSent,
  onScheduled,
  clients = []
}: {
  onClose: () => void
  userId: string
  /** New message, or a reply / reply all / forward of `source`. */
  mode?: ComposeMode
  source?: Email | null
  /** Open this saved draft (its message id, as the Drafts list shows it). */
  draftMessageId?: string | null
  /** …or by its Gmail draft id (the Scheduled list's Edit). */
  draftGmailId?: string | null
  /** The mailbox's own addresses — left out of a reply all. */
  ownAddresses?: string[]
  onSent: () => void
  /** Called once the message is scheduled, with when it will go. */
  onScheduled?: (sendAt: Date) => void
  clients?: Client[]
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const ownSet = new Set(ownAddresses.map(a => a.toLowerCase()))
  const initial = useRef(initialFields(mode, source, a => ownSet.has(a.toLowerCase()))).current

  const [to, setTo] = useState(initial.to)
  const [cc, setCc] = useState(initial.cc)
  const [bcc, setBcc] = useState('')
  const [showCc, setShowCc] = useState(Boolean(initial.cc))
  const [showBcc, setShowBcc] = useState(false)
  const [subject, setSubject] = useState(initial.subject)
  const [body, setBody] = useState(initial.quote ? `<p></p>${initial.quote}` : '')
  const [threadId, setThreadId] = useState<string | null>(initial.threadId)
  const [carried, setCarried] = useState<CarriedAttachment[]>(initial.carried)

  // The Gmail draft this message is saved as, and where saving stands.
  const [draftId, setDraftId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const openingDraft = Boolean(draftMessageId || draftGmailId)
  const [loadingDraft, setLoadingDraft] = useState(openingDraft)
  // Nothing is saved until the person changes something: opening a reply and
  // closing it again must not leave a draft behind.
  const dirty = useRef(false)
  const savedSnapshot = useRef('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [signatures, setSignatures] = useState<EmailSignature[]>([])
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [showSignatureDropdown, setShowSignatureDropdown] = useState(false)
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false)
  const signatureDropdownRef = useRef<HTMLDivElement>(null)
  const templateDropdownRef = useRef<HTMLDivElement>(null)
  // The old layer was z-0 — UNDER most of the modal — so it half-worked at
  // best. See lib/use-dismiss-on-outside.ts (ported, AUT-W02).
  useDismissOnOutside(showSignatureDropdown, signatureDropdownRef, () => setShowSignatureDropdown(false))
  useDismissOnOutside(showTemplateDropdown, templateDropdownRef, () => setShowTemplateDropdown(false))

  // State for template placeholder modal
  const [showPlaceholderModal, setShowPlaceholderModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null)
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({})

  // CLIENT state
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [loadingCRMData, setLoadingCRMData] = useState(false)
  const [clientItineraries, setClientItineraries] = useState<any[]>([])
  const [selectedItineraryId, setSelectedItineraryId] = useState<string>('')
  const [crmPlaceholderData, setCrmPlaceholderData] = useState<Record<string, string>>({})

  // PARTNER state
  const [activeTab, setActiveTab] = useState<'client' | 'partner'>('client')
  const [partners, setPartners] = useState<any[]>([])
  const [selectedPartnerType, setSelectedPartnerType] = useState<string>('')
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('')
  const [loadingPartnerData, setLoadingPartnerData] = useState(false)
  const [partnerPlaceholderData, setPartnerPlaceholderData] = useState<Record<string, string>>({})

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sigRes, tempRes] = await Promise.all([
          fetch(`/api/email/signatures?userId=${userId}`),
          fetch(`/api/email/templates?userId=${userId}`)
        ])

        const sigData = await sigRes.json()
        const tempData = await tempRes.json()

        if (sigData.signatures) setSignatures(sigData.signatures)
        if (tempData.templates) setTemplates(tempData.templates)

        // A reopened draft already has its signature; anything else gets the
        // default one, above the quoted original when there is one.
        const defaultSig = sigData.signatures?.find((s: EmailSignature) => s.is_default)
        if (defaultSig && !openingDraft) {
          setBody(`<p></p><br/>${defaultSig.content}${initial.quote}`)
        }
      } catch (err) {
        console.error('Error fetching signatures/templates:', err)
      }
    }

    if (userId) fetchData()
    // Once per composer: the mode, draft and quote are fixed when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // ── Saved drafts ────────────────────────────────────────────────────────
  // Opening a draft from Drafts: everything it held, attachments included.
  useEffect(() => {
    if (!openingDraft || !userId) return
    let cancelled = false
    ;(async () => {
      try {
        const which = draftGmailId
          ? `draftId=${encodeURIComponent(draftGmailId)}`
          : `messageId=${encodeURIComponent(draftMessageId!)}`
        const res = await fetch(`/api/gmail/drafts?userId=${userId}&${which}`)
        const d = await res.json()
        if (cancelled) return
        if (!res.ok) throw new Error(d.error || 'Could not open the draft')
        setDraftId(d.draftId)
        setTo(d.to || '')
        setCc(d.cc || '')
        setBcc(d.bcc || '')
        setShowCc(Boolean(d.cc))
        setShowBcc(Boolean(d.bcc))
        setSubject(d.subject || '')
        setBody(d.body || '')
        setThreadId(d.threadId || null)
        setAttachments((d.attachments || []).map((a: Attachment) => ({ ...a })))
        savedSnapshot.current = ''
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not open the draft')
      } finally {
        if (!cancelled) setLoadingDraft(false)
      }
    })()
    return () => { cancelled = true }
  }, [draftMessageId, draftGmailId, openingDraft, userId])

  const draftPayload = () => ({
    userId, draftId, to, cc, bcc, subject, body, threadId,
    attachments: attachments.map(a => ({ filename: a.filename, mimeType: a.mimeType, data: a.data })),
  })

  // `strict`: a failure throws (scheduling needs the draft); otherwise it is
  // shown and the autosave tries again on the next edit.
  const saveDraft = async (strict = false): Promise<string | null> => {
    const payload = draftPayload()
    const snapshot = JSON.stringify(payload)
    if (snapshot === savedSnapshot.current && draftId) return draftId
    setSaveState('saving')
    try {
      const res = await fetch('/api/gmail/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: snapshot,
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not save the draft')
      savedSnapshot.current = JSON.stringify({ ...payload, draftId: d.draftId })
      setDraftId(d.draftId)
      setSaveState('saved')
      return d.draftId as string
    } catch (err) {
      setSaveState('error')
      if (strict) throw err
      return draftId
    }
  }

  // Autosave: shortly after typing stops, once something has been changed.
  useEffect(() => {
    // Only the person's own edits mark the message changed (markDirty): the
    // signature arriving or a draft loading must not save anything.
    if (loadingDraft || !dirty.current || sending) return
    const t = setTimeout(() => { void saveDraft() }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, cc, bcc, subject, body, attachments, loadingDraft])

  const markDirty = () => { dirty.current = true }

  // Closing keeps what was written: the draft is saved first.
  const handleClose = () => {
    if (dirty.current && !sending) void saveDraft()
    onClose()
  }

  const discardDraft = async () => {
    dirty.current = false
    if (draftId) {
      await fetch(`/api/gmail/drafts?userId=${userId}&draftId=${encodeURIComponent(draftId)}`, { method: 'DELETE' }).catch(() => {})
    }
    onClose()
  }

  // Fetch partners when type changes
  const fetchPartners = async (type: string) => {
    if (!type) {
      setPartners([])
      return
    }

    setLoadingPartnerData(true)
    try {
      const response = await fetch(`/api/partners?type=${type}`)
      const data = await response.json()
      setPartners(data.partners || [])
    } catch (err) {
      console.error('Error fetching partners:', err)
    } finally {
      setLoadingPartnerData(false)
    }
  }

  // Fetch partner template data
  const fetchPartnerTemplateData = async (partnerId: string, type: string) => {
    if (!partnerId || !type) return

    setLoadingPartnerData(true)
    try {
      const response = await fetch(`/api/partners/${partnerId}/template-data?type=${type}`)
      const data = await response.json()

      if (data.placeholderData) {
        setPartnerPlaceholderData(data.placeholderData)

        // Auto-fill "To" field with partner email
        if (data.placeholderData.partner_email) {
          setTo(data.placeholderData.partner_email)
        }
      }
    } catch (err) {
      console.error('Error fetching partner template data:', err)
    } finally {
      setLoadingPartnerData(false)
    }
  }

  // Handle partner type change
  const handlePartnerTypeChange = (type: string) => {
    setSelectedPartnerType(type)
    setSelectedPartnerId('')
    setPartnerPlaceholderData({})
    fetchPartners(type)
  }

  // Handle partner selection
  const handlePartnerChange = (partnerId: string) => {
    setSelectedPartnerId(partnerId)
    if (partnerId && selectedPartnerType) {
      fetchPartnerTemplateData(partnerId, selectedPartnerType)
    }
  }

  // CLIENT functions (existing)
  const fetchClientCRMData = async (clientId: string) => {
    if (!clientId) {
      setClientItineraries([])
      setSelectedItineraryId('')
      setCrmPlaceholderData({})
      return
    }

    setLoadingCRMData(true)
    try {
      const response = await fetch(`/api/clients/${clientId}/template-data?userId=${userId}`)
      const data = await response.json()

      if (data.error) {
        console.error('Error fetching CRM data:', data.error)
        return
      }

      setClientItineraries(data.allItineraries || [])

      if (data.latestItinerary) {
        setSelectedItineraryId(data.latestItinerary.id)
      }

      setCrmPlaceholderData(data.placeholderData || {})

      const client = clients.find(c => c.id === clientId)
      if (client?.email) {
        setTo(client.email)
      }

    } catch (err) {
      console.error('Error fetching client CRM data:', err)
    } finally {
      setLoadingCRMData(false)
    }
  }

  const fetchItineraryData = async (clientId: string, itineraryId: string) => {
    if (!clientId || !itineraryId) return

    setLoadingCRMData(true)
    try {
      const response = await fetch(
        `/api/clients/${clientId}/template-data?userId=${userId}&itineraryId=${itineraryId}`
      )
      const data = await response.json()

      if (data.placeholderData) {
        setCrmPlaceholderData(data.placeholderData)
      }
    } catch (err) {
      console.error('Error fetching itinerary data:', err)
    } finally {
      setLoadingCRMData(false)
    }
  }

  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId)
    setSelectedItineraryId('')
    fetchClientCRMData(clientId)
  }

  const handleItineraryChange = (itineraryId: string) => {
    setSelectedItineraryId(itineraryId)
    if (selectedClientId && itineraryId) {
      fetchItineraryData(selectedClientId, itineraryId)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const maxSize = 25 * 1024 * 1024

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      if (file.size > maxSize) {
        setError(`File "${file.name}" is too large. Maximum size is 25MB.`)
        continue
      }

      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        markDirty()
        setAttachments(prev => [...prev, {
          filename: file.name,
          mimeType: file.type,
          data: base64,
          size: file.size
        }])
      }
      reader.readAsDataURL(file)
    }

    e.target.value = ''
  }

  const removeAttachment = (index: number) => {
    markDirty()
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const insertSignature = (signature: EmailSignature) => {
    markDirty()
    setBody(prev => `${prev}<br/>${signature.content}`)
    setShowSignatureDropdown(false)
  }

  const applyTemplate = (template: EmailTemplate) => {
    const placeholders = getPlaceholders(template.content + ' ' + template.subject)

    if (placeholders.length > 0) {
      setSelectedTemplate(template)
      setPlaceholderValues({})
      if (!selectedClientId) {
        setCrmPlaceholderData({})
      }
      if (!selectedPartnerId) {
        setPartnerPlaceholderData({})
      }
      setShowPlaceholderModal(true)
    } else {
      markDirty()
      setSubject(template.subject)
      setBody(template.content)
    }
    setShowTemplateDropdown(false)
  }

  const applyTemplateWithPlaceholders = () => {
    if (!selectedTemplate) return

    // Merge data: CRM client data + Partner data + manual overrides
    const finalData = { 
      ...crmPlaceholderData, 
      ...partnerPlaceholderData,
      ...placeholderValues 
    }

    const processedSubject = replacePlaceholders(selectedTemplate.subject, finalData)
    // The body is HTML: values are escaped, or a client's "&" / "<" became
    // markup in the email (documents audit, round 12). The subject is plain.
    const processedContent = replacePlaceholders(selectedTemplate.content, finalData, { escape: true })

    markDirty()
    setSubject(processedSubject)
    setBody(processedContent)
    setShowPlaceholderModal(false)
    setSelectedTemplate(null)
  }

  // ── Undo send / schedule send ────────────────────────────────────────────
  // Send waits UNDO_SEND_MS with an Undo before the email really goes. The
  // message is saved to Drafts first, so leaving the page in those seconds
  // loses nothing: it is waiting in Drafts, unsent.
  const [pendingUntil, setPendingUntil] = useState<number | null>(null)
  const [, setTick] = useState(0)
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (sendTimer.current) clearTimeout(sendTimer.current) }, [])
  useEffect(() => {
    if (pendingUntil === null) return
    const t = setInterval(() => setTick(n => n + 1), 250)
    return () => clearInterval(t)
  }, [pendingUntil])

  const readyToSend = (): boolean => {
    if (!to.trim() || !subject.trim() || !body) {
      setError('Add a recipient, a subject and a message')
      return false
    }
    return true
  }

  const handleSend = async () => {
    if (!readyToSend() || pendingUntil !== null) return
    setError(null)
    if (dirty.current) await saveDraft()
    setPendingUntil(Date.now() + UNDO_SEND_MS)
    sendTimer.current = setTimeout(() => { sendTimer.current = null; void doSend() }, UNDO_SEND_MS)
  }

  const undoSend = () => {
    if (sendTimer.current) clearTimeout(sendTimer.current)
    sendTimer.current = null
    setPendingUntil(null)
  }

  const sendNow = () => {
    if (sendTimer.current) clearTimeout(sendTimer.current)
    sendTimer.current = null
    void doSend()
  }

  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const scheduleRef = useRef<HTMLDivElement>(null)
  useDismissOnOutside(showSchedule, scheduleRef, () => setShowSchedule(false))

  const handleSchedule = async (at: Date) => {
    if (!readyToSend()) return
    const problem = scheduleTimeProblem(at.toISOString())
    if (problem) { setError(problem); return }
    setScheduling(true)
    setError(null)
    try {
      // The scheduled email IS the saved draft: save the latest first.
      markDirty()
      const id = await saveDraft(true)
      if (!id) throw new Error('Could not save the message')
      const res = await fetch('/api/gmail/scheduled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, draftId: id, sendAt: at.toISOString() }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not schedule the email')
      dirty.current = false
      setShowSchedule(false)
      onScheduled?.(at)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not schedule the email')
    } finally {
      setScheduling(false)
    }
  }

  const doSend = async () => {
    setSending(true)
    setError(null)

    try {
      const response = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          to,
          cc: cc || undefined,
          bcc: bcc || undefined,
          subject,
          body,
          threadId: threadId ?? undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
          // The forward's original attachments, fetched by the server.
          forward_attachments: carried.length > 0
            ? carried.map(({ messageId, attachmentId, filename, mimeType }) => ({ messageId, attachmentId, filename, mimeType }))
            : undefined,
          // The saved draft this send replaces — removed once sent.
          gmail_draft_id: draftId ?? undefined,
        }),
      })

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      dirty.current = false
      onSent()
    } catch (err: any) {
      // Back to the message, with the reason: nothing was sent.
      setError(err.message)
      setPendingUntil(null)
    } finally {
      setSending(false)
    }
  }

  if (pendingUntil !== null) {
    const seconds = Math.max(0, Math.ceil((pendingUntil - Date.now()) / 1000))
    return (
      <div
        role="status"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-4 py-3 bg-gray-900 text-white text-sm rounded-lg shadow-xl"
      >
        {sending ? (
          <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Sending…</span>
        ) : (
          <>
            <span>Sending in {seconds}s…</span>
            <button type="button" onClick={undoSend} className="font-semibold text-primary-200 hover:text-white">Undo</button>
            <button type="button" onClick={sendNow} className="text-gray-300 hover:text-white">Send now</button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className={`bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full transition-all duration-300 ${
        isExpanded ? 'sm:max-w-4xl sm:h-[85vh]' : 'sm:max-w-2xl'
      } max-h-[95vh] flex flex-col`}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">
              {openingDraft ? 'Draft' : COMPOSE_TITLES[mode]}
            </h3>
            {/* Where the autosave stands — the person can see their work is kept. */}
            <span className="text-xs text-gray-400" aria-live="polite">
              {loadingDraft ? 'Opening draft…'
                : saveState === 'saving' ? 'Saving…'
                : saveState === 'saved' ? 'Saved to Drafts'
                : saveState === 'error' ? 'Not saved — check your connection'
                : ''}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors hidden sm:block"
              title={isExpanded ? 'Minimize' : 'Expand'}
            >
              <Minus className="w-4 h-4 text-gray-500" />
            </button>
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close (saved to Drafts)"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Form */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          <RecipientInput
            label="To"
            value={to}
            onChange={v => { markDirty(); setTo(v) }}
            placeholder="recipient@example.com"
            trailing={
              <div className="flex items-center gap-2 ml-2 text-xs">
                {!showCc && (
                  <button type="button" onClick={() => setShowCc(true)} className="text-gray-500 hover:text-gray-800">Cc</button>
                )}
                {!showBcc && (
                  <button type="button" onClick={() => setShowBcc(true)} className="text-gray-500 hover:text-gray-800">Bcc</button>
                )}
              </div>
            }
          />
          {showCc && (
            <RecipientInput label="Cc" value={cc} onChange={v => { markDirty(); setCc(v) }} placeholder="Copy to" />
          )}
          {showBcc && (
            <RecipientInput label="Bcc" value={bcc} onChange={v => { markDirty(); setBcc(v) }} placeholder="Blind copy — hidden from other recipients" />
          )}

          <div className="flex items-center px-5 py-2.5 border-b border-gray-100">
            <label className="w-16 text-xs font-medium text-gray-400">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => { markDirty(); setSubject(e.target.value) }}
              className="flex-1 text-sm outline-none bg-transparent"
              placeholder="Email subject"
            />
          </div>

               {/* Templates & Signatures */}
<div className="flex items-center justify-end gap-1 px-4 py-2 border-b border-gray-100 bg-gray-50/50">
{templates.length > 0 && (
  <div className="relative" ref={templateDropdownRef}>
    <button 
      onClick={() => setShowTemplateDropdown(!showTemplateDropdown)} 
      className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
    >
      <FileText className="w-3.5 h-3.5" />
      Templates
    </button>
    {showTemplateDropdown && (
      <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 max-h-96 overflow-y-auto">
        {['customer', 'partner', 'internal'].map(category => {
          const categoryTemplates = templates.filter(t => t.category === category)
          if (categoryTemplates.length === 0) return null

          return (
            <div key={category}>
              <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 sticky top-0">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider inline-flex items-center gap-1.5">
                  {category === 'customer' && <><User className="w-3.5 h-3.5" />Customer Templates</>}
                  {category === 'partner' && <><Hotel className="w-3.5 h-3.5" />Partner Templates</>}
                  {category === 'internal' && <><ClipboardList className="w-3.5 h-3.5" />Internal Templates</>}
                </span>
              </div>
              {categoryTemplates.map((template) => (
                <button 
                  key={template.id} 
                  onClick={() => template.channel !== 'whatsapp' && applyTemplate(template)} 
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-50 ${
                    template.channel === 'whatsapp' ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  title={template.channel === 'whatsapp' ? 'WhatsApp only - cannot use in email' : ''}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{template.name}</span>
                    {template.channel === 'whatsapp' && (
                      <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                        WA only
                      </span>
                    )}
                    {template.channel === 'both' && (
                      <span className="text-xs px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded">
                        +WA
                      </span>
                    )}
                  </div>
                  {template.subject && (
                    <span className="block text-gray-500 truncate mt-0.5">
                      {template.subject}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    )}
  </div>
)}

        {signatures.length > 0 && (
              <div className="relative" ref={signatureDropdownRef}>
                <button 
                  onClick={() => setShowSignatureDropdown(!showSignatureDropdown)} 
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
                >
                  <Signature className="w-3.5 h-3.5" />
                  Signatures
                </button>
                {showSignatureDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                    {signatures.map((sig) => (
                      <button 
                        key={sig.id} 
                        onClick={() => insertSignature(sig)} 
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center justify-between"
                      >
                        <span className="font-medium text-gray-900">{sig.name}</span>
                        {sig.is_default && (
                          <span className="text-xs px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded">
                            Default
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Rich Text Editor */}
          {/* The editor re-formats content it is given (the signature, the
              quoted original) and reports that as a change, so only the
              person's own typing, pasting or dropping counts as an edit. */}
          <div className="flex-1 p-4" onKeyDown={markDirty} onPaste={markDirty} onDrop={markDirty}>
            <RichTextEditor
              content={body}
              onChange={setBody}
              placeholder="Write your message..."
              minHeight={isExpanded ? '350px' : '200px'}
              maxHeight={isExpanded ? '500px' : '300px'}
            />
          </div>

          {/* The forwarded message's own attachments — sent with it unless removed. */}
          {carried.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
              <p className="text-xs font-medium text-gray-600 mb-2">
                Forwarded attachments ({carried.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {carried.map((file, index) => {
                  const FileIcon = getFileIcon(file.mimeType)
                  return (
                    <div key={`${file.attachmentId}-${index}`} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200">
                      <FileIcon className="w-4 h-4 text-gray-400" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate max-w-[150px]">{file.filename}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                      </div>
                      <button
                        onClick={() => { markDirty(); setCarried(prev => prev.filter((_, i) => i !== index)) }}
                        className="p-1 hover:bg-gray-100 rounded"
                        title="Don't forward this attachment"
                      >
                        <X className="w-3 h-3 text-gray-400" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
              <p className="text-xs font-medium text-gray-600 mb-2">
                Attachments ({attachments.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {attachments.map((file, index) => {
                  const FileIcon = getFileIcon(file.mimeType)
                  return (
                    <div 
                      key={index} 
                      className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200"
                    >
                      <FileIcon className="w-4 h-4 text-gray-400" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate max-w-[150px]">
                          {file.filename}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <button 
                        onClick={() => removeAttachment(index)} 
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <X className="w-3 h-3 text-gray-400" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50/80">
          <div className="flex items-center gap-1">
            <input 
              ref={fileInputRef} 
              type="file" 
              multiple 
              onChange={handleFileSelect} 
              className="hidden" 
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.rar" 
            />
            <input 
              ref={imageInputRef} 
              type="file" 
              multiple 
              onChange={handleFileSelect} 
              className="hidden" 
              accept="image/*" 
            />
            <button 
              onClick={() => fileInputRef.current?.click()} 
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors" 
              title="Attach file"
            >
              <Paperclip className="w-4 h-4 text-gray-500" />
            </button>
            <button 
              onClick={() => imageInputRef.current?.click()} 
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors" 
              title="Insert image"
            >
              <Image className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={discardDraft}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              title="Delete this message and its saved draft"
            >
              Discard
            </button>
            <div className="relative" ref={scheduleRef}>
              <button
                type="button"
                onClick={() => {
                  setScheduleAt(toDateTimeLocal(schedulePresets()[0].at))
                  setShowSchedule(v => !v)
                }}
                disabled={sending || loadingDraft || scheduling}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 disabled:opacity-50"
                title="Schedule send"
              >
                <Clock className="w-4 h-4" />
                Schedule
                <ChevronDown className="w-3 h-3" />
              </button>
              {showSchedule && (
                <div className="absolute right-0 bottom-full mb-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-30" role="dialog" aria-label="Schedule send">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Schedule send</p>
                  {schedulePresets().map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleSchedule(p.at)}
                      disabled={scheduling}
                      className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded hover:bg-gray-50 disabled:opacity-50"
                    >
                      <span>{p.label}</span>
                      <span className="text-xs text-gray-500">
                        {p.at.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </button>
                  ))}
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <label className="block text-xs text-gray-500 mb-1" htmlFor="schedule-at">Pick a date and time</label>
                    <div className="flex gap-2">
                      <input
                        id="schedule-at"
                        type="datetime-local"
                        value={scheduleAt}
                        min={toDateTimeLocal(new Date(Date.now() + 120_000))}
                        onChange={e => setScheduleAt(e.target.value)}
                        className="flex-1 min-w-0 text-sm border border-gray-200 rounded px-2 py-1"
                      />
                      <button
                        type="button"
                        onClick={() => handleSchedule(new Date(scheduleAt))}
                        disabled={scheduling || !scheduleAt}
                        className="px-3 py-1 text-sm font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-50"
                      >
                        {scheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Schedule'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button 
              onClick={handleSend} 
              disabled={sending || loadingDraft}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Placeholder Modal with CLIENT + PARTNER tabs */}
      {showPlaceholderModal && selectedTemplate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowPlaceholderModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Fill Template: {selectedTemplate.name}</h3>
              <button onClick={() => setShowPlaceholderModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Tab selector */}
              <div className="flex border border-gray-200 rounded-lg p-1 bg-gray-50">
                <button
                  onClick={() => setActiveTab('client')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'client' 
                      ? 'bg-white text-primary-700 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Client
                </button>
                <button
                  onClick={() => setActiveTab('partner')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'partner' 
                      ? 'bg-white text-primary-700 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  Partner
                </button>
              </div>

              {/* CLIENT TAB */}
              {activeTab === 'client' && (
                <div className="p-4 bg-primary-50 rounded-lg border border-primary-100">
                  <p className="text-xs font-semibold text-primary-800 mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Load Client from CRM
                  </p>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Select Client
                      </label>
                      <select
                        value={selectedClientId}
                       onChange={(e) => handleClientChange(e.target.value)}
                       className="w-full h-11 px-3 text-sm border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
                       >
                        <option value="">-- Select a client --</option>
                        {clients.map(client => (
                          <option key={client.id} value={client.id}>
                            {client.name} ({client.email})
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedClientId && clientItineraries.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Select Trip/Itinerary
                        </label>
                        <select
                          value={selectedItineraryId}
                          onChange={(e) => handleItineraryChange(e.target.value)}
                          className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white"
                        >
                          <option value="">-- Select an itinerary --</option>
                          {clientItineraries.map((itin: any) => (
                            <option key={itin.id} value={itin.id}>
                              {itin.itinerary_code} - {itin.trip_name} ({itin.start_date})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {selectedClientId && clientItineraries.length === 0 && !loadingCRMData && (
                      <p className="text-xs text-gray-500 italic">No itineraries found for this client</p>
                    )}

                    {loadingCRMData && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Loading CRM data...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Show loaded CLIENT values */}
              {activeTab === 'client' && selectedClientId && Object.keys(crmPlaceholderData).length > 0 && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-xs font-medium text-green-800 mb-2">✓ Client data loaded:</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {crmPlaceholderData.client_name && (
                      <div><span className="text-gray-500">Client:</span> {crmPlaceholderData.client_name}</div>
                    )}
                    {crmPlaceholderData.trip_name && (
                      <div><span className="text-gray-500">Trip:</span> {crmPlaceholderData.trip_name}</div>
                    )}
                    {crmPlaceholderData.total && (
                      <div><span className="text-gray-500">Total:</span> {crmPlaceholderData.total}</div>
                    )}
                    {crmPlaceholderData.deposit && (
                      <div><span className="text-gray-500">Deposit:</span> {crmPlaceholderData.deposit}</div>
                    )}
                    {crmPlaceholderData.trip_dates && (
                      <div className="col-span-2"><span className="text-gray-500">Dates:</span> {crmPlaceholderData.trip_dates}</div>
                    )}
                  </div>
                </div>
              )}

              {/* PARTNER TAB */}
              {activeTab === 'partner' && (
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-xs font-semibold text-amber-800 mb-3 flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Load Partner from Resources
                  </p>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Partner Type
                      </label>
                      <select
                         value={selectedPartnerType}
                         onChange={(e) => handlePartnerTypeChange(e.target.value)}
                         className="w-full h-11 px-3 text-sm border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                           >
                        <option value="">-- Select type --</option>
                        <option value="hotel">Hotels</option>
                        <option value="guide">Tour Guides</option>
                        <option value="restaurant">Restaurants</option>
                        <option value="airport_staff">Airport Staff</option>
                      </select>
                    </div>

                    {selectedPartnerType && partners.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Select Partner
                        </label>
                        <select
                          value={selectedPartnerId}
                          onChange={(e) => handlePartnerChange(e.target.value)}
                          className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                        >
                          <option value="">-- Select partner --</option>
                          {partners.map((partner: any) => (
                            <option key={partner.id} value={partner.id}>
                              {partner.name} {partner.city ? `(${partner.city})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {selectedPartnerType && partners.length === 0 && !loadingPartnerData && (
                      <p className="text-xs text-gray-500 italic">No {selectedPartnerType}s found</p>
                    )}

                    {loadingPartnerData && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Loading partner data...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Show loaded PARTNER values */}
              {activeTab === 'partner' && selectedPartnerId && Object.keys(partnerPlaceholderData).length > 0 && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-xs font-medium text-green-800 mb-2">✓ Partner data loaded:</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {partnerPlaceholderData.partner_name && (
                      <div><span className="text-gray-500">Name:</span> {partnerPlaceholderData.partner_name}</div>
                    )}
                    {partnerPlaceholderData.partner_type && (
                      <div><span className="text-gray-500">Type:</span> {partnerPlaceholderData.partner_type}</div>
                    )}
                    {partnerPlaceholderData.contact_person && (
                      <div><span className="text-gray-500">Contact:</span> {partnerPlaceholderData.contact_person}</div>
                    )}
                    {partnerPlaceholderData.partner_email && (
                      <div><span className="text-gray-500">Email:</span> {partnerPlaceholderData.partner_email}</div>
                    )}
                    {partnerPlaceholderData.partner_phone && (
                      <div><span className="text-gray-500">Phone:</span> {partnerPlaceholderData.partner_phone}</div>
                    )}
                    {partnerPlaceholderData.partner_city && (
                      <div><span className="text-gray-500">City:</span> {partnerPlaceholderData.partner_city}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Manual override fields */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-medium text-gray-500 mb-3">
                  Override values (optional):
                </p>
                {getPlaceholders(selectedTemplate.content + ' ' + selectedTemplate.subject).map(placeholder => (
                  <div key={placeholder} className="mb-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">
                      {placeholder.replace(/_/g, ' ')}
                    </label>
                    <input
                      type="text"
                      value={placeholderValues[placeholder] || ''}
                      onChange={(e) => setPlaceholderValues(prev => ({
                        ...prev,
                        [placeholder]: e.target.value
                      }))}
                      placeholder={
                        crmPlaceholderData[placeholder] || 
                        partnerPlaceholderData[placeholder] || 
                        `Enter ${placeholder.replace(/_/g, ' ')}`
                      }
                      className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    />
                    {(crmPlaceholderData[placeholder] || partnerPlaceholderData[placeholder]) && !placeholderValues[placeholder] && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Will use: {crmPlaceholderData[placeholder] || partnerPlaceholderData[placeholder]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowPlaceholderModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={applyTemplateWithPlaceholders}
                disabled={loadingCRMData || loadingPartnerData}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                Apply Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
