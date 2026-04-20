'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { Plus, Edit, Trash2, Copy, Star, Eye, X, Loader2, Sparkles } from 'lucide-react'

interface PromptTemplate {
  id: string
  name: string
  purpose: string
  description?: string
  system_prompt?: string
  user_prompt_template: string
  variables: string[]
  model: string
  temperature: number
  max_tokens: number
  is_active: boolean
  is_default: boolean
  version: number
  created_at: string
}

const PURPOSES = [
  { value: 'itinerary_full', label: 'Full Itinerary' },
  { value: 'day_description', label: 'Day Description' },
  { value: 'site_description', label: 'Site Description' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'summary', label: 'Summary' },
  { value: 'transfer', label: 'Transfer' },
]

const MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
]

const EMPTY_FORM: Omit<PromptTemplate, 'id' | 'created_at' | 'version'> = {
  name: '', purpose: 'itinerary_full', description: '', system_prompt: '',
  user_prompt_template: '', variables: [], model: 'claude-sonnet-4-20250514',
  temperature: 0.7, max_tokens: 2000, is_active: true, is_default: false,
}

function PromptsContent() {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showView, setShowView] = useState<PromptTemplate | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const fetchPrompts = useCallback(async () => {
    try {
      const res = await fetch('/api/content-library/prompts')
      const data = await res.json()
      setPrompts(Array.isArray(data) ? data : [])
    } catch { setPrompts([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchPrompts() }, [fetchPrompts])

  const handleSave = async () => {
    setSaving(true)
    try {
      const url = '/api/content-library/prompts'
      const method = editingId ? 'PATCH' : 'POST'
      const body = editingId ? { id: editingId, ...form } : form

      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setShowForm(false)
        setEditingId(null)
        setForm(EMPTY_FORM)
        fetchPrompts()
      }
    } catch {}
    finally { setSaving(false) }
  }

  const handleEdit = (p: PromptTemplate) => {
    setForm({
      name: p.name, purpose: p.purpose, description: p.description || '',
      system_prompt: p.system_prompt || '', user_prompt_template: p.user_prompt_template,
      variables: p.variables, model: p.model, temperature: p.temperature,
      max_tokens: p.max_tokens, is_active: p.is_active, is_default: p.is_default,
    })
    setEditingId(p.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this prompt template?')) return
    await fetch(`/api/content-library/prompts?id=${id}`, { method: 'DELETE' })
    fetchPrompts()
  }

  const grouped = PURPOSES.map(p => ({
    ...p,
    prompts: prompts.filter(t => t.purpose === p.value),
  })).filter(g => g.prompts.length > 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#647C47]" /> AI Prompt Templates
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage prompts used for AI content generation</p>
          </div>
          <button
            onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true) }}
            className="btn-primary text-sm px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> New Template
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : prompts.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No prompt templates yet. Create your first one.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(group => (
              <div key={group.value}>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">{group.label}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.prompts.map(p => (
                    <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-medium text-gray-800 text-sm flex items-center gap-1.5">
                            {p.name}
                            {p.is_default && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                          </h3>
                          <p className="text-xs text-gray-400 mt-0.5">{p.model} | temp {p.temperature} | v{p.version}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setShowView(p)} className="p-1 text-gray-400 hover:text-gray-600"><Eye className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleEdit(p)} className="p-1 text-gray-400 hover:text-[#647C47]"><Edit className="w-3.5 h-3.5" /></button>
                          <button onClick={() => navigator.clipboard.writeText(p.user_prompt_template)} className="p-1 text-gray-400 hover:text-blue-500"><Copy className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete(p.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      {p.description && <p className="text-xs text-gray-500 line-clamp-2">{p.description}</p>}
                      {p.variables.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {p.variables.map(v => (
                            <span key={v} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{`{{${v}}}`}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold text-gray-800">{editingId ? 'Edit' : 'New'} Prompt Template</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Name</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:border-[#647C47] outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Purpose</label>
                  <select value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none">
                    {PURPOSES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">System Prompt</label>
                <textarea value={form.system_prompt} onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))} rows={3} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none resize-y font-mono" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">User Prompt Template <span className="text-gray-400">(use {'{{variable}}'} syntax)</span></label>
                <textarea value={form.user_prompt_template} onChange={e => setForm(f => ({ ...f, user_prompt_template: e.target.value }))} rows={6} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none resize-y font-mono" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Model</label>
                  <select value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none">
                    {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Temperature ({form.temperature})</label>
                  <input type="range" min="0" max="2" step="0.1" value={form.temperature} onChange={e => setForm(f => ({ ...f, temperature: parseFloat(e.target.value) }))} className="w-full" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Max Tokens</label>
                  <input type="number" value={form.max_tokens} onChange={e => setForm(f => ({ ...f, max_tokens: parseInt(e.target.value) || 2000 }))} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} className="rounded" />
                Set as default for this purpose
              </label>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name || !form.user_prompt_template} className="btn-primary px-4 py-2 text-sm rounded-lg disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold text-gray-800">{showView.name}</h3>
              <button onClick={() => setShowView(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div><span className="text-gray-400">Purpose:</span> <span className="font-medium">{showView.purpose}</span></div>
              <div><span className="text-gray-400">Model:</span> {showView.model} | temp {showView.temperature} | max {showView.max_tokens}</div>
              {showView.system_prompt && (
                <div><span className="text-gray-400 block mb-1">System Prompt:</span><pre className="bg-gray-50 p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">{showView.system_prompt}</pre></div>
              )}
              <div><span className="text-gray-400 block mb-1">User Prompt Template:</span><pre className="bg-gray-50 p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">{showView.user_prompt_template}</pre></div>
              {showView.variables.length > 0 && (
                <div className="flex flex-wrap gap-1">{showView.variables.map(v => <span key={v} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{`{{${v}}}`}</span>)}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PromptsPage() {
  return <Suspense fallback={<div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div></div>}><PromptsContent /></Suspense>
}
