'use client'

import { useEffect, useState } from 'react'
import { Plus, Loader2, Trash2, Edit3, X, Save, BookOpen, FileText, MapPin, HelpCircle, Sparkles, Power } from 'lucide-react'

type SourceType = 'kb_faq' | 'kb_policy' | 'kb_tour' | 'kb_custom'

interface Entry {
  id: string
  source_type: SourceType
  title: string | null
  query_text: string
  answer_text: string
  metadata: { question?: string | null; total_chunks?: number }
  is_active: boolean
  updated_at: string
}

const TYPE_META: Record<SourceType, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; hint: string }> = {
  kb_faq:    { label: 'FAQ',          icon: HelpCircle, color: 'text-blue-600 bg-blue-50 border-blue-200',       hint: 'Question + answer pairs the copilot should know.' },
  kb_policy: { label: 'Policy',       icon: FileText,   color: 'text-red-600 bg-red-50 border-red-200',           hint: 'Cancellation, refunds, terms — authoritative rules.' },
  kb_tour:   { label: 'Tour',         icon: MapPin,     color: 'text-green-600 bg-green-50 border-green-200',     hint: 'Tour descriptions, itineraries, what\'s included.' },
  kb_custom: { label: 'Other',        icon: BookOpen,   color: 'text-purple-600 bg-purple-50 border-purple-200',  hint: 'Anything else the copilot should draw on.' },
}

export default function CopilotKnowledgePage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<SourceType | 'all'>('all')
  const [editing, setEditing] = useState<Entry | null>(null)
  const [showNew, setShowNew] = useState(false)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/copilot/knowledge')
    const data = await res.json()
    if (data.success) setEntries(data.entries)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const visible = filter === 'all' ? entries : entries.filter((e) => e.source_type === filter)

  const toggleActive = async (entry: Entry) => {
    await fetch(`/api/copilot/knowledge/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !entry.is_active }),
    })
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, is_active: !e.is_active } : e)))
  }

  const remove = async (entry: Entry) => {
    if (!confirm(`Delete "${entry.title || entry.query_text.slice(0, 40)}"?`)) return
    await fetch(`/api/copilot/knowledge/${entry.id}`, { method: 'DELETE' })
    setEntries((prev) => prev.filter((e) => e.id !== entry.id))
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <h1 className="text-2xl font-semibold text-gray-900">Copilot Knowledge Base</h1>
          </div>
          <p className="text-sm text-gray-500">
            Everything your AI copilot draws on when drafting replies. Scoped to your workspace.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
        >
          <Plus className="w-4 h-4" />
          Add entry
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} label={`All (${entries.length})`} />
        {(Object.keys(TYPE_META) as SourceType[]).map((t) => {
          const count = entries.filter((e) => e.source_type === t).length
          return (
            <FilterPill
              key={t}
              active={filter === t}
              onClick={() => setFilter(t)}
              label={`${TYPE_META[t].label} (${count})`}
            />
          )
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-lg">
          <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-3">No entries yet. Start by adding an FAQ or policy.</p>
          <button onClick={() => setShowNew(true)} className="text-sm text-purple-600 hover:underline">
            Add your first entry
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              onEdit={() => setEditing(e)}
              onDelete={() => remove(e)}
              onToggle={() => toggleActive(e)}
            />
          ))}
        </div>
      )}

      {(showNew || editing) && (
        <EntryModal
          entry={editing}
          onClose={() => { setShowNew(false); setEditing(null) }}
          onSaved={() => { setShowNew(false); setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function FilterPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs ${active ? 'bg-purple-600 text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'}`}
    >
      {label}
    </button>
  )
}

function EntryCard({ entry, onEdit, onDelete, onToggle }: { entry: Entry; onEdit: () => void; onDelete: () => void; onToggle: () => void }) {
  const meta = TYPE_META[entry.source_type]
  const Icon = meta.icon
  return (
    <div className={`border rounded-lg p-4 ${entry.is_active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border ${meta.color}`}>
              <Icon className="w-3 h-3" />
              {meta.label}
            </span>
            {!entry.is_active && <span className="text-[11px] text-gray-400">disabled</span>}
            {(entry.metadata?.total_chunks || 1) > 1 && (
              <span className="text-[11px] text-gray-400">{entry.metadata.total_chunks} chunks</span>
            )}
          </div>
          {entry.title && <h3 className="font-medium text-gray-900 text-sm mb-1">{entry.title}</h3>}
          {entry.source_type === 'kb_faq' && entry.metadata?.question && (
            <p className="text-sm text-gray-700 mb-1"><span className="font-medium">Q:</span> {entry.metadata.question}</p>
          )}
          <p className="text-sm text-gray-600 line-clamp-2">{entry.answer_text}</p>
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <button onClick={onToggle} className="p-1.5 text-gray-400 hover:text-purple-600 rounded" title={entry.is_active ? 'Disable' : 'Enable'}>
            <Power className="w-4 h-4" />
          </button>
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

function EntryModal({ entry, onClose, onSaved }: { entry: Entry | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!entry
  const [sourceType, setSourceType] = useState<SourceType>(entry?.source_type || 'kb_faq')
  const [title, setTitle] = useState(entry?.title || '')
  const [question, setQuestion] = useState(entry?.metadata?.question || '')
  const [content, setContent] = useState(entry?.answer_text || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!content.trim()) { setError('Content is required'); return }
    if (sourceType === 'kb_faq' && !question.trim()) { setError('Question is required for FAQ'); return }
    setSaving(true)
    setError(null)
    try {
      const url = isEdit ? `/api/copilot/knowledge/${entry!.id}` : '/api/copilot/knowledge'
      const method = isEdit ? 'PATCH' : 'POST'
      const body: Record<string, any> = { content, title: title || null }
      if (!isEdit) body.source_type = sourceType
      if (sourceType === 'kb_faq') body.question = question
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.success) { setError(data.error || 'Save failed'); setSaving(false); return }
      onSaved()
    } catch (e: any) {
      setError(e?.message || 'Network error')
      setSaving(false)
    }
  }

  const meta = TYPE_META[sourceType]

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{isEdit ? 'Edit entry' : 'Add knowledge entry'}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {!isEdit && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(TYPE_META) as SourceType[]).map((t) => {
                  const m = TYPE_META[t]
                  const Icon = m.icon
                  return (
                    <button
                      key={t}
                      onClick={() => setSourceType(t)}
                      className={`text-left p-3 rounded-lg border text-sm ${sourceType === t ? `${m.color} ring-2 ring-purple-300` : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                      <div className="flex items-center gap-2 font-medium mb-0.5">
                        <Icon className="w-4 h-4" />
                        {m.label}
                      </div>
                      <p className="text-[11px] text-gray-500 leading-tight">{m.hint}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Title (optional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={sourceType === 'kb_tour' ? 'e.g. Pyramids Day Tour' : sourceType === 'kb_policy' ? 'e.g. Cancellation Policy' : 'A short label'}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>

          {sourceType === 'kb_faq' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Question</label>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What customers typically ask"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              {sourceType === 'kb_faq' ? 'Answer' : 'Content'}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={sourceType === 'kb_faq' ? 'How the copilot should answer' : meta.hint}
              rows={10}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 font-mono"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Long content is automatically split into chunks for better retrieval.
            </p>
          </div>

          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add entry'}
          </button>
        </div>
      </div>
    </div>
  )
}
