'use client'

import { useEffect, useState } from 'react'
import { Plus, Loader2, Trash2, Edit3, X, Save, Star, PenLine, Check } from 'lucide-react'
import RichReplyEditor from '@/components/unified/RichReplyEditor'

interface Signature {
  id: string
  name: string
  content: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export default function EmailSignaturesPage() {
  const [signatures, setSignatures] = useState<Signature[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Signature | null>(null)
  const [showNew, setShowNew] = useState(false)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/email/signatures')
    const data = await res.json()
    if (data.success) setSignatures(data.signatures || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const setDefault = async (sig: Signature) => {
    // Optimistic
    setSignatures((prev) =>
      prev.map((s) => ({ ...s, is_default: s.id === sig.id }))
    )
    await fetch(`/api/email/signatures/${sig.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_default: true }),
    })
    load()
  }

  const remove = async (sig: Signature) => {
    if (!confirm(`Delete signature "${sig.name}"?`)) return
    await fetch(`/api/email/signatures/${sig.id}`, { method: 'DELETE' })
    setSignatures((prev) => prev.filter((s) => s.id !== sig.id))
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <PenLine className="w-5 h-5 text-[#647C47]" />
            <h1 className="text-2xl font-semibold text-gray-900">Email Signatures</h1>
          </div>
          <p className="text-sm text-gray-500">
            Your personal signatures. The default one auto-appears in the reply composer.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-[#647C47] text-white px-4 py-2 rounded-lg hover:bg-[#566b3c] text-sm flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add signature
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : signatures.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-lg">
          <PenLine className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-3">No signatures yet. Add one to auto-append on every reply.</p>
          <button onClick={() => setShowNew(true)} className="text-sm text-[#647C47] hover:underline">
            Create your first signature
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {signatures.map((s) => (
            <SignatureCard
              key={s.id}
              signature={s}
              onEdit={() => setEditing(s)}
              onDelete={() => remove(s)}
              onSetDefault={() => setDefault(s)}
            />
          ))}
        </div>
      )}

      {(showNew || editing) && (
        <SignatureModal
          signature={editing}
          existingDefault={signatures.some((s) => s.is_default)}
          onClose={() => { setShowNew(false); setEditing(null) }}
          onSaved={() => { setShowNew(false); setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function SignatureCard({
  signature, onEdit, onDelete, onSetDefault,
}: {
  signature: Signature
  onEdit: () => void
  onDelete: () => void
  onSetDefault: () => void
}) {
  return (
    <div className={`border rounded-lg p-4 ${signature.is_default ? 'bg-[#647C47]/5 border-[#647C47]/30' : 'bg-white border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-medium text-gray-900 text-sm">{signature.name}</h3>
            {signature.is_default && (
              <span className="inline-flex items-center gap-1 text-[11px] bg-[#647C47]/10 text-[#647C47] border border-[#647C47]/20 rounded-full px-1.5 py-0.5 font-medium">
                <Star className="w-2.5 h-2.5 fill-current" />
                Default
              </span>
            )}
          </div>
          <div
            className="text-sm text-gray-600 prose prose-sm max-w-none [&_p]:my-1 [&_*]:!text-sm"
            dangerouslySetInnerHTML={{ __html: signature.content }}
          />
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          {!signature.is_default && (
            <button onClick={onSetDefault} className="p-1.5 text-gray-400 hover:text-[#647C47] rounded" title="Make default">
              <Star className="w-4 h-4" />
            </button>
          )}
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-blue-600 rounded" title="Edit">
            <Edit3 className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function SignatureModal({
  signature, existingDefault, onClose, onSaved,
}: {
  signature: Signature | null
  existingDefault: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!signature
  const [name, setName] = useState(signature?.name || '')
  const [content, setContent] = useState(signature?.content || '')
  const [isDefault, setIsDefault] = useState(signature?.is_default ?? !existingDefault)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    if (!content.trim()) { setError('Signature content is required'); return }
    setSaving(true)
    setError(null)
    try {
      const url = isEdit ? `/api/email/signatures/${signature!.id}` : '/api/email/signatures'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          content: content.trim(),
          is_default: isDefault,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) { setError(data.error || 'Save failed'); setSaving(false); return }
      onSaved()
    } catch (e: any) {
      setError(e?.message || 'Network error')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{isEdit ? 'Edit signature' : 'New signature'}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Work, Casual, Arabic"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Signature</label>
            <RichReplyEditor
              html={content}
              onChange={setContent}
              placeholder="Your name, title, contact info…"
              minHeight={180}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Formatting is preserved when attached to emails.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 accent-[#647C47]"
            />
            Make this my default signature
          </label>

          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#647C47] text-white text-sm rounded-lg hover:bg-[#566b3c] disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create signature'}
          </button>
        </div>
      </div>
    </div>
  )
}
