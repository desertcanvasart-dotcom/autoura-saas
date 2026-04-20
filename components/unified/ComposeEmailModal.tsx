'use client'

import { useState } from 'react'
import { X, Send, Loader2, Paperclip } from 'lucide-react'

interface Props {
  onClose: () => void
  userId: string
  onSent?: () => void
  defaultTo?: string
  defaultSubject?: string
}

export default function ComposeEmailModal({ onClose, userId, onSent, defaultTo, defaultSubject }: Props) {
  const [to, setTo] = useState(defaultTo || '')
  const [subject, setSubject] = useState(defaultSubject || '')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const handleSend = async () => {
    if (!to || !body) { setError('Recipient and body are required'); return }
    setSending(true); setError('')
    try {
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, body, user_id: userId }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Send failed')
      onSent?.()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally { setSending(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="font-semibold text-gray-800">New Email</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-3">
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">To</label>
            <input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="recipient@example.com"
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:border-[#647C47] outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject"
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:border-[#647C47] outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Message</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={10} placeholder="Write your email..."
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:border-[#647C47] outline-none resize-y" />
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button className="text-sm text-gray-400 flex items-center gap-1"><Paperclip className="w-4 h-4" /> Attach</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
            <button onClick={handleSend} disabled={sending || !to || !body}
              className="btn-primary px-5 py-2 text-sm rounded-lg flex items-center gap-2 disabled:opacity-50">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
